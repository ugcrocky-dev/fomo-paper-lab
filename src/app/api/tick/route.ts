import { NextResponse } from "next/server";
import { startMany, tickRunningBots } from "@/lib/bots/runner";
import { readStateAsync } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const state = await readStateAsync();
    const running = state.bots.filter(
      (b) => b.status === "running" || b.status === "eligible_for_live"
    );
    let autoStarted = 0;
    if (!running.length) {
      autoStarted = await startMany("all");
    }
    const result = await tickRunningBots();
    return NextResponse.json({ ok: true, autoStarted, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
