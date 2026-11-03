import { NextResponse } from "next/server";
import { recordAudit, withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { siteContext } from "@/lib/site/context";
import { jsonBody, siteErrors } from "@/lib/site/http";
import { addManualPeer, listPeers, livePeerDeps, reviewPeer, suggestPeers } from "@/lib/site/peers";
import { ensurePhase2Providers } from "@/lib/site/providerCall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole<{ id: string }>("viewer", async (_req, { user, params }) =>
  siteErrors(async () => {
    const db = getDb();
    const ctx = await siteContext(db, params.id, user.orgId);
    return NextResponse.json({ ...(await listPeers(db, params.id, user.orgId)), ipeds_unitid: ctx.brand.ipedsUnitid, data_gov_key: Boolean(process.env.DATA_GOV_API_KEY) });
  }),
);

/** {action:"suggest"} queries College Scorecard; {name, domain} adds a manual peer. */
export const POST = withRole<{ id: string }>("editor", async (req, { user, params }) =>
  siteErrors(async () => {
    const db = getDb();
    const ctx = await siteContext(db, params.id, user.orgId);
    const body = await jsonBody(req);
    if (body.action === "suggest") {
      await ensurePhase2Providers(db, user.orgId);
      const res = await suggestPeers(db, { siteId: params.id, orgId: user.orgId, brandId: ctx.brand.id, deps: livePeerDeps() });
      return NextResponse.json({ result: res }, { status: res.status === "ok" ? 200 : 502 });
    }
    const row = await addManualPeer(db, { orgId: user.orgId, name: String(body.name ?? ""), domain: typeof body.domain === "string" ? body.domain : null });
    if (!row) return NextResponse.json({ error: "A peer with that name already exists." }, { status: 409 });
    await recordAudit(db, { orgId: user.orgId, userId: user.userId, action: "competitor.add_manual", entityType: "competitor", entityId: row.id, after: row });
    return NextResponse.json({ competitor: row }, { status: 201 });
  }),
);

export const PATCH = withRole<{ id: string }>("editor", async (req, { user, params }) =>
  siteErrors(async () => {
    const db = getDb();
    await siteContext(db, params.id, user.orgId);
    const body = await jsonBody(req);
    if (typeof body.id !== "string" || (body.status !== "confirmed" && body.status !== "rejected")) {
      return NextResponse.json({ error: "id and status (confirmed or rejected) are required." }, { status: 400 });
    }
    const { before, after } = await reviewPeer(db, { siteId: params.id, orgId: user.orgId, peerId: body.id, status: body.status, userId: user.userId });
    await recordAudit(db, { orgId: user.orgId, userId: user.userId, action: `peer.${body.status}`, entityType: "peer_suggestion", entityId: after.id, before: { status: before.status }, after: { status: after.status, competitor_id: after.competitorId, name: after.name } });
    return NextResponse.json({ peer: after });
  }),
);
