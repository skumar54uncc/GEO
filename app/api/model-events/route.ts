import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { NotFoundError, ValidationError } from "@/lib/campaigns";
import { ENGINES } from "@/lib/capture/types";
import { getDb } from "@/lib/db/pg/client";
import { createModelEvent, listModelEvents } from "@/lib/modelEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole("viewer", async (req) => {
  const raw = new URL(req.url).searchParams.get("engine");
  let engine: string | null = null;
  if (raw) {
    const parsed = z.enum(ENGINES).safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: `engine must be one of ${ENGINES.join(", ")}` }, { status: 400 });
    engine = parsed.data;
  }
  return NextResponse.json({ model_events: await listModelEvents(getDb(), engine) });
});

/** Admin only: a model change on an engine, drawn as an annotation on every series for that engine. */
export const POST = withRole("admin", async (req, { user }) => {
  const db = getDb();
  try {
    const event = await createModelEvent(db, await req.json().catch(() => null));
    await recordAudit(db, { orgId: user.orgId, userId: user.userId, action: "model_event.create", entityType: "model_event", entityId: event.id, after: event });
    return NextResponse.json({ model_event: event }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
});
