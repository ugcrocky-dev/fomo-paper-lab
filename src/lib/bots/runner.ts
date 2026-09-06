import {
  buildPriceMap,
  fetchBoards,
  FomoTrader,
  tokenMeta,
} from "../fomo/client";
import { executeIntent, Intent, revalue } from "../paper/broker";
import { readStateAsync, writeStateAsync } from "../store";
import {
  BotState,
  DEFAULT_TAKE_PROFIT_PCT,
  MAX_POSITION_PCT_BANKROLL,
  REBUY_COOLDOWN_MS,
  RiskRules,
} from "../types";
import { getStrategy } from "../strategies/catalog";

type Boards = Awaited<ReturnType<typeof fetchBoards>>;

type TokenAgg = {
  tokenAddress: string;
  symbol: string;
  chain: string;
  price: number;
  holders: number;
  valueSum: number;
  pnlSum: number;
  followerWeight: number;
};

function windowTraders(boards: Boards, window: string): FomoTrader[] {
  if (window === "24h") return boards.h24.traders || [];
  if (window === "7d") return boards.d7.traders || [];
  if (window === "30d") return boards.d30.traders || [];
  if (window === "all") return boards.all.traders || [];
  return boards.d7.traders || [];
}

function hk(t: FomoTrader) {
  return t.handle.toLowerCase();
}

function pickTraders(strategyId: string, boards: Boards): FomoTrader[] {
  const strategy = getStrategy(strategyId);
  if (!strategy) return [];
  const p = strategy.params;
  const topN = Number(p.topN ?? 5);
  const require = String(p.require ?? "");
  const mode = String(p.mode ?? "");
  const score = String(p.score ?? "");
  const window = String(p.window ?? "7d");

  const h24 = boards.h24.traders || [];
  const d7 = boards.d7.traders || [];
  const d30 = boards.d30.traders || [];
  const all = boards.all.traders || [];

  if (require === "h24_and_d7") {
    const set = new Set(h24.map(hk));
    return d7.filter((t) => set.has(hk(t))).slice(0, topN);
  }
  if (require === "d7_and_d30") {
    const set = new Set(d30.map(hk));
    return d7.filter((t) => set.has(hk(t))).slice(0, topN);
  }
  if (require === "h24_d7_d30") {
    const a = new Set(h24.map(hk));
    const b = new Set(d30.map(hk));
    return d7.filter((t) => a.has(hk(t)) && b.has(hk(t))).slice(0, topN);
  }
  if (require === "all_and_d30") {
    const set = new Set(all.map(hk));
    return d30.filter((t) => set.has(hk(t))).slice(0, topN);
  }
  if (require === "all_and_d7") {
    const set = new Set(all.map(hk));
    return d7.filter((t) => set.has(hk(t))).slice(0, topN);
  }
  if (mode === "h24_not_all") {
    const topAll = new Set(all.slice(0, 20).map(hk));
    return h24.filter((t) => !topAll.has(hk(t))).slice(0, topN);
  }
  if (mode === "d7_not_d30") {
    const top30 = new Set(d30.slice(0, 20).map(hk));
    return d7.filter((t) => !top30.has(hk(t))).slice(0, topN);
  }
  if (mode === "blend_h24_d7") return [...h24.slice(0, 3), ...d7.slice(0, 3)].slice(0, topN);
  if (mode === "quintiles") {
    const list = d7;
    const out: FomoTrader[] = [];
    for (let q = 0; q < 5; q++) {
      const idx = Math.min(list.length - 1, Math.floor((q + 0.5) * (list.length / 5)));
      if (list[idx]) out.push(list[idx]);
    }
    return out;
  }
  if (score === "persistence") {
    const counts = new Map<string, { t: FomoTrader; n: number }>();
    for (const t of [...h24, ...d7, ...d30]) {
      const key = hk(t);
      const cur = counts.get(key);
      if (cur) cur.n += 1;
      else counts.set(key, { t, n: 1 });
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, topN).map((x) => x.t);
  }

  let list = [...windowTraders(boards, window)];
  list = list.filter(
    (t) =>
      t.pnlUsd >= Number(p.minPnl ?? -1e18) &&
      t.pnlUsd <= Number(p.maxPnl ?? 1e18) &&
      t.followers >= Number(p.minFollowers ?? 0) &&
      t.followers <= Number(p.maxFollowers ?? 1e18)
  );
  const from = Number(p.rankFrom ?? 1);
  const to = Number(p.rankTo ?? list.length);
  list = list.slice(Math.max(0, from - 1), to);

  if (score === "followers") list.sort((a, b) => b.followers - a.followers);
  else if (score === "pnl_over_vol")
    list.sort((a, b) => b.pnlUsd / Math.max(1, b.volumeUsd) - a.pnlUsd / Math.max(1, a.volumeUsd));
  else if (score === "pnl_sqrt_vol")
    list.sort(
      (a, b) =>
        b.pnlUsd / Math.sqrt(Math.max(1, b.volumeUsd)) -
        a.pnlUsd / Math.sqrt(Math.max(1, a.volumeUsd))
    );
  else if (score === "trades") list.sort((a, b) => b.trades - a.trades);
  else if (score === "selective")
    list.sort((a, b) => b.pnlUsd / Math.max(1, b.trades) - a.pnlUsd / Math.max(1, a.trades));
  else if (score === "volume") list.sort((a, b) => b.volumeUsd - a.volumeUsd);
  else if (score === "holdings") list.sort((a, b) => b.holdings - a.holdings);
  else if (score === "tight_books") list.sort((a, b) => a.holdings - b.holdings);

  return list.slice(0, topN);
}

function aggregateTokens(
  traders: FomoTrader[],
  opts: { chain?: string; mode?: string } = {}
): TokenAgg[] {
  const map = new Map<string, TokenAgg>();
  for (const t of traders) {
    let toks = [...(t.topTokens || [])];
    if (opts.mode === "top_holding_only") toks = toks.slice(0, 1);
    if (opts.mode === "top3_holdings") toks = toks.slice(0, 3);
    if (opts.mode === "winning_tokens") toks = toks.filter((x) => (x.pnl || 0) > 0);
    if (opts.mode === "highest_value")
      toks = [...toks].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 2);

    for (const tok of toks) {
      if (!tok?.tokenAddress || !(Number(tok.price) > 0)) continue;
      const meta = tokenMeta(tok);
      if (opts.chain && meta.chain !== opts.chain) continue;
      const cur = map.get(meta.key);
      if (cur) {
        cur.holders += 1;
        cur.valueSum += meta.value;
        cur.pnlSum += meta.pnl;
        cur.followerWeight += t.followers;
        cur.price = meta.price;
      } else {
        map.set(meta.key, {
          tokenAddress: meta.tokenAddress,
          symbol: meta.symbol,
          chain: meta.chain,
          price: meta.price,
          holders: 1,
          valueSum: meta.value,
          pnlSum: meta.pnl,
          followerWeight: t.followers,
        });
      }
    }
  }
  return [...map.values()];
}

function buy(token: TokenAgg, reason: string, sourceHandle?: string): Intent {
  return {
    tokenAddress: token.tokenAddress,
    symbol: token.symbol,
    chain: token.chain,
    side: "BUY",
    price: token.price,
    reason,
    sourceHandle,
  };
}

function sell(token: TokenAgg, reason: string): Intent {
  return {
    tokenAddress: token.tokenAddress,
    symbol: token.symbol,
    chain: token.chain,
    side: "SELL",
    price: token.price,
    reason,
  };
}

function sellHeld(
  bot: BotState,
  reason: string,
  pred?: (p: BotState["positions"][number]) => boolean
): Intent[] {
  const pos = bot.positions.find((p) => (pred ? pred(p) : true));
  if (!pos) return [];
  return [
    {
      tokenAddress: pos.tokenAddress,
      symbol: pos.symbol,
      chain: pos.chain,
      side: "SELL",
      price: pos.markPrice,
      reason,
    },
  ];
}

function traderIntents(bot: BotState, strategyId: string, boards: Boards): Intent[] {
  const strategy = getStrategy(strategyId);
  if (!strategy) return [];
  const p = strategy.params;
  const mode = String(p.mode ?? "");
  const traders = pickTraders(strategyId, boards);
  bot.watchedHandles = traders.map((t) => t.handle);

  if (mode === "fade_bags" || mode === "fade_losing_tokens") {
    const toks =
      mode === "fade_losing_tokens"
        ? aggregateTokens(traders).filter((t) => t.pnlSum < 0)
        : aggregateTokens(traders);
    const intents: Intent[] = [];
    for (const pos of bot.positions) {
      const hit = toks.find(
        (t) =>
          t.chain === pos.chain &&
          t.tokenAddress.toLowerCase() === pos.tokenAddress.toLowerCase()
      );
      if (hit) intents.push(sell(hit, strategy.name));
    }
    return intents.slice(0, 2);
  }
  if (mode === "consensus") {
    return aggregateTokens(traders)
      .filter((t) => t.holders >= 3)
      .sort((a, b) => b.holders - a.holders)
      .slice(0, 2)
      .map((t) => buy(t, strategy.name));
  }
  if (mode === "unique_bags") {
    return aggregateTokens(traders)
      .filter((t) => t.holders === 1)
      .slice(0, 2)
      .map((t) => buy(t, strategy.name));
  }
  if (mode === "copy_trim") {
    const intents = sellHeld(bot, "trim loser", (x) => x.markPrice < x.avgPrice);
    for (const t of aggregateTokens(traders, { mode: "highest_value" }).slice(0, 2)) {
      intents.push(buy(t, strategy.name, traders[0]?.handle));
    }
    return intents.slice(0, 3);
  }

  return aggregateTokens(traders, {
    chain: p.chain ? String(p.chain) : undefined,
    mode: mode || undefined,
  })
    .sort((a, b) => b.valueSum - a.valueSum)
    .slice(0, 3)
    .map((t) => buy(t, strategy.name, traders[0]?.handle));
}

function propIntents(bot: BotState, strategyId: string, boards: Boards): Intent[] {
  const strategy = getStrategy(strategyId);
  if (!strategy) return [];
  const p = strategy.params;
  const mode = String(p.mode ?? "");
  const window = String(p.window ?? "7d");
  const traders = windowTraders(boards, window);
  const toks = aggregateTokens(traders).sort((a, b) => b.holders - a.holders);
  const h24 = aggregateTokens(boards.h24.traders || []);
  const d30 = aggregateTokens(boards.d30.traders || []);
  const allTime = aggregateTokens(boards.all.traders || []);
  const mkBuy = (t?: TokenAgg, reason = strategy.name) => (t ? [buy(t, reason)] : []);

  switch (mode) {
    case "consensus_buy":
      return mkBuy(toks.find((t) => t.holders >= Number(p.minHolders ?? 3)));
    case "consensus_fade": {
      const crowded = toks.find((t) => t.holders >= Number(p.minHolders ?? 4));
      if (!crowded) return [];
      return bot.positions.some(
        (x) => x.tokenAddress.toLowerCase() === crowded.tokenAddress.toLowerCase()
      )
        ? [sell(crowded, "consensus fade")]
        : [];
    }
    case "top_pnl_token":
      return mkBuy([...toks].sort((a, b) => b.pnlSum - a.pnlSum)[0]);
    case "worst_pnl_token": {
      const worst = [...toks].sort((a, b) => a.pnlSum - b.pnlSum)[0];
      if (!worst) return [];
      return bot.positions.some(
        (x) => x.tokenAddress.toLowerCase() === worst.tokenAddress.toLowerCase()
      )
        ? [sell(worst, "worst pnl")]
        : [];
    }
    case "chain_follow":
      return mkBuy(toks.find((t) => t.chain === String(p.chain)));
    case "chain_fade": {
      const t = toks.find((x) => x.chain === String(p.chain));
      if (!t) return [];
      return bot.positions.some(
        (x) => x.tokenAddress.toLowerCase() === t.tokenAddress.toLowerCase()
      )
        ? [sell(t, "chain fade")]
        : [];
    }
    case "fresh_tokens": {
      const old = new Set(d30.map((t) => `${t.chain}:${t.tokenAddress}`));
      return mkBuy(h24.find((t) => !old.has(`${t.chain}:${t.tokenAddress}`)));
    }
    case "sticky_tokens": {
      const old = new Set(d30.map((t) => `${t.chain}:${t.tokenAddress}`));
      return mkBuy(h24.find((t) => old.has(`${t.chain}:${t.tokenAddress}`)));
    }
    case "max_value":
      return mkBuy([...toks].sort((a, b) => b.valueSum - a.valueSum)[0]);
    case "min_value":
      return mkBuy(
        [...toks].filter((t) => t.valueSum > 0).sort((a, b) => a.valueSum - b.valueSum)[0]
      );
    case "low_price":
      return mkBuy(toks.find((t) => t.price <= Number(p.maxPrice ?? 0.01)));
    case "price_band":
      return mkBuy(
        toks.find((t) => t.price >= Number(p.lo ?? 0) && t.price <= Number(p.hi ?? 1))
      );
    case "high_price":
      return mkBuy(toks.find((t) => t.price >= Number(p.minPrice ?? 1)));
    case "rotate_winners": {
      const best = [...toks].sort((a, b) => b.pnlSum - a.pnlSum)[0];
      const intents = sellHeld(bot, "rotate out", (x) => x.markPrice < x.avgPrice);
      if (best) intents.push(buy(best, "rotate in"));
      return intents.slice(0, 2);
    }
    case "crowd_mr": {
      const crowded = toks[0];
      const thin = [...toks].sort((a, b) => a.holders - b.holders)[0];
      const intents: Intent[] = [];
      if (
        crowded &&
        bot.positions.some(
          (pos) => pos.tokenAddress.toLowerCase() === crowded.tokenAddress.toLowerCase()
        )
      )
        intents.push(sell(crowded, "fade crowd"));
      if (thin) intents.push(buy(thin, "buy thin"));
      return intents.slice(0, 2);
    }
    case "single_focus":
      return bot.positions.length >= 1 ? [] : mkBuy(toks[0]);
    case "max_books":
      if (bot.positions.length >= Number(p.maxBooks ?? 3)) return [];
      return mkBuy(
        toks.find(
          (t) =>
            !bot.positions.some(
              (pos) =>
                pos.chain === t.chain &&
                pos.tokenAddress.toLowerCase() === t.tokenAddress.toLowerCase()
            )
        )
      );
    case "always_deploy":
      return mkBuy(toks[0]);
    case "cash_heavy":
      return mkBuy(toks.find((t) => t.holders >= Number(p.minHolders ?? 5)));
    case "follower_weighted":
      return mkBuy([...toks].sort((a, b) => b.followerWeight - a.followerWeight)[0]);
    case "active_traders":
      return mkBuy(
        aggregateTokens([...traders].sort((a, b) => b.trades - a.trades).slice(0, 5))[0]
      );
    case "selective_traders":
      return mkBuy(
        aggregateTokens(
          [...traders]
            .sort(
              (a, b) =>
                b.pnlUsd / Math.max(1, b.trades) - a.pnlUsd / Math.max(1, a.trades)
            )
            .slice(0, 5)
        )[0]
      );
    case "breadth_long":
      return toks.length >= 20 ? mkBuy(toks[0]) : [];
    case "breadth_short":
      return toks.length <= 8 ? sellHeld(bot, "breadth short") : [];
    case "global_top1":
      return mkBuy(toks[0]);
    case "top3_equal":
      return toks.slice(0, 3).map((t) => buy(t, "top3"));
    case "random":
      return mkBuy(toks[Math.floor(Math.random() * Math.max(toks.length, 1))]);
    case "always_buy":
      return mkBuy(toks[0]);
    case "always_sell":
      return sellHeld(bot, "sell");
    case "take_profit": {
      const tp = Number(p.tp ?? 0.2);
      return sellHeld(
        bot,
        "tp",
        (x) => x.avgPrice > 0 && (x.markPrice - x.avgPrice) / x.avgPrice >= tp
      );
    }
    case "stop_loss": {
      const sl = Number(p.sl ?? 0.2);
      return sellHeld(
        bot,
        "sl",
        (x) => x.avgPrice > 0 && (x.avgPrice - x.markPrice) / x.avgPrice >= sl
      );
    }
    case "hold_winners":
      return bot.positions.some((pos) => pos.markPrice >= pos.avgPrice)
        ? []
        : mkBuy(toks[0]);
    case "cut_losers":
      return sellHeld(bot, "cut loser", (pos) => pos.markPrice < pos.avgPrice);
    case "rebalance_equal":
      return bot.positions.length >= 2 ? sellHeld(bot, "rebalance") : mkBuy(toks[0]);
    case "ignore_chain":
      return mkBuy(toks.find((t) => t.chain !== String(p.chain)));
    case "only_chain":
      return mkBuy(toks.find((t) => t.chain === String(p.chain)));
    case "pnl_momentum":
      return mkBuy([...h24].sort((a, b) => b.pnlSum - a.pnlSum)[0]);
    case "volume_proxy":
      return mkBuy(
        aggregateTokens(
          [...traders].sort((a, b) => b.volumeUsd - a.volumeUsd).slice(0, 5)
        )[0]
      );
    case "contrarian_window": {
      const list = aggregateTokens(windowTraders(boards, String(p.window ?? "24h")));
      const top = list[0];
      if (!top) return [];
      return bot.positions.some(
        (pos) => pos.tokenAddress.toLowerCase() === top.tokenAddress.toLowerCase()
      )
        ? [sell(top, "contrarian")]
        : [];
    }
    case "follow_window":
      return mkBuy(aggregateTokens(windowTraders(boards, String(p.window ?? "30d")))[0]);
    case "pair_rotate": {
      const [a, b] = toks;
      if (!a) return [];
      if (!bot.positions.length) return mkBuy(a);
      const holdingA = bot.positions.some(
        (pos) => pos.tokenAddress.toLowerCase() === a.tokenAddress.toLowerCase()
      );
      if (holdingA && b) return [sell(a, "rotate"), buy(b, "rotate")];
      return mkBuy(a);
    }
    case "inventory_balance":
      return bot.positions.length > 1 ? sellHeld(bot, "flatten") : mkBuy(toks[0]);
    case "new_money": {
      const old = new Set(allTime.map((t) => `${t.chain}:${t.tokenAddress}`));
      return mkBuy(h24.find((t) => !old.has(`${t.chain}:${t.tokenAddress}`)));
    }
    case "old_money":
      return mkBuy(allTime[0]);
    case "combo_elite_fade": {
      const sticky = aggregateTokens(boards.d7.traders || []).filter((t) =>
        allTime.some(
          (x) =>
            x.chain === t.chain &&
            x.tokenAddress.toLowerCase() === t.tokenAddress.toLowerCase()
        )
      );
      const crowd = h24[0];
      const intents: Intent[] = [];
      if (
        crowd &&
        bot.positions.some(
          (pos) => pos.tokenAddress.toLowerCase() === crowd.tokenAddress.toLowerCase()
        )
      )
        intents.push(sell(crowd, "fade 24h crowd"));
      if (sticky[0]) intents.push(buy(sticky[0], "elite sticky"));
      return intents.slice(0, 2);
    }
    case "avoid_dust":
      return mkBuy(toks.find((t) => t.price >= Number(p.minPrice ?? 1e-8)));
    default:
      return mkBuy(toks[0]);
  }
}

function maybePromote(bot: BotState, rules: RiskRules) {
  if (
    !bot.runningSince ||
    (bot.status !== "running" && bot.status !== "eligible_for_live")
  )
    return;
  const days =
    (Date.now() - new Date(bot.runningSince).getTime()) / (1000 * 60 * 60 * 24);
  if (
    days >= rules.promotionDays &&
    bot.tradeCount >= rules.minTradesForPromotion &&
    bot.maxDrawdown <= rules.maxDrawdownPctForPromotion &&
    bot.equity > bot.startingBankroll
  ) {
    bot.status = "eligible_for_live";
  }
}

/**
 * Take-profit overlay only. Global hard SL stop-hunted memecoins every tick
 * (hundreds of risk_sl fills) and locked losses before strategies could work.
 */
function riskExitIntents(bot: BotState): Intent[] {
  const out: Intent[] = [];
  for (const pos of bot.positions) {
    if (!(pos.avgPrice > 0) || !(pos.markPrice > 0) || !(pos.units > 0)) continue;
    const ret = (pos.markPrice - pos.avgPrice) / pos.avgPrice;
    if (ret >= DEFAULT_TAKE_PROFIT_PCT) {
      out.push({
        tokenAddress: pos.tokenAddress,
        symbol: pos.symbol,
        chain: pos.chain,
        side: "SELL",
        price: pos.markPrice,
        reason: `risk_tp_${Math.round(DEFAULT_TAKE_PROFIT_PCT * 100)}pct`,
      });
    }
  }
  return out.slice(0, 3);
}

function tokenKey(chain: string, tokenAddress: string) {
  return `${chain}:${tokenAddress.toLowerCase()}`;
}

function positionNotional(bot: BotState, chain: string, tokenAddress: string) {
  const pos = bot.positions.find(
    (p) =>
      p.chain === chain &&
      p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
  );
  if (!pos) return 0;
  return pos.units * pos.markPrice;
}

function setCooldown(bot: BotState, chain: string, tokenAddress: string) {
  if (!bot.buyCooldownUntil) bot.buyCooldownUntil = {};
  bot.buyCooldownUntil[tokenKey(chain, tokenAddress)] = new Date(
    Date.now() + REBUY_COOLDOWN_MS
  ).toISOString();
}

function inCooldown(bot: BotState, chain: string, tokenAddress: string) {
  const until = bot.buyCooldownUntil?.[tokenKey(chain, tokenAddress)];
  if (!until) return false;
  return Date.now() < new Date(until).getTime();
}

/** Drop buy spam into the same bag / recently sold tokens. */
function filterIntents(bot: BotState, intents: Intent[]): Intent[] {
  const bankroll = bot.startingBankroll || 1000;
  const maxPos = bankroll * MAX_POSITION_PCT_BANKROLL;
  return intents.filter((intent) => {
    if (intent.side !== "BUY") return true;
    if (inCooldown(bot, intent.chain, intent.tokenAddress)) return false;
    const notional = positionNotional(bot, intent.chain, intent.tokenAddress);
    if (notional >= maxPos) return false;
    // Keep dry powder — don't force full deployment every tick.
    if (bot.cash < bankroll * 0.15) return false;
    return true;
  });
}

export async function tickRunningBots() {
  const state = await readStateAsync();
  // Migrate live rules if an old 1% fee snapshot is still cached.
  if (state.rules.takerFeeRate > 0.006) state.rules.takerFeeRate = 0.005;
  if (state.rules.slippageBps > 40) state.rules.slippageBps = 30;

  const running = state.bots.filter(
    (b) => b.status === "running" || b.status === "eligible_for_live"
  );
  const errors: string[] = [];
  let fills = 0;
  if (!running.length) return { ticked: 0, fills: 0, errors };

  const boards = await fetchBoards(50);
  const priceMap = buildPriceMap(boards);
  const marks = [...priceMap.values()].map((v) => ({
    tokenAddress: v.tokenAddress,
    chain: v.chain,
    price: v.price,
  }));

  for (const bot of running) {
    try {
      const strategy = getStrategy(bot.execStrategyId || bot.strategyId);
      if (!strategy) continue;
      revalue(bot, marks);

      // Exits first: free cash before new buys.
      const exitIntents = riskExitIntents(bot);
      let made = 0;
      for (const intent of exitIntents) {
        if (made >= 2) break;
        if (executeIntent(bot, state.rules, intent)) {
          fills += 1;
          made += 1;
          setCooldown(bot, intent.chain, intent.tokenAddress);
        }
      }

      const rawIntents =
        strategy.family === "trader_discovery"
          ? traderIntents(bot, bot.strategyId, boards)
          : propIntents(bot, bot.strategyId, boards);
      const intents = filterIntents(bot, rawIntents);
      for (const intent of intents) {
        if (made >= 2) break;
        if (executeIntent(bot, state.rules, intent)) {
          fills += 1;
          made += 1;
          if (intent.side === "SELL") {
            setCooldown(bot, intent.chain, intent.tokenAddress);
          }
        }
      }
      bot.lastTickAt = new Date().toISOString();
      bot.lastError = null;
      maybePromote(bot, state.rules);
    } catch (e) {
      bot.status = "error";
      bot.lastError = e instanceof Error ? e.message : String(e);
      errors.push(`${bot.id}: ${bot.lastError}`);
    }
  }

  await writeStateAsync(state);
  return { ticked: running.length, fills, errors };
}

export async function setBotStatus(botId: string, status: "running" | "stopped") {
  const state = await readStateAsync();
  const bot = state.bots.find((b) => b.id === botId);
  if (!bot) throw new Error("Bot not found");
  bot.status = status;
  if (status === "running") {
    bot.runningSince = bot.runningSince ?? new Date().toISOString();
    bot.stoppedAt = null;
    bot.lastError = null;
  } else {
    bot.stoppedAt = new Date().toISOString();
  }
  await writeStateAsync(state);
  return bot;
}

export async function startMany(
  family: "trader_discovery" | "proprietary" | "all"
) {
  const state = await readStateAsync();
  let n = 0;
  for (const bot of state.bots) {
    const s = getStrategy(bot.strategyId);
    if (!s) continue;
    if (family !== "all" && s.family !== family) continue;
    bot.status = "running";
    bot.runningSince = bot.runningSince ?? new Date().toISOString();
    bot.stoppedAt = null;
    n += 1;
  }
  await writeStateAsync(state);
  return n;
}

export async function stopAllBots() {
  const state = await readStateAsync();
  for (const bot of state.bots) {
    if (bot.status === "running" || bot.status === "eligible_for_live") {
      bot.status = "stopped";
      bot.stoppedAt = new Date().toISOString();
    }
  }
  await writeStateAsync(state);
}
