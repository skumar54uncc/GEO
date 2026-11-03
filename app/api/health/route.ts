import { NextResponse } from "next/server";
import { getStore, storeBackend } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unauthenticated liveness check. Reports counts only, no content.
export async function GET() {
  try {
    const store = getStore();
    const cfg = await store.getConfig();
    return NextResponse.json({
      ok: true,
      backend: storeBackend(),
      prompt_count: (await store.listPrompts()).length,
      credits_remaining: cfg.serpapi_credits_remaining,
      per_run_cap: cfg.serpapi_per_run_cap,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, backend: storeBackend(), error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
