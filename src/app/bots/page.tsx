"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { money, pnlClass } from "@/lib/format";

type BotRow = {
  id: string;
  status: string;
  tradeCount: number;
  equity: number;
  netPnl: number;
  maxDrawdown: number;
  feesPaid: number;
  strategy?: { name: string; family: string; description?: string };
};

export default function BotsPage() {
  const [bots, setBots] = useState<BotRow[]>([]);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const res = await fetch("/api/bots");
    const json = await res.json();
    setBots(json.bots || []);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const rows = bots.filter((b) => {
    if (filter === "all") return true;
    if (filter === "running") return b.status === "running" || b.status === "eligible_for_live";
    if (filter === "traders") return b.strategy?.family === "trader_discovery";
    if (filter === "prop") return b.strategy?.family === "proprietary";
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          ["all", "All"],
          ["running", "Running"],
          ["traders", "Trader discovery"],
          ["prop", "Proprietary"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`font-mono text-xs uppercase tracking-wider px-3 py-2 border ${
              filter === k
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--line)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="font-mono text-[11px] uppercase tracking-wider text-[var(--muted)]">
            <tr className="text-left">
              <th className="px-4 py-2">Strategy</th>
              <th className="px-4 py-2">Family</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Trades</th>
              <th className="px-4 py-2">Equity</th>
              <th className="px-4 py-2">Net PnL</th>
              <th className="px-4 py-2">Max DD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-2">
                  <Link href={`/bots/${b.id}`} className="hover:text-[var(--accent)]">
                    {b.strategy?.name || b.id}
                  </Link>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-[var(--muted)]">
                  {b.strategy?.family}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{b.status}</td>
                <td className="px-4 py-2">{b.tradeCount}</td>
                <td className="px-4 py-2">{money(b.equity)}</td>
                <td className={`px-4 py-2 ${pnlClass(b.netPnl)}`}>{money(b.netPnl)}</td>
                <td className="px-4 py-2">{b.maxDrawdown.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
