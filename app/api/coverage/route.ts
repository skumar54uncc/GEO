import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  return NextResponse.json({ coverage: store.coverage() });
}
