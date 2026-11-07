import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { sampleDrawsForGoldLabels } from "@/lib/goldLabels/sample";
import { getDb } from "@/lib/db/pg/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole("editor", async (req, { user }) => {
  const url = new URL(req.url);
  const scanId = url.searchParams.get("scanId");
  if (!scanId) return NextResponse.json({ error: "scanId query parameter is required" }, { status: 400 });
  const limit = Number(url.searchParams.get("limit") ?? "50");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return NextResponse.json({ error: "limit must be 1–200" }, { status: 400 });
  }
  try {
    const draws = await sampleDrawsForGoldLabels(getDb(), user.orgId, scanId, limit);
    return NextResponse.json({ scanId, count: draws.length, draws });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 404 });
  }
});
