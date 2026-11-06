import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { NotFoundError, ValidationError } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";
import { scheduleOwned, updateSchedule } from "@/lib/schedules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/** Edit a schedule or set enabled=false to stop it. Past scans are kept. */
export const PATCH = withRole<Params>("editor", async (req, { user, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const db = getDb();
  try {
    const before = await scheduleOwned(db, user.orgId, id.data);
    const schedule = await updateSchedule(db, user.orgId, id.data, await req.json().catch(() => null));
    await recordAudit(db, { orgId: user.orgId, userId: user.userId, action: "schedule.update", entityType: "schedule", entityId: id.data, before, after: schedule });
    return NextResponse.json({ schedule });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
});
