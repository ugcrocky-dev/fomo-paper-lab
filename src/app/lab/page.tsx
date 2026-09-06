"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { money, pnlClass } from "@/lib/format";

export default function LabPage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/lab")
      .then((r) => r.json())
      .then((j) => setRows(j.scoreboard || []));
  }, []);

  return (
    <div className="card overflow-x-auto">
      <div className="px-4 py-3 border-b border-[var(--line)]">
        <h2 className="font-semibold">Lab scoreboard</h2>
        <p className="text-sm text-[var(--muted)]">Ranked by net paper PnL. Eligible after 7 continuous days.</p>
      </div>
      <table className="w-full text-sm">
        <thead className="font-mono text-[11px] uppercase text-[var(--muted)]">
          <tr className="text-left">
            <th className="px-4 py-2">#</th>
            <th className="px-4 py-2">Strategy</th>
            <th className="px-4 py-2">Family</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Equity</th>
            <th className="px-4 py-2">Net PnL</th>
            <th className="px-4 py-2">Trades</th>
            <th className="px-4 py-2">Max DD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t border-[var(--line)]">
              <td className="px-4 py-2 font-mono text-xs">{i + 1}</td>
              <td className="px-4 py-2">
                <Link href={`/bots/${r.id}`} className="hover:text-[var(--accent)]">
                  {r.name}
                </Link>
              </td>
              <td className="px-4 py-2 font-mono text-xs text-[var(--muted)]">{r.family}</td>
              <td className="px-4 py-2 font-mono text-xs">{r.status}</td>
              <td className="px-4 py-2">{money(r.equity)}</td>
              <td className={`px-4 py-2 ${pnlClass(r.netPnl)}`}>{money(r.netPnl)}</td>
              <td className="px-4 py-2">{r.tradeCount}</td>
              <td className="px-4 py-2">{Number(r.maxDrawdown || 0).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
