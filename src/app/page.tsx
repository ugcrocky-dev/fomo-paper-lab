"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { money, pnlClass } from "@/lib/format";

type TopBot = {
  id: string;
  status: string;
  tradeCount: number;
  equity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  feesPaid: number;
  netPnl: number;
  maxDrawdown: number;
  strategy?: { name: string; family: string };
};

type Overview = {
  updatedAt: string;
  strategyCount: number;
  runningCount: number;
  eligibleCount: number;
  totalEquity: number;
  totalPnl: number;
  totalFees: number;
  totalRealized: number;
  totalUnrealized: number;
  totalTrades: number;
  top: TopBot[];
};

export default function HomePage() {
  const [data, setData] = useState<Overview | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/overview");
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  async function act(action: string) {
    setBusy(action);
    setMsg("");
    try {
      if (action === "tick") {
        const res = await fetch("/api/tick", { method: "POST" });
        const json = await res.json();
        setMsg(
          json.ok
            ? `Tick: ${json.ticked} bots, ${json.fills} fills`
            : `Tick failed: ${json.error}`
        );
      } else {
        const res = await fetch("/api/bots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const json = await res.json();
        setMsg(JSON.stringify(json));
      }
      await load();
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Race desk</h2>
            <p className="text-sm text-[var(--muted)]">
              100 FOMO paper bots × $1,000. Leaderboard copy + proprietary bags. Live trading
              locked until 7-day gate.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["tick", "Run tick"],
              ["start_all", "Start all"],
              ["start_traders", "Start traders"],
              ["start_prop", "Start prop"],
              ["stop_all", "Stop all"],
            ].map(([action, label]) => (
              <button
                key={action}
                disabled={!!busy}
                onClick={() => act(action)}
                className="font-mono text-xs uppercase tracking-wider px-3 py-2 border border-[var(--line)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
              >
                {busy === action ? "…" : label}
              </button>
            ))}
          </div>
        </div>
        {msg ? <p className="mt-3 font-mono text-xs text-[var(--muted)]">{msg}</p> : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Equity", money(data?.totalEquity ?? 0)],
          ["Net PnL", money(data?.totalPnl ?? 0)],
          ["Running", String(data?.runningCount ?? 0)],
          ["Eligible", String(data?.eligibleCount ?? 0)],
          ["Trades", String(data?.totalTrades ?? 0)],
          ["Fees", money(data?.totalFees ?? 0)],
          ["Realized", money(data?.totalRealized ?? 0)],
          ["Unrealized", money(data?.totalUnrealized ?? 0)],
        ].map(([k, v]) => (
          <div key={k} className="card p-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {k}
            </p>
            <p className={`mt-1 text-xl font-semibold ${k.includes("PnL") || k === "Realized" || k === "Unrealized" ? pnlClass(Number(String(v).replace(/[$,]/g, "")) || 0) : ""}`}>
              {v}
            </p>
          </div>
        ))}
      </section>

      <section className="card overflow-x-auto">
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
          <h3 className="font-semibold">Top bots</h3>
          <Link href="/bots" className="font-mono text-xs text-[var(--accent)]">
            All bots →
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead className="font-mono text-[11px] uppercase tracking-wider text-[var(--muted)]">
            <tr className="text-left">
              <th className="px-4 py-2">Bot</th>
              <th className="px-4 py-2">Family</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Trades</th>
              <th className="px-4 py-2">Equity</th>
              <th className="px-4 py-2">Net PnL</th>
            </tr>
          </thead>
          <tbody>
            {(data?.top || []).map((b) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
