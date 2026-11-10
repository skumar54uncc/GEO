import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { NotFoundError, ValidationError } from "@/lib/campaigns";
import { annotationKindLabel, createCampaignAnnotation, listCampaignAnnotations } from "@/lib/annotations";
import { getDb } from "@/lib/db/pg/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

export const GET = withRole<Params>("viewer", async (_req, { user, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }
  try {
    const rows = await listCampaignAnnotations(getDb(), user.orgId, params.id);
    return NextResponse.json({
      annotations: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        kind_label: annotationKindLabel[r.kind as keyof typeof annotationKindLabel] ?? r.kind,
        occurred_on: r.occurredOn,
        note: r.note,
        created_at: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
});

export const POST = withRole<Params>("editor", async (req, { user, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }
  const db = getDb();
  try {
    const body = await req.json().catch(() => null);
    const row = await createCampaignAnnotation(db, {
      orgId: user.orgId,
      campaignId: params.id,
      userId: user.userId,
      input: body,
    });
    await recordAudit(db, {
      orgId: user.orgId,
      userId: user.userId,
      action: "annotation.create",
      entityType: "campaign_annotation",
      entityId: row.id,
      after: { kind: row.kind, occurred_on: row.occurredOn, note: row.note },
    });
    return NextResponse.json({ annotation: row }, { status: 201 });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
});
