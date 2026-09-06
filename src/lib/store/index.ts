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
const BLOB_PATH = "fomo-paper-lab/lab-state.json";

/** Process-local cache so warm serverless instances keep the latest snapshot. */
declare global {
  // eslint-disable-next-line no-var
  var __fomoLabState: LabState | undefined;
}

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

function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readBlob(): Promise<LabState | null> {
  if (!blobEnabled()) return null;
  try {
    const { list, get } = await import("@vercel/blob");
    const listed = await list({ prefix: BLOB_PATH, limit: 1 });
    const hit = listed.blobs.find((b) => b.pathname === BLOB_PATH);
    if (!hit) return null;
    const result = await get(BLOB_PATH, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return normalize(JSON.parse(text) as LabState);
  } catch (err) {
    console.error("blob readState failed", err);
    return null;
  }
}

async function writeBlob(state: LabState) {
  if (!blobEnabled()) return;
  try {
    const { put } = await import("@vercel/blob");
    await put(BLOB_PATH, JSON.stringify(state), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (err) {
    console.error("blob writeState failed", err);
  }
}

function readFs(): LabState | null {
  try {
    const target = localFile();
    if (fs.existsSync(target)) {
      return normalize(JSON.parse(fs.readFileSync(target, "utf8")) as LabState);
    }
    if (process.env.VERCEL && fs.existsSync(FILE)) {
      return normalize(JSON.parse(fs.readFileSync(FILE, "utf8")) as LabState);
    }
  } catch (err) {
    console.error("fs readState failed", err);
  }
  return null;
}

function writeFs(state: LabState) {
  const target = localFile();
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(target, JSON.stringify(state, null, 2));
}

export function readState(): LabState {
  if (globalThis.__fomoLabState) return globalThis.__fomoLabState;
  const fromDisk = readFs();
  if (fromDisk) {
    globalThis.__fomoLabState = fromDisk;
    return fromDisk;
  }
  const s = defaultState();
  writeState(s);
  return s;
}

export async function readStateAsync(): Promise<LabState> {
  if (globalThis.__fomoLabState) return globalThis.__fomoLabState;
  const fromBlob = await readBlob();
  if (fromBlob) {
    globalThis.__fomoLabState = fromBlob;
    writeFs(fromBlob);
    return fromBlob;
  }
  return readState();
}

export function writeState(state: LabState) {
  state.updatedAt = new Date().toISOString();
  globalThis.__fomoLabState = state;
  writeFs(state);
  void writeBlob(state);
}

export async function writeStateAsync(state: LabState) {
  state.updatedAt = new Date().toISOString();
  globalThis.__fomoLabState = state;
  writeFs(state);
  await writeBlob(state);
}

export function patchRules(partial: Partial<RiskRules>) {
  const state = readState();
  state.rules = { ...state.rules, ...partial };
  writeState(state);
  return state;
}
