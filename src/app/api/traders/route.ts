import { NextResponse } from "next/server";
import { fetchBoards } from "@/lib/fomo/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const boards = await fetchBoards(50);
    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      boards: {
        h24: boards.h24.traders,
        d7: boards.d7.traders,
        d30: boards.d30.traders,
        all: boards.all.traders,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
