import { NextRequest, NextResponse } from "next/server";
import { readStateAsync } from "@/lib/store";
import { readTradeJournal } from "@/lib/store/journal";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const botId = req.nextUrl.searchParams.get("botId") || undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") || 200);
  const journal = readTradeJournal({ botId, limit });
  if (journal.length) return NextResponse.json({ trades: journal, source: "journal" });
  const state = await readStateAsync();
  const trades = state.bots
    .flatMap((b) => b.fills)
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))
    .slice(0, limit);
  return NextResponse.json({ trades, source: "memory" });
}
