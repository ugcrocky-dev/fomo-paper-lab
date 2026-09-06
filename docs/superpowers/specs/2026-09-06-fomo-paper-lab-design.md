# FOMO Paper Lab — Design Spec

**Date:** 2026-09-06  
**Status:** Approved (user: Build it)

## Goal

Paper-trade 100 strategies against live FOMO social-trading leaderboard data for ≥7 continuous days, rank winners on a dashboard, and only then consider live FOMO execution.

## Constraints

- Isolated virtual bankroll: **$1,000 per bot**
- Semi-auto rules: max size, slippage, flat taker fee model
- Live FOMO execution: **out of v1**

## Architecture

1. **Data collector** — FOMO leaderboard windows + token price map (`api.fomoapi.io`, keyless)
2. **Strategy registry** — 50 trader-discovery + 50 proprietary
3. **Paper broker** — per-bot cash/positions/fills at observed USD price ± slippage + flat fee
4. **Bot runner** — start/stop, `/api/tick`, 7-day promotion gate
5. **Dashboard** — Overview · Bots · Traders · Lab · Trades · Rules

## Promotion gate

`eligible_for_live` when continuous paper ≥ promotion days, trade count ≥ minimum, max drawdown ≤ cap, and equity > starting bankroll.

## Tech

Next.js App Router + TypeScript + Tailwind + JSON store under `data/`.
