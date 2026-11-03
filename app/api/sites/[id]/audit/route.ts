import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { crawlRuns } from "@/lib/db/pg/schema";
import { sendJob } from "@/lib/jobs";
import { siteContext } from "@/lib/site/context";
import { jsonBody, siteErrors } from "@/lib/site/http";
import { auditReport } from "@/lib/site/service";
import { QUEUES } from "@/lib/queues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole<{ id: string }>("viewer", async (req, { user, params }) =>
  siteErrors(async () => {
    const q = new URL(req.url).searchParams;
    const report = await auditReport(getDb(), user.orgId, params.id, {
      crawlRunId: q.get("crawl_run_id"),
      auditRunId: q.get("audit_run_id"),
      hostId: q.get("host_id"),
      severity: q.get("severity"),
      ruleId: q.get("rule_id"),
      limit: Number(q.get("limit") || 200),
      offset: Number(q.get("offset") || 0),
    });
    return NextResponse.json({ report });
  }),
);

/** Reruns the audit on a finished crawl. It adds a new audit run; old runs are kept. */
export const POST = withRole<{ id: string }>("editor", async (req, { user, params }) =>
  siteErrors(async () => {
    const db = getDb();
    await siteContext(db, params.id, user.orgId);
    const body = await jsonBody(req);
    const runId = String(body.crawl_run_id ?? "");
    const [run] = await db.select().from(crawlRuns).where(and(eq(crawlRuns.id, runId), eq(crawlRuns.siteId, params.id)));
    if (!run) return NextResponse.json({ error: "Crawl run not found." }, { status: 404 });
    if (run.status !== "complete") return NextResponse.json({ error: "The crawl has not finished." }, { status: 409 });
    const jobId = await sendJob(QUEUES.auditRun, { crawl_run_id: run.id, user_id: user.userId });
    return NextResponse.json({ job_id: jobId }, { status: 202 });
  }),
);
