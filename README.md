# FOMO Paper Lab

Paper-trading lab racing **100 bots** ($1,000 each) on live [FOMO](https://fomo.family) leaderboard bags.

## What it does

- Pulls FOMO leaderboards via `api.fomoapi.io` (requires `FOMO_API_KEY`; free tier ~1,000 credits/mo)
- Live fleet is **top 5 by net PnL**; catalog still has 100 strategies
- Hourly cron tick fetches **one** `24h` board (~720 credits/mo); boards cached ≥55 min
- Dashboard: Overview · Bots · Traders · Lab · Trades · Rules
- Promotion gate: ≥7 continuous paper days before `eligible_for_live`

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Start top 5**, then **Run tick**.

Required in production: set `FOMO_API_KEY` (https://fomoapi.io/dashboard). Leaderboards are no longer keyless.

## Stack

Next.js App Router · TypeScript · Tailwind · JSON store under `data/`
