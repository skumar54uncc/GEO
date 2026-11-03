import { NextResponse } from "next/server";
import { recordAudit, withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { siteContext } from "@/lib/site/context";
import { jsonBody, siteErrors } from "@/lib/site/http";
import { addManualHost, setHostIncluded } from "@/lib/site/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRole<{ id: string }>("editor", async (req, { user, params }) =>
  siteErrors(async () => {
    const db = getDb();
    await siteContext(db, params.id, user.orgId);
    const body = await jsonBody(req);
    const host = await addManualHost(db, params.id, String(body.host ?? ""));
    await recordAudit(db, { orgId: user.orgId, userId: user.userId, action: "site_host.add", entityType: "site_host", entityId: host.id, after: host });
    return NextResponse.json({ host }, { status: 201 });
  }),
);

export const PATCH = withRole<{ id: string }>("editor", async (req, { user, params }) =>
  siteErrors(async () => {
    const db = getDb();
    await siteContext(db, params.id, user.orgId);
    const body = await jsonBody(req);
    if (typeof body.host_id !== "string" || typeof body.included !== "boolean") {
      return NextResponse.json({ error: "host_id and included (boolean) are required." }, { status: 400 });
    }
    const { before, after } = await setHostIncluded(db, params.id, body.host_id, body.included);
    await recordAudit(db, {
      orgId: user.orgId,
      userId: user.userId,
      action: after.included ? "site_host.include" : "site_host.exclude",
      entityType: "site_host",
      entityId: after.id,
      before: { host: before.host, included: before.included },
      after: { host: after.host, included: after.included },
    });
    return NextResponse.json({ host: after });
  }),
);
