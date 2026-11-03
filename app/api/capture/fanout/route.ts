import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { planFanout } from "@/lib/capture/fanout";
import { bodyOf, CaptureInputError, captureErrors, scanOwned } from "@/lib/capture/service";
import { getDb } from "@/lib/db/pg/client";
import { sendJob } from "@/lib/jobs";
import { QUEUES } from "@/lib/queues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "estimate" lists new fan out queries of a scan and the cost of their organic results; "run" queues them. */
export const POST = withRole("editor", async (req, { user }) =>
  captureErrors(async () => {
    const db = getDb();
    const body = await bodyOf(req);
    const scanId = await scanOwned(db, user.orgId, String(body.scan_id ?? ""));
    const limit = Math.min(500, Math.max(1, Number(body.limit ?? 100) || 100));
    const plan = await planFanout(db, scanId, limit);
    if (body.action === "estimate") return NextResponse.json({ plan });
    if (body.action === "run") {
      if (!plan.items.length) throw new CaptureInputError("No new fan out queries");
      if (Number(body.approved_usd) !== plan.usd) throw new CaptureInputError("The fan out cost changed; review it again");
      const jobId = await sendJob(QUEUES.fanoutRun, { scan_id: scanId, org_id: user.orgId, approved_usd: plan.usd, limit });
      return NextResponse.json({ job_id: jobId, plan });
    }
    throw new CaptureInputError('action must be "estimate" or "run"');
  }),
);
