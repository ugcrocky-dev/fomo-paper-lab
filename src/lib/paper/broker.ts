import { randomUUID } from "node:crypto";
import { BotState, PaperFill, RiskRules } from "../types";
import { appendTradeJournal } from "../store/journal";

const FILL_HISTORY_LIMIT = 500;

function mark(bot: BotState) {
  let unreal = 0;
  for (const p of bot.positions) unreal += (p.markPrice - p.avgPrice) * p.units;
  bot.unrealizedPnl = unreal;
  bot.equity =
    bot.cash + bot.positions.reduce((s, p) => s + p.markPrice * p.units, 0);
  bot.maxEquity = Math.max(bot.maxEquity, bot.equity);
  const dd =
    bot.maxEquity > 0 ? ((bot.maxEquity - bot.equity) / bot.maxEquity) * 100 : 0;
  bot.maxDrawdown = Math.max(bot.maxDrawdown, dd);
}

export type Intent = {
  tokenAddress: string;
  symbol: string;
  chain: string;
  side: "BUY" | "SELL";
  price: number;
  reason: string;
  sourceHandle?: string;
};

function posKey(chain: string, tokenAddress: string) {
  return `${chain}:${tokenAddress.toLowerCase()}`;
}

export function executeIntent(
  bot: BotState,
  rules: RiskRules,
  intent: Intent
): PaperFill | null {
  if (intent.price <= 0) return null;
  if (intent.side === "BUY") {
    if (rules.skipPriceAbove > 0 && intent.price > rules.skipPriceAbove) return null;
    if (intent.price < rules.skipPriceBelow) return null;
  }

  const slip = (rules.slippageBps / 10000) * (intent.side === "BUY" ? 1 : -1);
  const px = Math.max(1e-12, intent.price * (1 + slip));
  const budget = Math.min(
    rules.maxUsdPerTrade,
    (bot.startingBankroll * rules.maxPctBankroll) / 100,
    Math.max(0, bot.cash * 0.95)
  );
  if (budget < 1) return null;

  const feeRate = rules.chargeTakerFees ? rules.takerFeeRate : 0;
  const key = posKey(intent.chain, intent.tokenAddress);

  if (intent.side === "BUY") {
    const spend = Math.min(budget, bot.cash / (1 + feeRate));
    if (spend < 1) return null;
    const feeUsd = spend * feeRate;
    const units = spend / px;
    if (bot.cash < spend + feeUsd) return null;

    bot.cash -= spend + feeUsd;
    bot.feesPaid += feeUsd;

    const existing = bot.positions.find(
      (p) => posKey(p.chain, p.tokenAddress) === key
    );
    if (existing) {
      const cost = existing.avgPrice * existing.units + spend;
      existing.units += units;
      existing.avgPrice = cost / existing.units;
      existing.markPrice = px;
      existing.symbol = intent.symbol;
    } else {
      bot.positions.push({
        tokenAddress: intent.tokenAddress,
        symbol: intent.symbol,
        chain: intent.chain,
        units,
        avgPrice: px,
        markPrice: px,
      });
    }

    const fill: PaperFill = {
      id: randomUUID(),
      botId: bot.id,
      ts: new Date().toISOString(),
      tokenAddress: intent.tokenAddress,
      symbol: intent.symbol,
      chain: intent.chain,
      side: "BUY",
      price: px,
      sizeUsd: spend,
      units,
      feeUsd,
      realizedPnl: 0,
      reason: intent.reason,
      sourceHandle: intent.sourceHandle,
    };
    recordFill(bot, fill);
    mark(bot);
    return fill;
  }

  const pos = bot.positions.find((p) => posKey(p.chain, p.tokenAddress) === key);
  if (!pos || pos.units <= 0) return null;

  const sellUsd = Math.min(budget, pos.units * px);
  const units = sellUsd / px;
  const proceeds = units * px;
  const feeUsd = proceeds * feeRate;
  const net = proceeds - feeUsd;
  const pnl = net - units * pos.avgPrice;

  bot.cash += net;
  bot.feesPaid += feeUsd;
  bot.realizedPnl += pnl;
  if (pnl > 0) bot.winCount += 1;

  pos.units -= units;
  if (pos.units < 1e-12) bot.positions = bot.positions.filter((p) => p !== pos);
  else pos.markPrice = px;

  const fill: PaperFill = {
    id: randomUUID(),
    botId: bot.id,
    ts: new Date().toISOString(),
    tokenAddress: intent.tokenAddress,
    symbol: intent.symbol,
    chain: intent.chain,
    side: "SELL",
    price: px,
    sizeUsd: proceeds,
    units,
    feeUsd,
    realizedPnl: pnl,
    reason: intent.reason,
    sourceHandle: intent.sourceHandle,
  };
  recordFill(bot, fill);
  mark(bot);
  return fill;
}

function recordFill(bot: BotState, fill: PaperFill) {
  bot.fills.unshift(fill);
  bot.fills = bot.fills.slice(0, FILL_HISTORY_LIMIT);
  bot.tradeCount += 1;
  appendTradeJournal(fill);
}

/** Sell 100% of every open position (ignores per-trade size caps). */
export function flattenBot(
  bot: BotState,
  rules: RiskRules,
  reason = "optimize_flatten"
): PaperFill[] {
  const out: PaperFill[] = [];
  const feeRate = rules.chargeTakerFees ? rules.takerFeeRate : 0;
  for (const pos of [...bot.positions]) {
    if (!(pos.units > 0) || !(pos.markPrice > 0)) continue;
    const slip = (rules.slippageBps / 10000) * -1;
    const px = Math.max(1e-12, pos.markPrice * (1 + slip));
    const units = pos.units;
    const proceeds = units * px;
    const feeUsd = proceeds * feeRate;
    const net = proceeds - feeUsd;
    const pnl = net - units * pos.avgPrice;
    bot.cash += net;
    bot.feesPaid += feeUsd;
    bot.realizedPnl += pnl;
    if (pnl > 0) bot.winCount += 1;
    bot.positions = bot.positions.filter(
      (p) =>
        !(
          p.chain === pos.chain &&
          p.tokenAddress.toLowerCase() === pos.tokenAddress.toLowerCase()
        )
    );
    const fill: PaperFill = {
      id: randomUUID(),
      botId: bot.id,
      ts: new Date().toISOString(),
      tokenAddress: pos.tokenAddress,
      symbol: pos.symbol,
      chain: pos.chain,
      side: "SELL",
      price: px,
      sizeUsd: proceeds,
      units,
      feeUsd,
      realizedPnl: pnl,
      reason,
    };
    recordFill(bot, fill);
    out.push(fill);
  }
  mark(bot);
  return out;
}

export function revalue(
  bot: BotState,
  marks: { tokenAddress: string; chain: string; price: number }[]
) {
  for (const m of marks) {
    const key = posKey(m.chain, m.tokenAddress);
    const pos = bot.positions.find((p) => posKey(p.chain, p.tokenAddress) === key);
    if (pos && m.price > 0) pos.markPrice = m.price;
  }
  mark(bot);
}
