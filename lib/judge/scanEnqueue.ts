import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, draws, scans } from "@/lib/db/pg/schema";
import { modelsForScanPreflight, preflightFireworksModels } from "@/lib/fireworks/preflight";
import { QUEUES } from "@/lib/queues";
import type { JudgeEnqueueBoss } from "@/lib/judge/autorun";

export type JudgeScanEstimate = {
  scanId: string;
  orgId: string;
  okDraws: number;
  /** Chars/4 stand-in units for budget communication only. */
  estimatedUnits: number;
  modelIds: string[];
};

/** Count ok draws and a conservative token-unit estimate for a scan judge pass. */
export async function estimateJudgeScan(db: Db, opts: { orgId: string; scanId: string }): Promise<JudgeScanEstimate> {
  const [row] = await db
    .select({ id: scans.id, orgId: campaigns.orgId })
    .from(scans)
    .innerJoin(campaigns, eq(campaigns.id, scans.campaignId))
    .where(and(eq(scans.id, opts.scanId), eq(campaigns.orgId, opts.orgId)));
  if (!row) throw new Error(`Scan ${opts.scanId} not found in org`);
  const ok = await db
    .select({ id: draws.id })
    .from(draws)
    .where(and(eq(draws.scanId, opts.scanId), eq(draws.status, "ok")));
  return {
    scanId: opts.scanId,
    orgId: opts.orgId,
    okDraws: ok.length,
    estimatedUnits: Math.max(1, ok.length * 2000),
    modelIds: modelsForScanPreflight(),
  };
}

/**
 * Preflight + optional enqueue of judge.run.
 * Without approve: estimate only (no job). With approve: preflight then enqueue.
 */
export async function runJudgeScanEnqueue(
  db: Db,
  boss: JudgeEnqueueBoss,
  opts: {
    orgId: string;
    scanId: string;
    approve: boolean;
    jobOptions?: unknown;
  },
): Promise<{ enqueued: boolean; estimate: JudgeScanEstimate; reason: string | null }> {
  const estimate = await estimateJudgeScan(db, { orgId: opts.orgId, scanId: opts.scanId });
  if (!opts.approve) {
    return { enqueued: false, estimate, reason: "No job sent without --approve" };
  }
  const preflight = await preflightFireworksModels(db, { orgId: opts.orgId, modelIds: estimate.modelIds });
  if (!preflight.ok) {
    return { enqueued: false, estimate, reason: preflight.reason };
  }
  await boss.send(QUEUES.judgeRun, { scan_id: opts.scanId, org_id: opts.orgId }, opts.jobOptions);
  return { enqueued: true, estimate, reason: null };
}
