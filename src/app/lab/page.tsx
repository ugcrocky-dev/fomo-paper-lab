"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  money,
  pnlColor,
  SortTh,
  useSortableRows,
} from "@/components/SortableTable";
import { PnlBars } from "@/components/PnlBars";
import { LiveBadge, useLiveRefresh } from "@/hooks/useLiveRefresh";

type Row = {
  id: string;
  name: string;
  family: string;
  status: string;
  equity: number;
  netPnl: number;
  tradeCount: number;
  maxDrawdown: number;
  feesPaid: number;
  eligible: boolean;
  days: number;
};

export default function LabPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [winners, setWinners] = useState(0);
  const [rules, setRules] = useState<{
    promotionDays?: number;
    minTradesForPromotion?: number;
    maxDrawdownPctForPromotion?: number;
  } | null>(null);

  const load = useCallback(async () => {
    const j = await fetch("/api/lab").then((r) => r.json());
    const mapped: Row[] = (j.scoreboard || []).map(
      (r: {
        id: string;
        name: string;
        family: string;
        status: string;
        equity: number;
        netPnl: number;
        tradeCount: number;
        maxDrawdown: number;
        feesPaid?: number;
        eligible?: boolean;
        runningSince?: string | null;
      }) => {
        const days = r.runningSince
          ? (Date.now() - new Date(r.runningSince).getTime()) / (1000 * 60 * 60 * 24)
          : 0;
        return {
          id: r.id,
          name: r.name,
          family: r.family,
          status: r.status,
          equity: r.equity,
          netPnl: r.netPnl,
          tradeCount: r.tradeCount,
          maxDrawdown: r.maxDrawdown || 0,
          feesPaid: r.feesPaid || 0,
          eligible: !!r.eligible,
          days,
        };
      }
    );
    setRows(mapped);
    setWinners(mapped.filter((r) => r.eligible).length);
    setRules(j.rules || null);
  }, []);

  const { updatedAt, live, setLive } = useLiveRefresh(load);
  const { sorted, sortKey, sortDir, toggle } = useSortableRows(rows, "netPnl", "desc");

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h2 className="text-2xl font-semibold">Strategy lab</h2>
        <p className="text-sm text-[var(--muted)]">
          Rank after continuous running. Gate: {rules?.promotionDays ?? 7} days, ≥
          {rules?.minTradesForPromotion ?? 10} trades, DD ≤
          {rules?.maxDrawdownPctForPromotion ?? 35}%. Fees included in Net PnL.
        </p>
        <div className="mt-2">
          <LiveBadge
            updatedAt={updatedAt}
            live={live}
            onToggle={() => setLive((v) => !v)}
          />
        </div>
        <p className="mt-2 font-mono text-sm text-[var(--accent)]">
          Eligible for live: {winners} · tap headers to sort
        </p>
      </section>

      <PnlBars
        rows={rows.map((r) => ({ id: r.id, name: r.name, netPnl: r.netPnl }))}
        title="Lab PnL chart"
        limit={25}
      />

      <section className="panel overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <SortTh label="Strategy" column="name" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortTh label="Family" column="family" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortTh label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortTh label="Days" column="days" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortTh label="Trades" column="tradeCount" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortTh label="DD%" column="maxDrawdown" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortTh label="Fees" column="feesPaid" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortTh label="Equity" column="equity" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortTh label="Net PnL" column="netPnl" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.id}>
                <td className="stat">{i + 1}</td>
                <td>
                  <Link href={`/bots/${encodeURIComponent(r.id)}`} className="text-[var(--accent)]">
                    {r.name}
                  </Link>
                </td>
                <td className="font-mono text-xs">{r.family}</td>
                <td className="font-mono text-xs">
                  {r.eligible ? "eligible_for_live" : r.status}
                </td>
                <td className="stat">{r.days.toFixed(1)}</td>
                <td className="stat">{r.tradeCount}</td>
                <td className="stat">{r.maxDrawdown.toFixed(1)}</td>
                <td className="stat text-[var(--muted)]">{money(r.feesPaid)}</td>
                <td className="stat">{money(r.equity)}</td>
                <td className="stat" style={{ color: pnlColor(r.netPnl) }}>
                  {money(r.netPnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
