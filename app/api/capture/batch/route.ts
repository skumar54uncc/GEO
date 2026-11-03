import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { approveScan, planScan } from "@/lib/capture/batch";
import { planCalibration } from "@/lib/capture/calibration";
import { batchSpec, bodyOf, campaignFor, CaptureInputError, captureErrors, scanOwned, scanView } from "@/lib/capture/service";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { getDb } from "@/lib/db/pg/client";
import { promptSetItems } from "@/lib/db/pg/schema";
import { sendJob } from "@/lib/jobs";
import { QUEUES } from "@/lib/queues";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole("viewer", async (req, { user }) =>
  captureErrors(async () => {
    const scanId = new URL(req.url).searchParams.get("scan_id");
    if (!scanId) throw new CaptureInputError("scan_id required");
    const view = await scanView(getDb(), user.orgId, scanId);
    return view ? NextResponse.json(view) : NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }),
);

/**
 * action "estimate": creates the scan with its estimate; nothing is called.
 * action "estimate_calibration": same for the monthly calibration (20 sampled prompts, primary vs fallback).
 * action "approve": approves an estimate with no refusals and queues the run.
 */
export const POST = withRole("editor", async (req, { user }) =>
  captureErrors(async () => {
    const db = getDb();
    const body = await bodyOf(req);
    if (body.action === "estimate") {
      const s = await batchSpec(db, user.orgId, body);
      const res = await planScan(db, { orgId: user.orgId, ...s });
      return NextResponse.json({ scan_id: res.scanId, estimate: res.estimate });
    }
    if (body.action === "estimate_calibration") {
      const campaign = await campaignFor(db, user.orgId, body.campaign_id ? String(body.campaign_id) : null);
      const promptSetId = body.prompt_set_id ? String(body.prompt_set_id) : null;
      if (!promptSetId) throw new CaptureInputError("Calibration samples from a frozen prompt set");
      const ids = (await db.select({ id: promptSetItems.promptId }).from(promptSetItems).where(eq(promptSetItems.promptSetId, promptSetId))).map((r) => r.id);
      const region = body.region_id ? String(body.region_id) : (await ensureNamedRegion(db, CHARLOTTE_REGION)).id;
      const month = /^\d{4}-\d{2}$/.test(String(body.month ?? "")) ? String(body.month) : new Date().toISOString().slice(0, 7);
      const res = await planCalibration(db, { orgId: user.orgId, campaignId: campaign.id, promptSetId, promptIds: ids, regionId: region, month });
      return NextResponse.json({ scan_id: res.scanId, estimate: res.estimate });
    }
    if (body.action === "approve") {
      const scanId = await scanOwned(db, user.orgId, String(body.scan_id ?? ""));
      const ok = await approveScan(db, scanId, { userId: user.userId, via: "ui" });
      if (!ok.ok) throw new CaptureInputError(ok.reason ?? "Not approved");
      const jobId = await sendJob(QUEUES.scanRun, { scan_id: scanId, org_id: user.orgId });
      return NextResponse.json({ scan_id: scanId, job_id: jobId });
    }
    throw new CaptureInputError('action must be "estimate", "estimate_calibration" or "approve"');
  }),
);
