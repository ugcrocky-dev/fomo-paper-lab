import fs from "fs";
import path from "path";
import {
  BotState,
  DEFAULT_RULES,
  LabState,
  RiskRules,
  STARTING_BANKROLL,
} from "../types";
import { ALL_STRATEGIES } from "../strategies/catalog";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "lab-state.json");

function emptyBot(strategyId: string): BotState {
  return {
    id: `bot_${strategyId}`,
    strategyId,
    status: "stopped",
    cash: STARTING_BANKROLL,
    equity: STARTING_BANKROLL,
    startingBankroll: STARTING_BANKROLL,
    realizedPnl: 0,
    unrealizedPnl: 0,
    feesPaid: 0,
    maxEquity: STARTING_BANKROLL,
    maxDrawdown: 0,
    tradeCount: 0,
    winCount: 0,
    runningSince: null,
    stoppedAt: null,
    lastTickAt: null,
    lastError: null,
    positions: [],
    fills: [],
    watchedHandles: [],
  };
}

export function defaultState(): LabState {
  return {
    updatedAt: new Date().toISOString(),
    rules: { ...DEFAULT_RULES },
    bots: ALL_STRATEGIES.map((s) => emptyBot(s.id)),
  };
}

function normalize(parsed: LabState): LabState {
  const map = new Map((parsed.bots || []).map((b) => [b.strategyId, b]));
  for (const s of ALL_STRATEGIES) if (!map.has(s.id)) map.set(s.id, emptyBot(s.id));
  parsed.bots = ALL_STRATEGIES.map((s) => {
    const b = map.get(s.id)!;
    if (typeof b.feesPaid !== "number") b.feesPaid = 0;
    if (typeof b.realizedPnl !== "number") b.realizedPnl = 0;
    if (typeof b.unrealizedPnl !== "number") b.unrealizedPnl = 0;
    if (!Array.isArray(b.watchedHandles)) b.watchedHandles = [];
    if (!Array.isArray(b.positions)) b.positions = [];
    if (!Array.isArray(b.fills)) b.fills = [];
    return b;
  });
  parsed.rules = { ...DEFAULT_RULES, ...(parsed.rules || {}) };
  return parsed;
}

function localFile() {
  return process.env.VERCEL ? path.join("/tmp", "lab-state.json") : FILE;
}

export function readState(): LabState {
  try {
    const target = localFile();
    if (fs.existsSync(target)) {
      return normalize(JSON.parse(fs.readFileSync(target, "utf8")) as LabState);
    }
    if (process.env.VERCEL && fs.existsSync(FILE)) {
      return normalize(JSON.parse(fs.readFileSync(FILE, "utf8")) as LabState);
    }
  } catch (err) {
    console.error("readState failed", err);
  }
  const s = defaultState();
  writeState(s);
  return s;
}

export async function readStateAsync(): Promise<LabState> {
  return readState();
}

export function writeState(state: LabState) {
  state.updatedAt = new Date().toISOString();
  const target = localFile();
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(target, JSON.stringify(state, null, 2));
}

export async function writeStateAsync(state: LabState) {
  writeState(state);
}

export function patchRules(partial: Partial<RiskRules>) {
  const state = readState();
  state.rules = { ...state.rules, ...partial };
  writeState(state);
  return state;
}
