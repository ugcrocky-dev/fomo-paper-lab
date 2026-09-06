"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { money, pnlClass } from "@/lib/format";

export default function BotDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/bots/${params.id}`);
    setData(await res.json());
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(action: "start" | "stop") {
    const res = await fetch(`/api/bots/${params.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    setMsg(json.error || `status → ${json.bot?.status}`);
    await load();
  }

  const bot = data?.bot;
  const strategy = data?.strategy;
  if (!bot) return <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <div className="space-y-4">
      <Link href="/bots" className="font-mono text-xs text-[var(--accent)]">
        ← Bots
      </Link>
      <section className="card p-5 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">{strategy?.name || bot.id}</h2>
            <p className="text-sm text-[var(--muted)]">{strategy?.description}</p>
            <p className="mt-2 font-mono text-xs text-[var(--muted)]">
              {strategy?.family} · {bot.status}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStatus("start")} className="font-mono text-xs uppercase px-3 py-2 border border-[var(--line)] hover:border-[var(--accent)]">
              Start
            </button>
            <button onClick={() => setStatus("stop")} className="font-mono text-xs uppercase px-3 py-2 border border-[var(--line)] hover:border-[var(--accent)]">
              Stop
            </button>
          </div>
        </div>
        {msg ? <p className="font-mono text-xs text-[var(--muted)]">{msg}</p> : null}
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Equity", money(bot.equity)],
            ["Cash", money(bot.cash)],
            ["Net PnL", money(bot.equity - bot.startingBankroll)],
            ["Trades", String(bot.tradeCount)],
            ["Fees", money(bot.feesPaid)],
            ["Max DD", `${bot.maxDrawdown.toFixed(1)}%`],
            ["Wins", String(bot.winCount)],
            ["Watched", String((bot.watchedHandles || []).length)],
          ].map(([k, v]) => (
            <div key={k} className="border border-[var(--line)] p-3">
              <p className="font-mono text-[11px] uppercase text-[var(--muted)]">{k}</p>
              <p className={`text-lg font-semibold ${String(k).includes("PnL") ? pnlClass(bot.equity - bot.startingBankroll) : ""}`}>{v}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card overflow-x-auto">
        <div className="px-4 py-3 border-b border-[var(--line)] font-semibold">Positions</div>
        <table className="w-full text-sm">
          <thead className="font-mono text-[11px] uppercase text-[var(--muted)]">
            <tr className="text-left">
              <th className="px-4 py-2">Token</th>
              <th className="px-4 py-2">Chain</th>
              <th className="px-4 py-2">Units</th>
              <th className="px-4 py-2">Avg</th>
              <th className="px-4 py-2">Mark</th>
              <th className="px-4 py-2">UPnL</th>
            </tr>
          </thead>
          <tbody>
            {(bot.positions || []).map((p: any) => {
              const upnl = (p.markPrice - p.avgPrice) * p.units;
              return (
                <tr key={`${p.chain}:${p.tokenAddress}`} className="border-t border-[var(--line)]">
                  <td className="px-4 py-2">{p.symbol}</td>
                  <td className="px-4 py-2 font-mono text-xs">{p.chain}</td>
                  <td className="px-4 py-2">{p.units.toPrecision(4)}</td>
                  <td className="px-4 py-2">{p.avgPrice.toPrecision(4)}</td>
                  <td className="px-4 py-2">{p.markPrice.toPrecision(4)}</td>
                  <td className={`px-4 py-2 ${pnlClass(upnl)}`}>{money(upnl)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <div className="px-4 py-3 border-b border-[var(--line)] font-semibold">Recent fills</div>
        <table className="w-full text-sm">
          <thead className="font-mono text-[11px] uppercase text-[var(--muted)]">
            <tr className="text-left">
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2">Side</th>
              <th className="px-4 py-2">Token</th>
              <th className="px-4 py-2">Price</th>
              <th className="px-4 py-2">Size</th>
              <th className="px-4 py-2">Fee</th>
              <th className="px-4 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {(bot.fills || []).slice(0, 50).map((f: any) => (
              <tr key={f.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-2 font-mono text-xs">{new Date(f.ts).toLocaleString()}</td>
                <td className="px-4 py-2">{f.side}</td>
                <td className="px-4 py-2">{f.symbol}</td>
                <td className="px-4 py-2">{Number(f.price).toPrecision(4)}</td>
                <td className="px-4 py-2">{money(f.sizeUsd)}</td>
                <td className="px-4 py-2">{money(f.feeUsd)}</td>
                <td className="px-4 py-2 text-[var(--muted)]">{f.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
