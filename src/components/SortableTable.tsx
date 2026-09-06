"use client";

import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export function useSortableRows<T>(
  rows: T[],
  defaultKey: string,
  defaultDir: SortDir = "desc"
) {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  function toggle(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = getPath(a, sortKey);
      const bv = getPath(b, sortKey);
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else
        cmp = String(av ?? "").localeCompare(String(bv ?? ""), undefined, {
          sensitivity: "base",
          numeric: true,
        });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, toggle };
}

export function SortTh({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: string;
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
}) {
  const active = sortKey === column;
  return (
    <th
      className="cursor-pointer select-none hover:text-[var(--accent)]"
      onClick={() => onSort(column)}
      title={`Sort by ${label}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="font-mono text-[10px] opacity-70">
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </span>
    </th>
  );
}

export function money(n: number, digits = 2) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  });
}

export function pnlColor(n: number) {
  if (!Number.isFinite(n) || Math.abs(n) < 0.005) return "var(--muted)";
  return n > 0 ? "var(--accent)" : "var(--danger)";
}
