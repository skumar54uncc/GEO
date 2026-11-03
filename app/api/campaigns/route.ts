import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { createCampaign, listCampaigns, ValidationError } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole("viewer", async (req, { user }) => {
  const includeArchived = new URL(req.url).searchParams.get("archived") === "1";
  return NextResponse.json({ campaigns: await listCampaigns(getDb(), user.orgId, { includeArchived }) });
});

export const POST = withRole("editor", async (req, { user }) => {
  try {
    const campaign = await createCampaign(getDb(), user, await req.json());
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
});
