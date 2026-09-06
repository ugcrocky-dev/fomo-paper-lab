"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How often the UI reloads overview/tables. */
export const DASHBOARD_POLL_MS = 10_000;
/** How often an open Live desk advances the paper book (Vercel cron is unreliable alone). */
export const TICK_KEEPALIVE_MS = 60_000;

export function useLiveRefresh(
  load: () => Promise<void>,
  intervalMs = DASHBOARD_POLL_MS,
  opts?: { tickKeepalive?: boolean }
) {
  const tickKeepalive = opts?.tickKeepalive ?? true;
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [lastTick, setLastTick] = useState<{
    at: string;
    fills: number;
  } | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    await loadRef.current();
    setUpdatedAt(new Date().toISOString());
  }, []);

  const runTick = useCallback(async () => {
    try {
      const res = await fetch("/api/tick", { method: "POST", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok !== false) {
        setLastTick({
          at: new Date().toISOString(),
          fills: Number(json.fills ?? json.ticked ?? 0),
        });
      }
    } catch (err) {
      console.error("tick keepalive failed", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh().catch(console.error);
    if (!live) return;
    const t = setInterval(() => {
      if (!cancelled) refresh().catch(console.error);
    }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [refresh, intervalMs, live]);

  useEffect(() => {
    if (!live || !tickKeepalive) return;
    let cancelled = false;
    // Kick once shortly after mount so the book doesn't sit idle waiting for cron.
    const kick = setTimeout(() => {
      if (!cancelled) runTick().then(() => refresh()).catch(console.error);
    }, 1500);
    const t = setInterval(() => {
      if (cancelled) return;
      runTick()
        .then(() => refresh())
        .catch(console.error);
    }, TICK_KEEPALIVE_MS);
    return () => {
      cancelled = true;
      clearTimeout(kick);
      clearInterval(t);
    };
  }, [live, tickKeepalive, runTick, refresh]);

  return { updatedAt, live, setLive, refresh, lastTick, runTick };
}

export function LiveBadge({
  updatedAt,
  live,
  onToggle,
  lastTick,
}: {
  updatedAt: string | null;
  live: boolean;
  onToggle?: () => void;
  lastTick?: { at: string; fills: number } | null;
}) {
  const age = updatedAt
    ? Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000))
    : null;
  const tickAge = lastTick?.at
    ? Math.max(0, Math.round((Date.now() - new Date(lastTick.at).getTime()) / 1000))
    : null;
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[var(--muted)]">
      <span
        className="inline-flex items-center gap-1.5 rounded border border-[var(--line)] px-2 py-1"
        style={live ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: live ? "var(--accent)" : "var(--muted)" }}
        />
        {live ? "Live" : "Paused"} · UI 10s · book tick 60s
      </span>
      <span>
        {age == null ? "Loading…" : age < 2 ? "Just updated" : `Updated ${age}s ago`}
      </span>
      {tickAge != null ? (
        <span>
          Last tick {tickAge < 2 ? "just now" : `${tickAge}s ago`}
          {lastTick ? ` · ${lastTick.fills} fills` : ""}
        </span>
      ) : null}
      {onToggle ? (
        <button type="button" className="btn py-1 px-2 text-[11px]" onClick={onToggle}>
          {live ? "Pause" : "Resume"}
        </button>
      ) : null}
    </div>
  );
}
