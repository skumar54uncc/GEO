import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { planRetry } from "@/lib/capture/batch";
import { bodyOf, CaptureInputError, captureErrors, scanOwned } from "@/lib/capture/service";
import { getDb } from "@/lib/db/pg/client";
import { sendJob } from "@/lib/jobs";
import { QUEUES } from "@/lib/queues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "estimate" shows which failed draws would be retried and the cost; "run" queues them with that cost approved. */
export const POST = withRole("editor", async (req, { user }) =>
  captureErrors(async () => {
    const db = getDb();
    const body = await bodyOf(req);
    const scanId = await scanOwned(db, user.orgId, String(body.scan_id ?? ""));
    const plan = await planRetry(db, scanId, user.orgId);
    if (body.action === "estimate") return NextResponse.json({ plan });
    if (body.action === "run") {
      if (!plan.draws.length) throw new CaptureInputError("No failed draws to retry");
      if (plan.refusals.length) throw new CaptureInputError(plan.refusals.join("; "));
      const approved = body.approved_usd === null ? null : Number(body.approved_usd);
      if (approved !== plan.usd) throw new CaptureInputError("The retry cost changed; review it again");
      const jobId = await sendJob(QUEUES.captureRetry, { scan_id: scanId, org_id: user.orgId, approved_usd: approved });
      return NextResponse.json({ job_id: jobId, plan });
    }
    throw new CaptureInputError('action must be "estimate" or "run"');
  }),
);
