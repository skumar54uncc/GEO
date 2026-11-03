import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { campaignOptions } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole("viewer", async (_req, { user }) => {
  return NextResponse.json(await campaignOptions(getDb(), user.orgId));
});
