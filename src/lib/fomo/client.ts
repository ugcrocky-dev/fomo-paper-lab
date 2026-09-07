export type FomoToken = {
  tokenAddress: string;
  networkId: number;
  imageUrl?: string;
  humanAmount?: number;
  price: number;
  value?: number;
  pnl?: number;
};

export type FomoTrader = {
  rank: number;
  handle: string;
  displayName: string;
  pnlUsd: number;
  volumeUsd: number;
  trades: number;
  followers: number;
  holdings: number;
  wallets: { solana?: string | null; evm?: string | null };
  topTokens: FomoToken[];
  verified?: boolean;
  avatar?: string;
  description?: string | null;
};

export type LeaderboardWindow = "24h" | "7d" | "30d" | "all";

export type LeaderboardResponse = {
  window: LeaderboardWindow;
  source: string;
  capturedAt: string;
  count: number;
  traders: FomoTrader[];
};

const BASE = "https://api.fomoapi.io";

function chainFromNetworkId(networkId: number): string {
  if (networkId === 1399811149) return "solana";
  if (networkId === 8453) return "base";
  if (networkId === 1) return "ethereum";
  if (networkId === 56) return "bsc";
  if (networkId === 4663) return "robinhood";
  return `chain-${networkId}`;
}

export function tokenKey(t: Pick<FomoToken, "tokenAddress" | "networkId">) {
  return `${chainFromNetworkId(t.networkId)}:${t.tokenAddress.toLowerCase()}`;
}

export function tokenMeta(t: FomoToken) {
  const chain = chainFromNetworkId(t.networkId);
  const short = t.tokenAddress.slice(0, 4) + "…" + t.tokenAddress.slice(-4);
  return {
    key: tokenKey(t),
    tokenAddress: t.tokenAddress,
    chain,
    symbol: short,
    price: Number(t.price) || 0,
    value: Number(t.value) || 0,
    pnl: Number(t.pnl) || 0,
  };
}

async function getJson<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = process.env.FOMO_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${BASE}${path}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`FOMO HTTP ${res.status} for ${path}`);
  return (await res.json()) as T;
}

export async function fetchLeaderboard(
  window: LeaderboardWindow,
  limit = 50
): Promise<LeaderboardResponse> {
  return getJson<LeaderboardResponse>(`/v2/leaderboard/${window}?limit=${limit}`);
}

/**
 * Credit-light board pull: one metered call (24h). Other windows are filled
 * from the same rows so multi-window strategies still run without 4× burn.
 * Free FOMO tier is ~1,000 credits/mo — 4 windows × frequent ticks exhausts it.
 */
export async function fetchBoards(limit = 50) {
  const h24 = await fetchLeaderboard("24h", limit);
  const clone = (window: LeaderboardWindow): LeaderboardResponse => ({
    ...h24,
    window,
    source: `${h24.source || "fomo-live"}+24h-proxy`,
  });
  return {
    h24,
    d7: clone("7d"),
    d30: clone("30d"),
    all: clone("all"),
  };
}

/** Full 4-window pull (4 credits). Use sparingly — not on the hourly cron path. */
export async function fetchBoardsFull(limit = 50) {
  const [h24, d7, d30, all] = await Promise.all([
    fetchLeaderboard("24h", limit),
    fetchLeaderboard("7d", limit),
    fetchLeaderboard("30d", limit),
    fetchLeaderboard("all", limit),
  ]);
  return { h24, d7, d30, all };
}

export function buildPriceMap(
  boards: Awaited<ReturnType<typeof fetchBoards>>
): Map<string, { price: number; symbol: string; chain: string; tokenAddress: string }> {
  const map = new Map<
    string,
    { price: number; symbol: string; chain: string; tokenAddress: string }
  >();
  for (const board of [boards.h24, boards.d7, boards.d30, boards.all]) {
    for (const trader of board.traders || []) {
      for (const tok of trader.topTokens || []) {
        if (!tok?.tokenAddress || !(Number(tok.price) > 0)) continue;
        const meta = tokenMeta(tok);
        map.set(meta.key, {
          price: meta.price,
          symbol: meta.symbol,
          chain: meta.chain,
          tokenAddress: meta.tokenAddress,
        });
      }
    }
  }
  return map;
}
