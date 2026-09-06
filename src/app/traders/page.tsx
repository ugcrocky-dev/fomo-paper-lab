"use client";

import { useCallback, useMemo, useState } from "react";
import {
  money,
  pnlColor,
  SortTh,
  useSortableRows,
} from "@/components/SortableTable";
import { LiveBadge, useLiveRefresh } from "@/hooks/useLiveRefresh";

type Trader = {
  rank: number;
  handle: string;
  displayName: string;
  pnlUsd: number;
  volumeUsd: number;
  trades: number;
  followers: number;
  bags: string;
};

export default function TradersPage() {
  const [windowKey, setWindowKey] = useState<"h24" | "d7" | "d30" | "all">("h24");
  const [boards, setBoards] = useState<Record<string, any[]> | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const j = await fetch("/api/traders").then((r) => r.json());
    if (j.error) {
      setError(j.error);
      return;
    }
    setError("");
    setBoards(j.boards || null);
  }, []);

  const { updatedAt, live, setLive } = useLiveRefresh(load);

  const traders: Trader[] = useMemo(() => {
    const list = boards?.[windowKey] || [];
    return list.map((t: any) => ({
      rank: t.rank ?? 0,
      handle: t.handle,
      displayName: t.displayName || "",
      pnlUsd: t.pnlUsd ?? 0,
      volumeUsd: t.volumeUsd ?? 0,
      trades: t.trades ?? 0,
      followers: t.followers ?? 0,
      bags: (t.topTokens || [])
        .slice(0, 3)
        .map((tok: any) => (tok.tokenAddress || "").slice(0, 4))
        .join(" · "),
    }));
  }, [boards, windowKey]);

  const { sorted, sortKey, sortDir, toggle } = useSortableRows(traders, "pnlUsd", "desc");

  return (
    <div className="space-y-4">
      <section className="panel flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">FOMO traders</h2>
          <p className="text-sm text-[var(--muted)]">
            Live leaderboard windows. Tap headers to sort · used by discovery bots.
          </p>
        </div>
        <LiveBadge
          updatedAt={updatedAt}
          live={live}
          onToggle={() => setLive((v) => !v)}
        />
      </section>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["h24", "24h"],
            ["d7", "7d"],
            ["d30", "30d"],
            ["all", "All"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setWindowKey(k)}
            className="btn"
            style={
              windowKey === k
                ? { borderColor: "var(--accent)", color: "var(--accent)" }
                : undefined
            }
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <section className="panel overflow-x-auto">
        <table>
          <thead>
            <tr>
              <SortTh label="#" column="rank" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortTh label="Handle" column="handle" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortTh label="PnL" column="pnlUsd" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortTh label="Volume" column="volumeUsd" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortTh label="Trades" column="trades" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortTh label="Followers" column="followers" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortTh label="Top bags" column="bags" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.handle}>
                <td className="stat font-mono text-xs">{t.rank}</td>
                <td>
                  <div className="font-medium">{t.handle}</div>
                  <div className="text-xs text-[var(--muted)]">{t.displayName}</div>
                </td>
                <td className="stat" style={{ color: pnlColor(t.pnlUsd) }}>
                  {money(t.pnlUsd, 0)}
                </td>
                <td className="stat">{money(t.volumeUsd, 0)}</td>
                <td className="stat">{t.trades}</td>
                <td className="stat">{t.followers}</td>
                <td className="font-mono text-xs text-[var(--muted)]">{t.bags}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
