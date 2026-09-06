"use client";

import { useEffect, useState } from "react";
import { money, pnlClass } from "@/lib/format";

export default function TradesPage() {
  const [trades, setTrades] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/trades?limit=300")
      .then((r) => r.json())
      .then((j) => setTrades(j.trades || []));
  }, []);

  return (
    <div className="card overflow-x-auto">
      <div className="px-4 py-3 border-b border-[var(--line)] font-semibold">Paper fills</div>
      <table className="w-full text-sm">
        <thead className="font-mono text-[11px] uppercase text-[var(--muted)]">
          <tr className="text-left">
            <th className="px-4 py-2">Time</th>
            <th className="px-4 py-2">Bot</th>
            <th className="px-4 py-2">Side</th>
            <th className="px-4 py-2">Token</th>
            <th className="px-4 py-2">Size</th>
            <th className="px-4 py-2">Fee</th>
            <th className="px-4 py-2">Realized</th>
            <th className="px-4 py-2">Reason</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-t border-[var(--line)]">
              <td className="px-4 py-2 font-mono text-xs">{new Date(t.ts).toLocaleString()}</td>
              <td className="px-4 py-2 font-mono text-xs">{t.botId}</td>
              <td className="px-4 py-2">{t.side}</td>
              <td className="px-4 py-2">{t.symbol}</td>
              <td className="px-4 py-2">{money(t.sizeUsd)}</td>
              <td className="px-4 py-2">{money(t.feeUsd)}</td>
              <td className={`px-4 py-2 ${pnlClass(t.realizedPnl || 0)}`}>{money(t.realizedPnl || 0)}</td>
              <td className="px-4 py-2 text-[var(--muted)]">{t.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
