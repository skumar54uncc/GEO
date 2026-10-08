import { NextResponse } from "next/server";
import { getStore, storeBackend } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  const cfg = store.getConfig();
  return NextResponse.json({
    ok: true,
    backend: storeBackend(),
    prompt_count: store.listPrompts().length,
    credits_remaining: cfg.serpapi_credits_remaining,
    per_run_cap: cfg.serpapi_per_run_cap,
  });
}
