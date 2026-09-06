"use client";

import { useEffect, useState } from "react";

export default function RulesPage() {
  const [rules, setRules] = useState<any>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/rules")
      .then((r) => r.json())
      .then((j) => setRules(j.rules));
  }, []);

  async function save() {
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rules),
    });
    const json = await res.json();
    setRules(json.rules);
    setMsg("Saved");
  }

  if (!rules) return <p className="text-[var(--muted)]">Loading…</p>;

  const fields: [string, string][] = [
    ["maxUsdPerTrade", "Max USD / trade"],
    ["maxPctBankroll", "Max % bankroll"],
    ["skipPriceAbove", "Skip price above (0=off)"],
    ["skipPriceBelow", "Skip price below"],
    ["slippageBps", "Slippage bps"],
    ["takerFeeRate", "Taker fee rate"],
    ["promotionDays", "Promotion days"],
    ["minTradesForPromotion", "Min trades for promotion"],
    ["maxDrawdownPctForPromotion", "Max DD % for promotion"],
  ];

  return (
    <div className="card p-5 space-y-4 max-w-xl">
      <div>
        <h2 className="text-xl font-semibold">Risk rules</h2>
        <p className="text-sm text-[var(--muted)]">
          Paper broker controls. Live FOMO execution stays off until bots clear the promotion gate.
        </p>
      </div>
      <div className="space-y-3">
        {fields.map(([key, label]) => (
          <label key={key} className="block">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {label}
            </span>
            <input
              className="mt-1 w-full bg-transparent border border-[var(--line)] px-3 py-2"
              type="number"
              step="any"
              value={rules[key]}
              onChange={(e) =>
                setRules({ ...rules, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!rules.chargeTakerFees}
            onChange={(e) => setRules({ ...rules, chargeTakerFees: e.target.checked })}
          />
          Charge taker fees
        </label>
      </div>
      <button
        onClick={save}
        className="font-mono text-xs uppercase tracking-wider px-4 py-2 border border-[var(--accent)] text-[var(--accent)]"
      >
        Save rules
      </button>
      {msg ? <p className="font-mono text-xs text-[var(--muted)]">{msg}</p> : null}
    </div>
  );
}
