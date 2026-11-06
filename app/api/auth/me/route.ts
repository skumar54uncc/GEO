import { NextResponse } from "next/server";
import { getSessionState } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const state = await getSessionState(req);
  if (!state) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json(state);
}
