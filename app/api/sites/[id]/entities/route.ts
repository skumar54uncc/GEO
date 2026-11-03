import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { recordAudit, withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { crawlRuns } from "@/lib/db/pg/schema";
import { siteContext } from "@/lib/site/context";
import { extractEntityCandidates, groupWithLlm, loadEntityPages, reviewCandidate, saveCandidates } from "@/lib/site/entities";
import { jsonBody, siteErrors } from "@/lib/site/http";
import { ensurePhase2Providers } from "@/lib/site/providerCall";
import { listCandidates } from "@/lib/site/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole<{ id: string }>("viewer", async (_req, { user, params }) =>
  siteErrors(async () => {
    const db = getDb();
    const ctx = await siteContext(db, params.id, user.orgId);
    return NextResponse.json({ candidates: await listCandidates(db, params.id), brand: { name: ctx.brand.name, profile: ctx.brand.profile, ipeds_unitid: ctx.brand.ipedsUnitid } });
  }),
);

/** action "extract" reruns deterministic extraction on the latest crawl; "group" runs the LLM grouping step. */
export const POST = withRole<{ id: string }>("editor", async (req, { user, params }) =>
  siteErrors(async () => {
    const db = getDb();
    const ctx = await siteContext(db, params.id, user.orgId);
    const body = await jsonBody(req);
    if (body.action === "group") {
      await ensurePhase2Providers(db, user.orgId);
      return NextResponse.json({ result: await groupWithLlm(db, { siteId: params.id, orgId: ctx.orgId }) });
    }
    const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.siteId, params.id)).orderBy(desc(crawlRuns.createdAt)).limit(1);
    if (!run) return NextResponse.json({ error: "Crawl the site first." }, { status: 400 });
    const res = await saveCandidates(db, params.id, run.id, extractEntityCandidates(await loadEntityPages(db, run.id)));
    return NextResponse.json({ result: res });
  }),
);

export const PATCH = withRole<{ id: string }>("editor", async (req, { user, params }) =>
  siteErrors(async () => {
    const db = getDb();
    const ctx = await siteContext(db, params.id, user.orgId);
    const body = await jsonBody(req);
    const status = body.status;
    if (typeof body.id !== "string" || (status !== "confirmed" && status !== "rejected" && status !== "proposed")) {
      return NextResponse.json({ error: "id and status (confirmed, rejected or proposed) are required." }, { status: 400 });
    }
    const { before, after } = await reviewCandidate(db, {
      candidateId: body.id,
      siteId: params.id,
      brandId: ctx.brand.id,
      status,
      userId: user.userId,
      requiresContext: typeof body.requires_context === "boolean" ? body.requires_context : undefined,
    });
    await recordAudit(db, {
      orgId: user.orgId,
      userId: user.userId,
      action: `entity_candidate.${status}`,
      entityType: "entity_candidate",
      entityId: after.id,
      before: { status: before.status, requires_context: before.requiresContext },
      after: { status: after.status, requires_context: after.requiresContext, kind: after.kind, value: after.value },
    });
    return NextResponse.json({ candidate: after });
  }),
);
