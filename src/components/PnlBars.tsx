"use client";

import { money, pnlColor } from "@/components/SortableTable";

export type PnlBarRow = {
  id: string;
  name: string;
  netPnl: number;
};

/** Simple horizontal bar chart of bot net PnL (Polymarket-desk style visual). */
export function PnlBars({
  rows,
  limit = 20,
  title = "Net PnL distribution",
}: {
  rows: PnlBarRow[];
  limit?: number;
  title?: string;
}) {
  const sliced = [...rows]
    .sort((a, b) => Math.abs(b.netPnl) - Math.abs(a.netPnl))
    .slice(0, limit);
  const max = Math.max(1, ...sliced.map((r) => Math.abs(r.netPnl)));

  if (!sliced.length) {
    return (
      <div className="panel p-4 text-sm text-[var(--muted)]">
        No PnL data yet — run a tick to populate the chart.
      </div>
    );
  }

  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-xs uppercase tracking-[0.16em]">{title}</h3>
        <p className="font-mono text-[11px] text-[var(--muted)]">
          top {sliced.length} by |PnL|
        </p>
      </div>
      <div className="space-y-2">
        {sliced.map((r) => {
          const pct = (Math.abs(r.netPnl) / max) * 100;
          const positive = r.netPnl >= 0;
          return (
            <div key={r.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2">
              <div className="truncate font-mono text-[11px] text-[var(--muted)]" title={r.name}>
                {r.name}
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-sm bg-[color-mix(in_oklab,var(--line)_70%,transparent)]">
                <div
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{
                    width: `${pct}%`,
                    background: positive ? "var(--accent)" : "var(--danger)",
                    opacity: 0.85,
                  }}
                />
              </div>
              <div
                className="stat min-w-[4.5rem] text-right font-mono text-xs"
                style={{ color: pnlColor(r.netPnl) }}
              >
                {money(r.netPnl)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function FamilySplit({
  traderPnl,
  propPnl,
}: {
  traderPnl: number;
  propPnl: number;
}) {
  const total = Math.abs(traderPnl) + Math.abs(propPnl) || 1;
  const tPct = (Math.abs(traderPnl) / total) * 100;
  const pPct = (Math.abs(propPnl) / total) * 100;
  return (
    <section className="panel p-4">
      <h3 className="mb-3 font-mono text-xs uppercase tracking-[0.16em]">
        Family PnL split
      </h3>
      <div className="mb-2 flex h-3 overflow-hidden rounded-sm">
        <div style={{ width: `${tPct}%`, background: "var(--accent)" }} title="Trader discovery" />
        <div style={{ width: `${pPct}%`, background: "var(--warn)" }} title="Proprietary" />
      </div>
      <div className="flex flex-wrap gap-4 font-mono text-xs text-[var(--muted)]">
        <span>
          Trader discovery{" "}
          <span style={{ color: pnlColor(traderPnl) }}>{money(traderPnl)}</span>
        </span>
        <span>
          Proprietary{" "}
          <span style={{ color: pnlColor(propPnl) }}>{money(propPnl)}</span>
        </span>
      </div>
    </section>
  );
}
