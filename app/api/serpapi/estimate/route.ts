import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { estimateAioBatch } from "@/lib/serpapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST only computes an estimate (no spend, no writes), so viewers may call it.
export const POST = withRole("viewer", async (req) => {
  const body = (await req.json()) as { prompt_ids: number[] };
  const ids = Array.isArray(body.prompt_ids) ? body.prompt_ids : [];
  return NextResponse.json(await estimateAioBatch(ids));
});
