import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { sendJob } from "@/lib/jobs";
import { jsonBody, siteErrors } from "@/lib/site/http";
import { ensurePhase2Providers } from "@/lib/site/providerCall";
import { createSite, listSites } from "@/lib/site/service";
import { QUEUES } from "@/lib/queues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole("viewer", async (_req, { user }) => NextResponse.json({ sites: await listSites(getDb(), user.orgId) }));

export const POST = withRole("editor", async (req, { user }) =>
  siteErrors(async () => {
    const body = await jsonBody(req);
    const db = getDb();
    await ensurePhase2Providers(db, user.orgId);
    const { site, created } = await createSite(db, user.orgId, String(body.root_url ?? ""));
    let jobId: string | null = null;
    if (created || site.status === "new" || site.status === "failed") jobId = await sendJob(QUEUES.crawlDiscover, { site_id: site.id });
    return NextResponse.json({ site, created, job_id: jobId }, { status: created ? 201 : 200 });
  }),
);
