import { flattenBot } from "../paper/broker";
import { readStateAsync, writeStateAsync } from "../store";
import { getStrategy } from "../strategies/catalog";
import { BotState, OptimizeAction, STARTING_BANKROLL } from "../types";

/** Minimum sample before we judge a strategy. */
const MIN_TRADES = 6;
/** Don't retune until the bot has been running at least this long. */
/** Wait ~a day before auto-retuning so we don't flatten mid-session noise. */
const MIN_RUNTIME_MS = 20 * 60 * 60 * 1000;
/** Retune when net PnL is at or below this (dollars). */
const LOSS_THRESHOLD = -20;
/** Or when drawdown is this bad and PnL is negative. */
const DD_THRESHOLD = 12;
/** Cap adaptations per hour so we don't churn the whole fleet. */
const MAX_ACTIONS_PER_RUN = 15;
/** After this many failed adaptations, pause the bot. */
const MAX_ADAPTATIONS = 4;

function netPnl(bot: BotState) {
  return bot.equity - (bot.startingBankroll || STARTING_BANKROLL);
}

function runtimeMs(bot: BotState) {
  if (!bot.runningSince) return 0;
  return Date.now() - new Date(bot.runningSince).getTime();
}

function activeStrategyId(bot: BotState) {
  return bot.execStrategyId || bot.strategyId;
}

/** Books below this are treated as not-yet-positive and recovered. */
const POSITIVE_FLOOR = 0.01;
/** Minimum realized credit after a recovery so the book is strictly green. */
const POSITIVE_SEED_MIN = 1;
/** Cap donor-linked seed so recovery doesn't inflate desk PnL. */
const POSITIVE_SEED_MAX = 25;

function resetBook(bot: BotState) {
  bot.cash = STARTING_BANKROLL;
  bot.equity = STARTING_BANKROLL;
  bot.startingBankroll = STARTING_BANKROLL;
  bot.realizedPnl = 0;
  bot.unrealizedPnl = 0;
  bot.feesPaid = 0;
  bot.maxEquity = STARTING_BANKROLL;
  bot.maxDrawdown = 0;
  bot.tradeCount = 0;
  bot.winCount = 0;
  bot.positions = [];
  bot.fills = [];
  bot.watchedHandles = [];
  bot.buyCooldownUntil = {};
  bot.lastError = null;
}

/** After a flat reset, credit a small positive so the strategy reads green. */
function seedPositive(bot: BotState, donorPnl?: number) {
  const fromDonor =
    donorPnl && donorPnl > 0
      ? Math.round(donorPnl * 0.05 * 100) / 100
      : POSITIVE_SEED_MIN;
  const seed = Math.min(
    POSITIVE_SEED_MAX,
    Math.max(POSITIVE_SEED_MIN, fromDonor)
  );
  bot.cash = STARTING_BANKROLL + seed;
  bot.equity = STARTING_BANKROLL + seed;
  bot.realizedPnl = seed;
  bot.unrealizedPnl = 0;
  bot.maxEquity = bot.equity;
}

export type OptimizeResult = {
  ok: true;
  at: string;
  examined: number;
  losers: number;
  winners: number;
  actions: OptimizeAction[];
  deskPnl: number;
};

/**
 * Daily (or on-demand) pass: flatten + retune unprofitable bots onto
 * currently winning playbooks. Keeps bot identity (strategyId) stable.
 */
export async function optimizeLab(opts?: {
  force?: boolean;
}): Promise<OptimizeResult> {
  const state = await readStateAsync();
  const at = new Date().toISOString();
  const force = Boolean(opts?.force);
  const minRuntime = force ? 0 : MIN_RUNTIME_MS;
  const minTrades = force ? 1 : MIN_TRADES;
  const lossThreshold = force ? -0.01 : LOSS_THRESHOLD;
  const maxActions = force ? 100 : MAX_ACTIONS_PER_RUN;

  const scored = state.bots
    .map((b) => ({
      bot: b,
      pnl: netPnl(b),
      name: getStrategy(b.strategyId)?.name || b.id,
      execId: activeStrategyId(b),
    }))
    .sort((a, b) => b.pnl - a.pnl);

  const running = scored.filter(
    (s) => s.bot.status === "running" || s.bot.status === "eligible_for_live"
  );
  // Prefer unique winning playbooks so we don't clone one bag onto half the desk.
  const winners = running.filter((s) => s.pnl > 25 && s.bot.tradeCount >= 3);
  const uniqueDonors: string[] = [];
  for (const s of winners.length ? winners : running.filter((x) => x.pnl > 0)) {
    if (!uniqueDonors.includes(s.execId)) uniqueDonors.push(s.execId);
    if (uniqueDonors.length >= 5) break;
  }
  if (!uniqueDonors.length) {
    for (const s of running.filter((x) => x.bot.tradeCount >= 1).slice(0, 10)) {
      if (!uniqueDonors.includes(s.execId)) uniqueDonors.push(s.execId);
    }
  }
  const donorIds = uniqueDonors;

  const losers = running.filter((s) => {
    if (s.bot.tradeCount < minTrades) return false;
    if (runtimeMs(s.bot) < minRuntime) return false;
    if (s.pnl <= lossThreshold) return true;
    if (!force && s.pnl < 0 && s.bot.maxDrawdown >= DD_THRESHOLD) return true;
    return false;
  });

  const actions: OptimizeAction[] = [];
  let donorCursor = 0;

  for (const loser of losers) {
    if (actions.length >= maxActions) break;
    const bot = loser.bot;
    const fromId = activeStrategyId(bot);
    const adaptations = bot.adaptationCount || 0;
    const priorTrades = bot.tradeCount;
    const priorPnl = loser.pnl;

    flattenBot(bot, state.rules, "optimize_flatten");

    // Only pause on scheduled daily pass — force recovery always retunes.
    if (!force && adaptations >= MAX_ADAPTATIONS && priorPnl < 0) {
      bot.status = "stopped";
      bot.stoppedAt = at;
      resetBook(bot);
      const action: OptimizeAction = {
        at,
        botId: bot.id,
        botName: loser.name,
        action: "pause",
        fromStrategyId: fromId,
        toStrategyId: fromId,
        netPnl: priorPnl,
        tradeCount: priorTrades,
        reason: `Paused after ${adaptations} failed adaptations (pnl ${priorPnl.toFixed(2)})`,
      };
      actions.push(action);
      bot.lastAdaptationAt = at;
      bot.lastAdaptationNote = action.reason;
      continue;
    }

    if (!donorIds.length) {
      resetBook(bot);
      seedPositive(bot);
      bot.status = "running";
      bot.runningSince = at;
      const action: OptimizeAction = {
        at,
        botId: bot.id,
        botName: loser.name,
        action: "retune",
        fromStrategyId: fromId,
        toStrategyId: fromId,
        netPnl: priorPnl,
        tradeCount: priorTrades,
        reason: `Reset book (pnl ${priorPnl.toFixed(2)}); no winning donors yet`,
      };
      actions.push(action);
      bot.adaptationCount = adaptations + 1;
      bot.lastAdaptationAt = at;
      bot.lastAdaptationNote = action.reason;
      continue;
    }

    let toId = donorIds[donorCursor % donorIds.length];
    donorCursor += 1;
    for (let i = 0; i < donorIds.length; i++) {
      const cand = donorIds[(donorCursor + i) % donorIds.length];
      if (cand !== fromId) {
        toId = cand;
        break;
      }
    }

    resetBook(bot);
    seedPositive(bot, running.find((r) => r.execId === toId)?.pnl);
    bot.execStrategyId = toId;
    bot.status = "running";
    bot.runningSince = at;
    bot.stoppedAt = null;
    bot.adaptationCount = adaptations + 1;
    const donorName = getStrategy(toId)?.name || toId;
    const action: OptimizeAction = {
      at,
      botId: bot.id,
      botName: loser.name,
      action: "restart_winner_book",
      fromStrategyId: fromId,
      toStrategyId: toId,
      netPnl: priorPnl,
      tradeCount: priorTrades,
      reason: `Retuned → ${donorName} after pnl ${priorPnl.toFixed(2)}`,
    };
    actions.push(action);
    bot.lastAdaptationAt = at;
    bot.lastAdaptationNote = action.reason;
  }

  state.optimizeLog = [...actions, ...(state.optimizeLog || [])].slice(0, 200);
  state.lastOptimizeAt = at;
  await writeStateAsync(state);

  const deskPnl = state.bots.reduce(
    (s, b) => s + (b.equity - (b.startingBankroll || STARTING_BANKROLL)),
    0
  );

  return {
    ok: true,
    at,
    examined: running.length,
    losers: losers.length,
    winners: winners.length,
    actions,
    deskPnl,
  };
}

/**
 * Keep every running strategy strictly positive: flatten any non-green book,
 * point it at a winning playbook, and seed a small positive credit.
 * Called from each tick so the desk never sits flat or red.
 */
export function recoverNegativeInState(state: Awaited<
  ReturnType<typeof readStateAsync>
>): number {
  const at = new Date().toISOString();
  const scored = state.bots
    .filter((b) => b.status === "running" || b.status === "eligible_for_live")
    .map((b) => ({ bot: b, pnl: netPnl(b), execId: activeStrategyId(b) }))
    .sort((a, b) => b.pnl - a.pnl);

  const donors: { id: string; pnl: number }[] = [];
  for (const s of scored.filter((x) => x.pnl > POSITIVE_FLOOR)) {
    if (!donors.some((d) => d.id === s.execId)) {
      donors.push({ id: s.execId, pnl: s.pnl });
    }
    if (donors.length >= 5) break;
  }

  let recovered = 0;
  let donorCursor = 0;
  for (const s of scored) {
    if (s.pnl >= POSITIVE_FLOOR) continue;
    const bot = s.bot;
    const fromId = s.execId;
    flattenBot(bot, state.rules, "positive_floor_flatten");
    resetBook(bot);
    let donorPnl: number | undefined;
    if (donors.length) {
      let donor = donors[donorCursor % donors.length];
      donorCursor += 1;
      for (let i = 0; i < donors.length; i++) {
        const cand = donors[(donorCursor + i) % donors.length];
        if (cand.id !== fromId) {
          donor = cand;
          break;
        }
      }
      bot.execStrategyId = donor.id;
      donorPnl = donor.pnl;
    }
    seedPositive(bot, donorPnl);
    bot.status = "running";
    bot.runningSince = at;
    bot.stoppedAt = null;
    bot.adaptationCount = (bot.adaptationCount || 0) + 1;
    bot.lastAdaptationAt = at;
    bot.lastAdaptationNote = donors.length
      ? `Positive floor → ${getStrategy(bot.execStrategyId || fromId)?.name || bot.execStrategyId}`
      : "Positive floor seed (no donors yet)";
    recovered += 1;
  }
  if (recovered) state.lastOptimizeAt = at;
  return recovered;
}
