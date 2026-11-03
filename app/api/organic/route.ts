import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { computeMetrics } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole("viewer", async () => {
  const metrics = await computeMetrics();
  return NextResponse.json({ rows: metrics.organicVsAi });
});
