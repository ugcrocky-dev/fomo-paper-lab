# FOMO Paper Lab

Paper-trading lab racing **100 bots** ($1,000 each) on live [FOMO](https://fomo.family) leaderboard bags.

## What it does

- Pulls FOMO leaderboards (`24h` / `7d` / `30d` / `all`) via `api.fomoapi.io` (keyless)
- Runs 50 trader-discovery bots + 50 proprietary bots through a paper broker
- Dashboard: Overview · Bots · Traders · Lab · Trades · Rules
- Promotion gate: ≥7 continuous paper days before `eligible_for_live`

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Start all**, then **Run tick**.

Optional: set `FOMO_API_KEY` for deeper user endpoints later (not required for v1).

## Stack

Next.js App Router · TypeScript · Tailwind · JSON store under `data/`
