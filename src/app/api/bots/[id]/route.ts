import { NextRequest, NextResponse } from "next/server";
import { readStateAsync } from "@/lib/store";
import { getStrategy } from "@/lib/strategies/catalog";
import { setBotStatus } from "@/lib/bots/runner";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const state = await readStateAsync();
  const bot = state.bots.find((b) => b.id === id);
  if (!bot) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ bot, strategy: getStrategy(bot.strategyId), rules: state.rules });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = await req.json();
  if (body.action === "start") {
    const bot = await setBotStatus(id, "running");
    return NextResponse.json({ bot });
  }
  if (body.action === "stop") {
    const bot = await setBotStatus(id, "stopped");
    return NextResponse.json({ bot });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
