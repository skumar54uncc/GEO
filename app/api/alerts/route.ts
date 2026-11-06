import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth";
import { listOpenAlerts } from "@/lib/alerts/service";
import { getDb } from "@/lib/db/pg/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Open alerts for the signed-in org, optionally for one campaign. */
export const GET = withRole("viewer", async (req, { user }) => {
  const raw = new URL(req.url).searchParams.get("campaign_id");
  let campaignId: string | null = null;
  if (raw) {
    const parsed = z.string().uuid().safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: "campaign_id must be a uuid" }, { status: 400 });
    campaignId = parsed.data;
  }
  return NextResponse.json({ alerts: await listOpenAlerts(getDb(), user.orgId, campaignId) });
});
