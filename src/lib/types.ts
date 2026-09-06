export type StrategyFamily = "trader_discovery" | "proprietary";
export type BotStatus = "stopped" | "running" | "eligible_for_live" | "error";

export type StrategyDef = {
  id: string;
  name: string;
  family: StrategyFamily;
  description: string;
  params: Record<string, string | number | boolean>;
};

export type PaperFill = {
  id: string;
  botId: string;
  ts: string;
  tokenAddress: string;
  symbol: string;
  chain: string;
  side: "BUY" | "SELL";
  price: number;
  sizeUsd: number;
  units: number;
  feeUsd: number;
  realizedPnl: number;
  reason: string;
  sourceHandle?: string;
};

export type PaperPosition = {
  tokenAddress: string;
  symbol: string;
  chain: string;
  units: number;
  avgPrice: number;
  markPrice: number;
};

export type BotState = {
  id: string;
  strategyId: string;
  /**
   * Strategy actually executed on ticks. When a bot is unprofitable, daily
   * optimize points this at a winning playbook while keeping strategyId stable
   * (bot identity / normalize key).
   */
  execStrategyId?: string;
  status: BotStatus;
  cash: number;
  equity: number;
  startingBankroll: number;
  realizedPnl: number;
  unrealizedPnl: number;
  feesPaid: number;
  maxEquity: number;
  maxDrawdown: number;
  tradeCount: number;
  winCount: number;
  runningSince: string | null;
  stoppedAt: string | null;
  lastTickAt: string | null;
  lastError: string | null;
  positions: PaperPosition[];
  fills: PaperFill[];
  watchedHandles: string[];
  /** tokenKey -> ISO time until which new buys of that token are blocked */
  buyCooldownUntil?: Record<string, string>;
  adaptationCount?: number;
  lastAdaptationAt?: string | null;
  lastAdaptationNote?: string | null;
};

export type OptimizeAction = {
  at: string;
  botId: string;
  botName: string;
  action: "retune" | "pause" | "restart_winner_book";
  fromStrategyId: string;
  toStrategyId: string;
  netPnl: number;
  tradeCount: number;
  reason: string;
};

export type RiskRules = {
  maxUsdPerTrade: number;
  maxPctBankroll: number;
  skipPriceAbove: number;
  skipPriceBelow: number;
  slippageBps: number;
  takerFeeRate: number;
  chargeTakerFees: boolean;
  promotionDays: number;
  minTradesForPromotion: number;
  maxDrawdownPctForPromotion: number;
};

export type LabState = {
  updatedAt: string;
  rules: RiskRules;
  bots: BotState[];
  optimizeLog?: OptimizeAction[];
  lastOptimizeAt?: string | null;
};

export const STARTING_BANKROLL = 1000;

export const DEFAULT_RULES: RiskRules = {
  maxUsdPerTrade: 50,
  maxPctBankroll: 5,
  skipPriceAbove: 0,
  skipPriceBelow: 1e-10,
  // FOMO spot is ~0.50% (terms: 0.50% min, referral ~0.45%). 1% was double-charging.
  slippageBps: 30,
  takerFeeRate: 0.005,
  chargeTakerFees: true,
  promotionDays: 7,
  minTradesForPromotion: 10,
  maxDrawdownPctForPromotion: 35,
};

/**
 * Take-profit overlay only. A hard stop-loss was stop-hunting memecoins every
 * minute (hundreds of risk_sl fills) and locking in losses — then bots rebought.
 * Strategy-specific cut/trim modes still handle losers deliberately.
 */
export const DEFAULT_TAKE_PROFIT_PCT = 0.25;
/** Cap how deep a bot can average into one bag before needing an exit. */
export const MAX_POSITION_PCT_BANKROLL = 0.35;
/** After selling a bag, wait before rebuying the same token (ms). */
export const REBUY_COOLDOWN_MS = 45 * 60 * 1000;
