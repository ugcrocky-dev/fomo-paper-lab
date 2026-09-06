import { NextRequest, NextResponse } from "next/server";
import { readStateAsync } from "@/lib/store";
import { getStrategy } from "@/lib/strategies/catalog";
import { startMany, stopAllBots } from "@/lib/bots/runner";
import { STARTING_BANKROLL } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await readStateAsync();
  const bots = state.bots.map((b) => {
    const strategy = getStrategy(b.strategyId);
    return {
      ...b,
      fills: undefined,
      netPnl: b.equity - STARTING_BANKROLL,
      strategy,
    };
  });
  return NextResponse.json({ updatedAt: state.updatedAt, bots });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.action === "start_all") {
    const n = await startMany("all");
    return NextResponse.json({ ok: true, started: n });
  }
  if (body.action === "start_traders") {
    const n = await startMany("trader_discovery");
    return NextResponse.json({ ok: true, started: n });
  }
  if (body.action === "start_prop") {
    const n = await startMany("proprietary");
    return NextResponse.json({ ok: true, started: n });
  }
  if (body.action === "stop_all") {
    await stopAllBots();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
