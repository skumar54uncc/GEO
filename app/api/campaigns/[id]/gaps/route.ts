import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth";
import { NotFoundError, getCampaign } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";
import { listCampaignGaps } from "@/lib/gaps/list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

export const GET = withRole<Params>("viewer", async (_req, { user, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const db = getDb();
  try {
    await getCampaign(db, user.orgId, id.data);
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
  return NextResponse.json(await listCampaignGaps(db, { orgId: user.orgId, campaignId: id.data }));
});
