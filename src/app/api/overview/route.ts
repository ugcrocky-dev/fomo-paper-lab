import { NextResponse } from "next/server";
import { readStateAsync } from "@/lib/store";
import { getStrategy } from "@/lib/strategies/catalog";
import { STARTING_BANKROLL } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await readStateAsync();
  const rows = state.bots.map((b) => {
    const base = getStrategy(b.strategyId);
    const exec = getStrategy(b.execStrategyId || b.strategyId);
    const netPnl = b.equity - STARTING_BANKROLL;
    return {
      id: b.id,
      status: b.status,
      tradeCount: b.tradeCount,
      equity: b.equity,
      realizedPnl: b.realizedPnl,
      unrealizedPnl: b.unrealizedPnl,
      feesPaid: b.feesPaid,
      netPnl,
      maxDrawdown: b.maxDrawdown,
      adaptationCount: b.adaptationCount || 0,
      execStrategyId: b.execStrategyId || b.strategyId,
      strategy: base
        ? {
            name: base.name,
            family: base.family,
            description: base.description,
            execName: exec?.name || base.name,
          }
        : undefined,
    };
  });
  rows.sort((a, b) => b.netPnl - a.netPnl);
  return NextResponse.json(
    {
      updatedAt: state.updatedAt,
      strategyCount: state.bots.length,
      runningCount: state.bots.filter((b) => b.status === "running").length,
      eligibleCount: state.bots.filter((b) => b.status === "eligible_for_live").length,
      totalEquity: state.bots.reduce((s, b) => s + b.equity, 0),
      totalPnl: state.bots.reduce((s, b) => s + (b.equity - STARTING_BANKROLL), 0),
      totalFees: state.bots.reduce((s, b) => s + b.feesPaid, 0),
      totalRealized: state.bots.reduce((s, b) => s + b.realizedPnl, 0),
      totalUnrealized: state.bots.reduce((s, b) => s + b.unrealizedPnl, 0),
      totalTrades: state.bots.reduce((s, b) => s + b.tradeCount, 0),
      lastOptimizeAt: state.lastOptimizeAt || null,
      optimizeLog: (state.optimizeLog || []).slice(0, 12),
      top: rows.slice(0, 25),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
