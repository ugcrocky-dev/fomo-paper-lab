import { NextResponse } from "next/server";
import { startMany, tickRunningBots } from "@/lib/bots/runner";
import { readStateAsync } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron + Live UI keepalive both hit this route.
 * Accept GET (cron default) and POST (dashboard keepalive).
 */
async function handleTick() {
  try {
    const state = await readStateAsync();
    const running = state.bots.filter(
      (b) => b.status === "running" || b.status === "eligible_for_live"
    );
    let autoStarted = 0;
    if (!running.length) {
      // Free-credit mode: start top-5 elite only, never the full 100.
      autoStarted = await startMany("all");
    }
    const result = await tickRunningBots();
    return NextResponse.json({
      ok: true,
      autoStarted,
      at: new Date().toISOString(),
      ...result,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST() {
  return handleTick();
}

export async function GET() {
  return handleTick();
}
