import { NextResponse } from "next/server";
import { getStore, storeBackend } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unauthenticated liveness check. No counts, credits, or error details.
export async function GET() {
  try {
    await getStore().getConfig();
    return NextResponse.json({
      ok: true,
      backend: storeBackend(),
    });
  } catch {
    return NextResponse.json(
      { ok: false, backend: storeBackend() },
      { status: 503 },
    );
  }
}
