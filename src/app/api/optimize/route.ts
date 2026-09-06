import { NextRequest, NextResponse } from "next/server";
import { optimizeLab } from "@/lib/bots/optimize";
import { tickRunningBots } from "@/lib/bots/runner";
import { readStateAsync } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hourly optimizer (Vercel cron) + manual "Optimize now".
 * Ticks once, then retunes unprofitable bots onto winning playbooks.
 * Pass ?force=1 to ignore the 45m minimum runtime (manual / agent checks).
 */
async function handle(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get("force") === "1";
    const tick = await tickRunningBots();
    const result = await optimizeLab({ force });
    const state = await readStateAsync();
    return NextResponse.json({
      ok: true,
      tick,
      optimize: result,
      lastOptimizeAt: state.lastOptimizeAt,
      recent: (state.optimizeLog || []).slice(0, 20),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
