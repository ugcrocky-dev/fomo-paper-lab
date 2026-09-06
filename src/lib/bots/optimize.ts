import { flattenBot } from "../paper/broker";
import { readStateAsync, writeStateAsync } from "../store";
import { getStrategy } from "../strategies/catalog";
import { BotState, OptimizeAction, STARTING_BANKROLL } from "../types";

/** Minimum sample before we judge a strategy. */
const MIN_TRADES = 6;
/** Don't retune until the bot has been running at least this long. */
const MIN_RUNTIME_MS = 45 * 60 * 1000;
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
 * Hourly (or on-demand) pass: flatten + retune unprofitable bots onto
 * currently winning playbooks. Keeps bot identity (strategyId) stable.
 */
export async function optimizeLab(opts?: {
  force?: boolean;
}): Promise<OptimizeResult> {
  const state = await readStateAsync();
  const at = new Date().toISOString();
  const minRuntime = opts?.force ? 0 : MIN_RUNTIME_MS;
  const minTrades = opts?.force ? 3 : MIN_TRADES;

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
  const winners = running.filter((s) => s.pnl > 0 && s.bot.tradeCount >= 3);
  const donorIds = (
    winners.length
      ? winners
      : running.filter((s) => s.bot.tradeCount >= 1).slice(0, 10)
  ).map((s) => s.execId);

  const losers = running.filter((s) => {
    if (s.bot.tradeCount < minTrades) return false;
    if (runtimeMs(s.bot) < minRuntime) return false;
    if (s.pnl <= LOSS_THRESHOLD) return true;
    if (s.pnl < 0 && s.bot.maxDrawdown >= DD_THRESHOLD) return true;
    return false;
  });

  const actions: OptimizeAction[] = [];
  let donorCursor = 0;

  for (const loser of losers) {
    if (actions.length >= MAX_ACTIONS_PER_RUN) break;
    const bot = loser.bot;
    const fromId = activeStrategyId(bot);
    const adaptations = bot.adaptationCount || 0;
    const priorTrades = bot.tradeCount;
    const priorPnl = loser.pnl;

    flattenBot(bot, state.rules, "optimize_flatten");

    if (adaptations >= MAX_ADAPTATIONS && priorPnl < 0) {
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
