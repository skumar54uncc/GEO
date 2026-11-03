import { NextResponse } from "next/server";
import { recordAudit, withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { sendJob } from "@/lib/jobs";
import { siteContext } from "@/lib/site/context";
import { jsonBody, siteErrors } from "@/lib/site/http";
import { crawlerContact } from "@/lib/site/net/userAgent";
import { startCrawl } from "@/lib/site/service";
import { QUEUES } from "@/lib/queues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts a crawl of the included hosts only. One crawl.page job per host. */
export const POST = withRole<{ id: string }>("editor", async (req, { user, params }) =>
  siteErrors(async () => {
    const db = getDb();
    await siteContext(db, params.id, user.orgId);
    try {
      crawlerContact();
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
    }
    const body = await jsonBody(req);
    const run = await startCrawl(db, { siteId: params.id, userId: user.userId, pageCapPerHost: Number(body.page_cap_per_host ?? 50) });
    for (const hostId of run.hostIds) await sendJob(QUEUES.crawlPage, { crawl_run_id: run.id, host_id: hostId });
    await recordAudit(db, { orgId: user.orgId, userId: user.userId, action: "crawl.start", entityType: "crawl_run", entityId: run.id, after: { hosts: run.hostIds.length, page_cap_per_host: run.pageCapPerHost } });
    return NextResponse.json({ crawl_run: run }, { status: 202 });
  }),
);
