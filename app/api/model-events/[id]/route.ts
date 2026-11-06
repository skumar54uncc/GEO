import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { NotFoundError, ValidationError } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";
import { deleteModelEvent, getModelEvent, updateModelEvent } from "@/lib/modelEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

function mapError(err: unknown) {
  if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
  if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
  throw err;
}

export const PATCH = withRole<Params>("admin", async (req, { user, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const db = getDb();
  try {
    const before = await getModelEvent(db, id.data);
    const event = await updateModelEvent(db, id.data, await req.json().catch(() => null));
    await recordAudit(db, { orgId: user.orgId, userId: user.userId, action: "model_event.update", entityType: "model_event", entityId: id.data, before, after: event });
    return NextResponse.json({ model_event: event });
  } catch (err) {
    return mapError(err);
  }
});

export const DELETE = withRole<Params>("admin", async (_req, { user, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const db = getDb();
  try {
    const event = await deleteModelEvent(db, id.data);
    await recordAudit(db, { orgId: user.orgId, userId: user.userId, action: "model_event.delete", entityType: "model_event", entityId: id.data, before: event });
    return NextResponse.json({ deleted: true, model_event: event });
  } catch (err) {
    return mapError(err);
  }
});
