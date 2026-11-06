import { NextResponse } from "next/server";
import { z } from "zod";
import { AlertStateError, acknowledgeAlert } from "@/lib/alerts/service";
import { recordAudit, withRole } from "@/lib/auth";
import { NotFoundError } from "@/lib/campaigns";
import { getDb } from "@/lib/db/pg/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

export const POST = withRole<Params>("editor", async (_req, { user, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const db = getDb();
  try {
    const alert = await acknowledgeAlert(db, user.orgId, id.data, user.userId);
    await recordAudit(db, {
      orgId: user.orgId,
      userId: user.userId,
      action: "alert.acknowledge",
      entityType: "alert",
      entityId: alert.id,
      before: { status: "open" },
      after: { status: alert.status, kind: alert.kind },
    });
    return NextResponse.json({ alert });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof AlertStateError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
});
