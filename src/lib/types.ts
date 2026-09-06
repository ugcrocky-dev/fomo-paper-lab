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

/** Default risk overlay applied every tick so buy-and-hold bots can exit. */
export const DEFAULT_TAKE_PROFIT_PCT = 0.12;
export const DEFAULT_STOP_LOSS_PCT = 0.08;
/** Cap how deep a bot can average into one bag before needing an exit. */
export const MAX_POSITION_PCT_BANKROLL = 0.35;
