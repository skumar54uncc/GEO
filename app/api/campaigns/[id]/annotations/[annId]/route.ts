import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { NotFoundError } from "@/lib/campaigns";
import { deleteCampaignAnnotation } from "@/lib/annotations";
import { getDb } from "@/lib/db/pg/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string; annId: string };

export const DELETE = withRole<Params>("editor", async (_req, { user, params }) => {
  if (!z.string().uuid().safeParse(params.id).success || !z.string().uuid().safeParse(params.annId).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const db = getDb();
  try {
    await deleteCampaignAnnotation(db, { orgId: user.orgId, campaignId: params.id, id: params.annId });
    await recordAudit(db, {
      orgId: user.orgId,
      userId: user.userId,
      action: "annotation.delete",
      entityType: "campaign_annotation",
      entityId: params.annId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
});
