import { NextResponse } from "next/server";
import { withLegacyRole } from "@/lib/auth";
import { computeMetrics } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withLegacyRole("viewer", async () => {
  const metrics = await computeMetrics();
  return NextResponse.json({ rows: metrics.organicVsAi });
});
