"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Poll interval for dashboard pages. Paper ticks run every ~60s server-side. */
export const DASHBOARD_POLL_MS = 10_000;

export function useLiveRefresh(
  load: () => Promise<void>,
  intervalMs = DASHBOARD_POLL_MS
) {
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    await loadRef.current();
    setUpdatedAt(new Date().toISOString());
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

  return { updatedAt, live, setLive, refresh };
}

export function LiveBadge({
  updatedAt,
  live,
  onToggle,
}: {
  updatedAt: string | null;
  live: boolean;
  onToggle?: () => void;
}) {
  const age = updatedAt
    ? Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000))
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
        {live ? "Live" : "Paused"} · UI every 10s · tick ~60s
      </span>
      <span>
        {age == null ? "Loading…" : age < 2 ? "Just updated" : `Updated ${age}s ago`}
      </span>
      {onToggle ? (
        <button type="button" className="btn py-1 px-2 text-[11px]" onClick={onToggle}>
          {live ? "Pause" : "Resume"}
        </button>
      ) : null}
    </div>
  );
}
