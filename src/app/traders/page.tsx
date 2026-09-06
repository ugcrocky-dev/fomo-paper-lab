"use client";

import { useEffect, useState } from "react";
import { money, pnlClass } from "@/lib/format";

export default function TradersPage() {
  const [window, setWindow] = useState<"h24" | "d7" | "d30" | "all">("h24");
  const [boards, setBoards] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/traders")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setBoards(j.boards);
      });
  }, []);

  const traders = boards?.[window] || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {([
          ["h24", "24h"],
          ["d7", "7d"],
          ["d30", "30d"],
          ["all", "All"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setWindow(k)}
            className={`font-mono text-xs uppercase tracking-wider px-3 py-2 border ${
              window === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? <p className="text-[var(--danger)] text-sm">{error}</p> : null}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="font-mono text-[11px] uppercase text-[var(--muted)]">
            <tr className="text-left">
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Handle</th>
              <th className="px-4 py-2">PnL</th>
              <th className="px-4 py-2">Volume</th>
              <th className="px-4 py-2">Trades</th>
              <th className="px-4 py-2">Followers</th>
              <th className="px-4 py-2">Top bags</th>
            </tr>
          </thead>
          <tbody>
            {traders.map((t: any) => (
              <tr key={t.handle} className="border-t border-[var(--line)]">
                <td className="px-4 py-2 font-mono text-xs">{t.rank}</td>
                <td className="px-4 py-2">
                  <div className="font-medium">{t.handle}</div>
                  <div className="text-xs text-[var(--muted)]">{t.displayName}</div>
                </td>
                <td className={`px-4 py-2 ${pnlClass(t.pnlUsd)}`}>{money(t.pnlUsd, 0)}</td>
                <td className="px-4 py-2">{money(t.volumeUsd, 0)}</td>
                <td className="px-4 py-2">{t.trades}</td>
                <td className="px-4 py-2">{t.followers}</td>
                <td className="px-4 py-2 text-xs text-[var(--muted)]">
                  {(t.topTokens || []).slice(0, 3).map((tok: any) => tok.tokenAddress.slice(0, 4)).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
