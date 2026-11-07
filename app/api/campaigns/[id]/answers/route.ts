import { NextResponse } from "next/server";
import { z } from "zod";
import { listCampaignAnswers } from "@/lib/analysis/listAnswers";
import { withRole } from "@/lib/auth";
import { NotFoundError, getCampaign } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

export const GET = withRole<Params>("viewer", async (req, { user, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const db = getDb();
  try {
    await getCampaign(db, user.orgId, id.data);
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
  const url = new URL(req.url);
  const scanId = url.searchParams.get("scanId") ?? undefined;
  if (scanId && !z.string().uuid().safeParse(scanId).success) {
    return NextResponse.json({ error: "scanId must be a uuid" }, { status: 400 });
  }
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 5000)) {
    return NextResponse.json({ error: "limit must be 1 to 5000" }, { status: 400 });
  }
  return NextResponse.json(await listCampaignAnswers(db, { orgId: user.orgId, campaignId: id.data, scanId, limit }));
});
