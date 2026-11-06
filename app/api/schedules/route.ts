import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { NotFoundError, ValidationError } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";
import { createSchedule, listSchedules } from "@/lib/schedules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapError(err: unknown) {
  if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
  if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
  throw err;
}

export const GET = withRole("viewer", async (req, { user }) => {
  const campaignId = z.string().uuid().safeParse(new URL(req.url).searchParams.get("campaign_id"));
  if (!campaignId.success) return NextResponse.json({ error: "campaign_id must be a uuid" }, { status: 400 });
  return NextResponse.json({ schedules: await listSchedules(getDb(), user.orgId, campaignId.data) });
});

export const POST = withRole("editor", async (req, { user }) => {
  const db = getDb();
  try {
    const schedule = await createSchedule(db, user.orgId, await req.json().catch(() => null));
    await recordAudit(db, { orgId: user.orgId, userId: user.userId, action: "schedule.create", entityType: "schedule", entityId: schedule.id, after: schedule });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (err) {
    return mapError(err);
  }
});
