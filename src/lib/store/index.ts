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
const RUNTIME_CACHE_KEY = "fomo-paper-lab:lab-state";
const RUNTIME_CACHE_TTL = 60 * 60 * 24 * 14; // 14 days
const MAX_FILLS_PER_BOT = 40;

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
    buyCooldownUntil: {},
    execStrategyId: strategyId,
    adaptationCount: 0,
    lastAdaptationAt: null,
    lastAdaptationNote: null,
  };
}

export function defaultState(): LabState {
  return {
    updatedAt: new Date().toISOString(),
    rules: { ...DEFAULT_RULES },
    bots: ALL_STRATEGIES.map((s) => emptyBot(s.id)),
    optimizeLog: [],
    lastOptimizeAt: null,
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
    if (!b.buyCooldownUntil || typeof b.buyCooldownUntil !== "object") {
      b.buyCooldownUntil = {};
    }
    if (!b.execStrategyId) b.execStrategyId = b.strategyId;
    if (typeof b.adaptationCount !== "number") b.adaptationCount = 0;
    if (b.lastAdaptationAt === undefined) b.lastAdaptationAt = null;
    if (b.lastAdaptationNote === undefined) b.lastAdaptationNote = null;
    if (b.fills.length > MAX_FILLS_PER_BOT) {
      b.fills = b.fills.slice(-MAX_FILLS_PER_BOT);
    }
    return b;
  });
  parsed.rules = { ...DEFAULT_RULES, ...(parsed.rules || {}) };
  if (!Array.isArray(parsed.optimizeLog)) parsed.optimizeLog = [];
  if (parsed.lastOptimizeAt === undefined) parsed.lastOptimizeAt = null;
  return parsed;
}

function pruneForRemote(state: LabState): LabState {
  return {
    ...state,
    bots: state.bots.map((b) => ({
      ...b,
      fills: (b.fills || []).slice(-MAX_FILLS_PER_BOT),
    })),
  };
}

function localFile() {
  return process.env.VERCEL ? path.join("/tmp", "lab-state.json") : FILE;
}

function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readRuntimeCache(): Promise<LabState | null> {
  if (!process.env.VERCEL) return null;
  try {
    const { getCache } = await import("@vercel/functions");
    const cached = await getCache().get(RUNTIME_CACHE_KEY);
    if (!cached) return null;
    return normalize(cached as LabState);
  } catch (err) {
    console.error("runtime cache readState failed", err);
    return null;
  }
}

async function writeRuntimeCache(state: LabState) {
  if (!process.env.VERCEL) return;
  try {
    const { getCache } = await import("@vercel/functions");
    await getCache().set(RUNTIME_CACHE_KEY, pruneForRemote(state), {
      ttl: RUNTIME_CACHE_TTL,
      tags: ["fomo-lab-state"],
    });
  } catch (err) {
    console.error("runtime cache writeState failed", err);
  }
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
    await put(BLOB_PATH, JSON.stringify(pruneForRemote(state)), {
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
  fs.writeFileSync(target, JSON.stringify(pruneForRemote(state), null, 2));
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
  // Prefer shared Runtime Cache over process memory so warm instances
  // do not serve a stale snapshot after another lambda wrote newer state.
  const fromRuntime = await readRuntimeCache();
  if (fromRuntime) {
    const local = globalThis.__fomoLabState;
    if (!local || fromRuntime.updatedAt >= local.updatedAt) {
      globalThis.__fomoLabState = fromRuntime;
      writeFs(fromRuntime);
      return fromRuntime;
    }
    return local;
  }

  if (globalThis.__fomoLabState) return globalThis.__fomoLabState;

  const fromBlob = await readBlob();
  if (fromBlob) {
    globalThis.__fomoLabState = fromBlob;
    writeFs(fromBlob);
    void writeRuntimeCache(fromBlob);
    return fromBlob;
  }

  return readState();
}

export function writeState(state: LabState) {
  state.updatedAt = new Date().toISOString();
  globalThis.__fomoLabState = state;
  writeFs(state);
  void writeRuntimeCache(state);
  void writeBlob(state);
}

export async function writeStateAsync(state: LabState) {
  state.updatedAt = new Date().toISOString();
  globalThis.__fomoLabState = state;
  writeFs(state);
  await Promise.all([writeRuntimeCache(state), writeBlob(state)]);
}

export function patchRules(partial: Partial<RiskRules>) {
  const state = readState();
  state.rules = { ...state.rules, ...partial };
  writeState(state);
  return state;
}

/** Wipe bot books back to $1,000 cash while keeping current risk rules. */
export async function resetLabBooks() {
  const prev = await readStateAsync();
  const next = defaultState();
  next.rules = { ...DEFAULT_RULES, ...(prev.rules || {}) };
  // Never re-introduce the broken 1% fee from a stale snapshot.
  if (next.rules.takerFeeRate > 0.006) next.rules.takerFeeRate = 0.005;
  if (next.rules.slippageBps > 40) next.rules.slippageBps = 30;
  await writeStateAsync(next);
  return next;
}
