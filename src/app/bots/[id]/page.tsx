"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  money,
  pnlColor,
  SortTh,
  useSortableRows,
} from "@/components/SortableTable";
import { LiveBadge, useLiveRefresh } from "@/hooks/useLiveRefresh";

type Fill = {
  id: string;
  ts: string;
  side: string;
  symbol: string;
  price: number;
  sizeUsd: number;
  feeUsd: number;
  realizedPnl: number;
  reason: string;
};

type Position = {
  tokenAddress: string;
  symbol: string;
  chain: string;
  units: number;
  avgPrice: number;
  markPrice: number;
  unreal: number;
  value: number;
};

export default function BotDetailPage() {
  const params = useParams<{ id: string }>();
  const [bot, setBot] = useState<any>(null);
  const [strategy, setStrategy] = useState<any>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/bots/${encodeURIComponent(params.id)}`);
    const json = await res.json();
    setBot(json.bot);
    setStrategy(json.strategy);
  }, [params.id]);

  const { updatedAt, live, setLive, refresh } = useLiveRefresh(load);

  const positions: Position[] = useMemo(() => {
    return (bot?.positions || []).map((p: any) => ({
      ...p,
      unreal: (p.markPrice - p.avgPrice) * p.units,
      value: p.markPrice * p.units,
    }));
  }, [bot]);

  const fills: Fill[] = useMemo(() => bot?.fills || [], [bot]);

  const posSort = useSortableRows(positions, "value", "desc");
  const fillSort = useSortableRows(fills, "ts", "desc");

  async function setStatus(action: "start" | "stop") {
    const res = await fetch(`/api/bots/${encodeURIComponent(params.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    setMsg(json.error || `status → ${json.bot?.status}`);
    await refresh();
  }

  if (!bot) return <p className="text-[var(--muted)]">Loading trade book…</p>;

  const netPnl = bot.equity - (bot.startingBankroll || 1000);

  return (
    <div className="space-y-4">
      <section className="panel space-y-3 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/bots" className="font-mono text-xs text-[var(--accent)]">
              ← Bots
            </Link>
            <h2 className="mt-1 text-2xl font-semibold">{strategy?.name || bot.id}</h2>
            <p className="max-w-2xl text-sm text-[var(--muted)]">{strategy?.description}</p>
            <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
              {bot.id} · {strategy?.family} · {bot.status}
              {bot.lastTickAt ? ` · last tick ${new Date(bot.lastTickAt).toLocaleString()}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <LiveBadge
              updatedAt={updatedAt}
              live={live}
              onToggle={() => setLive((v) => !v)}
            />
            <div className="flex gap-2">
              <button className="btn" onClick={() => setStatus("start")}>
                Start
              </button>
              <button className="btn btn-danger" onClick={() => setStatus("stop")}>
                Stop
              </button>
              <Link
                href={`/trades?botId=${encodeURIComponent(bot.id)}`}
                className="btn"
              >
                Journal
              </Link>
            </div>
          </div>
        </div>
        {msg ? <p className="font-mono text-xs text-[var(--muted)]">{msg}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {[
            ["Equity", money(bot.equity), null as number | null],
            ["Cash", money(bot.cash), null],
            ["Net PnL", money(netPnl), netPnl],
            ["Realized", money(bot.realizedPnl), bot.realizedPnl],
            ["Unrealized", money(bot.unrealizedPnl), bot.unrealizedPnl],
            ["Fees", money(bot.feesPaid), null],
            ["Trades", String(bot.tradeCount), null],
          ].map(([label, value, colorN]) => (
            <div key={String(label)} className="border border-[var(--line)] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                {label}
              </p>
              <p
                className="stat mt-1 text-lg font-semibold"
                style={
                  typeof colorN === "number" ? { color: pnlColor(colorN) } : undefined
                }
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel overflow-x-auto">
        <div className="border-b border-[var(--line)] px-4 py-3 font-mono text-xs uppercase tracking-[0.16em]">
          Open positions ({positions.length}) · tap headers to sort
        </div>
        <table>
          <thead>
            <tr>
              <SortTh label="Token" column="symbol" sortKey={posSort.sortKey} sortDir={posSort.sortDir} onSort={posSort.toggle} />
              <SortTh label="Chain" column="chain" sortKey={posSort.sortKey} sortDir={posSort.sortDir} onSort={posSort.toggle} />
              <SortTh label="Units" column="units" sortKey={posSort.sortKey} sortDir={posSort.sortDir} onSort={posSort.toggle} />
              <SortTh label="Avg" column="avgPrice" sortKey={posSort.sortKey} sortDir={posSort.sortDir} onSort={posSort.toggle} />
              <SortTh label="Mark" column="markPrice" sortKey={posSort.sortKey} sortDir={posSort.sortDir} onSort={posSort.toggle} />
              <SortTh label="Value" column="value" sortKey={posSort.sortKey} sortDir={posSort.sortDir} onSort={posSort.toggle} />
              <SortTh label="Unreal" column="unreal" sortKey={posSort.sortKey} sortDir={posSort.sortDir} onSort={posSort.toggle} />
            </tr>
          </thead>
          <tbody>
            {posSort.sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-[var(--muted)]">
                  No open positions
                </td>
              </tr>
            ) : (
              posSort.sorted.map((p) => (
                <tr key={`${p.chain}:${p.tokenAddress}`}>
                  <td>{p.symbol}</td>
                  <td className="font-mono text-xs">{p.chain}</td>
                  <td className="stat">{Number(p.units).toPrecision(4)}</td>
                  <td className="stat">{Number(p.avgPrice).toPrecision(4)}</td>
                  <td className="stat">{Number(p.markPrice).toPrecision(4)}</td>
                  <td className="stat">{money(p.value)}</td>
                  <td className="stat" style={{ color: pnlColor(p.unreal) }}>
                    {money(p.unreal)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="panel overflow-x-auto">
        <div className="border-b border-[var(--line)] px-4 py-3 font-mono text-xs uppercase tracking-[0.16em]">
          Recent fills ({fills.length}) · tap headers to sort
        </div>
        <table>
          <thead>
            <tr>
              <SortTh label="Time" column="ts" sortKey={fillSort.sortKey} sortDir={fillSort.sortDir} onSort={fillSort.toggle} />
              <SortTh label="Side" column="side" sortKey={fillSort.sortKey} sortDir={fillSort.sortDir} onSort={fillSort.toggle} />
              <SortTh label="Token" column="symbol" sortKey={fillSort.sortKey} sortDir={fillSort.sortDir} onSort={fillSort.toggle} />
              <SortTh label="Price" column="price" sortKey={fillSort.sortKey} sortDir={fillSort.sortDir} onSort={fillSort.toggle} />
              <SortTh label="Size" column="sizeUsd" sortKey={fillSort.sortKey} sortDir={fillSort.sortDir} onSort={fillSort.toggle} />
              <SortTh label="Fee" column="feeUsd" sortKey={fillSort.sortKey} sortDir={fillSort.sortDir} onSort={fillSort.toggle} />
              <SortTh label="Realized" column="realizedPnl" sortKey={fillSort.sortKey} sortDir={fillSort.sortDir} onSort={fillSort.toggle} />
              <SortTh label="Reason" column="reason" sortKey={fillSort.sortKey} sortDir={fillSort.sortDir} onSort={fillSort.toggle} />
            </tr>
          </thead>
          <tbody>
            {fillSort.sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-[var(--muted)]">
                  No fills yet — start the bot and run a tick
                </td>
              </tr>
            ) : (
              fillSort.sorted.map((f) => (
                <tr key={f.id}>
                  <td className="whitespace-nowrap font-mono text-[11px]">
                    {new Date(f.ts).toLocaleString()}
                  </td>
                  <td
                    className="font-mono text-xs"
                    style={{
                      color: f.side === "BUY" ? "var(--accent)" : "var(--danger)",
                    }}
                  >
                    {f.side}
                  </td>
                  <td>{f.symbol}</td>
                  <td className="stat">{Number(f.price).toPrecision(4)}</td>
                  <td className="stat">{money(f.sizeUsd)}</td>
                  <td className="stat text-[var(--muted)]">{money(f.feeUsd)}</td>
                  <td className="stat" style={{ color: pnlColor(f.realizedPnl || 0) }}>
                    {money(f.realizedPnl || 0)}
                  </td>
                  <td className="max-w-[12rem] truncate font-mono text-[11px] text-[var(--muted)]">
                    {f.reason}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
