import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { parseOverviewCampaigns } from "@/lib/metrics/apiTypes";
import { buildOverview } from "@/lib/overview/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole("viewer", async (_req, { user }) => {
  const payload = await buildOverview(getDb(), user.orgId);
  // Strict shape check — fails closed if a field silently drifts.
  parseOverviewCampaigns(payload);
  return NextResponse.json(payload);
});
