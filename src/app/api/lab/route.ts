import { NextResponse } from "next/server";
import { readStateAsync } from "@/lib/store";
import { getStrategy } from "@/lib/strategies/catalog";
import { STARTING_BANKROLL } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await readStateAsync();
  const scoreboard = state.bots
    .map((b) => {
      const strategy = getStrategy(b.strategyId);
      return {
        id: b.id,
        name: strategy?.name || b.strategyId,
        family: strategy?.family || "",
        status: b.status,
        equity: b.equity,
        netPnl: b.equity - STARTING_BANKROLL,
        tradeCount: b.tradeCount,
        maxDrawdown: b.maxDrawdown,
        feesPaid: b.feesPaid,
        runningSince: b.runningSince,
        eligible: b.status === "eligible_for_live",
      };
    })
    .sort((a, b) => b.netPnl - a.netPnl);
  return NextResponse.json({ updatedAt: state.updatedAt, scoreboard, rules: state.rules });
}
