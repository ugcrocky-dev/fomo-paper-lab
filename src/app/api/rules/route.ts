import { NextRequest, NextResponse } from "next/server";
import { patchRules, readStateAsync } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await readStateAsync();
  return NextResponse.json({ rules: state.rules, updatedAt: state.updatedAt });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const state = patchRules(body);
  return NextResponse.json({ rules: state.rules, updatedAt: state.updatedAt });
}
