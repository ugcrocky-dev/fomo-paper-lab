"use client";

import Link from "next/link";
import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  money,
  pnlColor,
  SortTh,
  useSortableRows,
} from "@/components/SortableTable";
import { LiveBadge, useLiveRefresh } from "@/hooks/useLiveRefresh";

type TradeRow = {
  id: string;
  botId: string;
  ts: string;
  symbol: string;
  side: string;
  sizeUsd: number;
  feeUsd: number;
  realizedPnl: number;
  reason: string;
  price: number;
};

function TradesInner() {
  const search = useSearchParams();
  const botId = search.get("botId") || "";
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const url = botId
      ? `/api/trades?botId=${encodeURIComponent(botId)}&limit=500`
      : "/api/trades?limit=500";
    const res = await fetch(url);
    const json = await res.json();
    setRows(
      (json.trades || []).map(
        (t: {
          id: string;
          botId: string;
          ts: string;
          symbol?: string;
          side: string;
          sizeUsd?: number;
          feeUsd?: number;
          realizedPnl?: number;
          reason?: string;
          price?: number;
        }) => ({
          id: t.id,
          botId: t.botId,
          ts: t.ts,
          symbol: t.symbol || "",
          side: t.side,
          sizeUsd: t.sizeUsd || 0,
          feeUsd: t.feeUsd || 0,
          realizedPnl: t.realizedPnl || 0,
          reason: t.reason || "",
          price: t.price || 0,
        })
      )
    );
  }, [botId]);

  const { updatedAt, live, setLive } = useLiveRefresh(load);
  const filtered = useMemo(() => {
    if (!q) return rows;
    const n = q.toLowerCase();
    return rows.filter((r) =>
      `${r.botId} ${r.symbol} ${r.reason} ${r.side}`.toLowerCase().includes(n)
    );
  }, [rows, q]);
  const sort = useSortableRows(filtered, "ts", "desc");

  return (
    <div className="space-y-4">
      <section className="panel flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Trade journal</h2>
          <p className="text-sm text-[var(--muted)]">
            Paper fills across the lab
            {botId ? " · filtered to one bot" : " · all bots"}. Tap headers to sort.
          </p>
        </div>
        <LiveBadge
          updatedAt={updatedAt}
          live={live}
          onToggle={() => setLive((v) => !v)}
        />
      </section>

      <section className="flex flex-wrap gap-2">
        <input
          className="btn min-w-[220px] normal-case tracking-normal"
          placeholder="Search bot / token / reason"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {botId ? (
          <Link href="/trades" className="btn">
            Clear bot filter
          </Link>
        ) : null}
      </section>

      <section className="panel overflow-x-auto">
        <table>
          <thead>
            <tr>
              <SortTh label="Time" column="ts" sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.toggle} />
              <SortTh label="Bot" column="botId" sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.toggle} />
              <SortTh label="Side" column="side" sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.toggle} />
              <SortTh label="Token" column="symbol" sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.toggle} />
              <SortTh label="Price" column="price" sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.toggle} />
              <SortTh label="Size" column="sizeUsd" sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.toggle} />
              <SortTh label="Fee" column="feeUsd" sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.toggle} />
              <SortTh label="Realized" column="realizedPnl" sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.toggle} />
              <SortTh label="Reason" column="reason" sortKey={sort.sortKey} sortDir={sort.sortDir} onSort={sort.toggle} />
            </tr>
          </thead>
          <tbody>
            {sort.sorted.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap font-mono text-[11px]">
                  {new Date(t.ts).toLocaleString()}
                </td>
                <td>
                  <Link
                    href={`/bots/${encodeURIComponent(t.botId)}`}
                    className="font-mono text-xs text-[var(--accent)]"
                  >
                    {t.botId}
                  </Link>
                </td>
                <td
                  className="font-mono text-xs"
                  style={{
                    color: t.side === "BUY" ? "var(--accent)" : "var(--danger)",
                  }}
                >
                  {t.side}
                </td>
                <td>{t.symbol}</td>
                <td className="stat">{t.price ? t.price.toPrecision(4) : "—"}</td>
                <td className="stat">{money(t.sizeUsd)}</td>
                <td className="stat text-[var(--muted)]">{money(t.feeUsd)}</td>
                <td className="stat" style={{ color: pnlColor(t.realizedPnl) }}>
                  {money(t.realizedPnl)}
                </td>
                <td
                  className="max-w-[12rem] truncate font-mono text-[11px] text-[var(--muted)]"
                  title={t.reason}
                >
                  {t.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default function TradesPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading trades…</p>}>
      <TradesInner />
    </Suspense>
  );
}
