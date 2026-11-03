import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { sendJob } from "@/lib/jobs";
import { siteContext } from "@/lib/site/context";
import { siteErrors } from "@/lib/site/http";
import { entityCheckView } from "@/lib/site/service";
import { QUEUES } from "@/lib/queues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole<{ id: string }>("viewer", async (_req, { user, params }) =>
  siteErrors(async () => NextResponse.json({ checks: await entityCheckView(getDb(), params.id, user.orgId) })),
);

export const POST = withRole<{ id: string }>("editor", async (_req, { user, params }) =>
  siteErrors(async () => {
    const ctx = await siteContext(getDb(), params.id, user.orgId);
    if (!(ctx.brand.profile as { confirmed_at?: string }).confirmed_at) {
      return NextResponse.json({ error: "Confirm the entity profile first." }, { status: 400 });
    }
    const jobId = await sendJob(QUEUES.entityCheck, { brand_id: ctx.brand.id, org_id: ctx.orgId });
    return NextResponse.json({ job_id: jobId }, { status: 202 });
  }),
);
