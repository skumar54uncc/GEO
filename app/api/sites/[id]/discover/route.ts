import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { sendJob } from "@/lib/jobs";
import { siteContext } from "@/lib/site/context";
import { siteErrors } from "@/lib/site/http";
import { QUEUES } from "@/lib/queues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reruns discovery. Hosts a person included or excluded keep that choice. */
export const POST = withRole<{ id: string }>("editor", async (_req, { user, params }) =>
  siteErrors(async () => {
    const ctx = await siteContext(getDb(), params.id, user.orgId);
    if (ctx.site.status === "discovering") return NextResponse.json({ error: "Discovery is already running." }, { status: 409 });
    const jobId = await sendJob(QUEUES.crawlDiscover, { site_id: params.id });
    return NextResponse.json({ job_id: jobId }, { status: 202 });
  }),
);
