import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { prompts, scans } from "@/lib/db/pg/schema";
import { approveScan, planScan, runScan, type RunSummary, type ScanEstimate } from "./batch";
import { CANARY_TAG } from "./canary";
import { CHARLOTTE_REGION, ensureNamedRegion } from "./regions";
import { ROUTES, type ProviderId } from "./registry";
import type { Engine, ProviderAdapter } from "./types";

export const DRY_RUN_SHAPE = { prompts: 3, draws: 3 } as const;

type Adapters = Partial<Record<ProviderId, ProviderAdapter>>;

/** Approved prompts first, then drafts, in campaign order. Canary prompts never count. */
async function pickPrompts(db: Db, campaignId: string, n: number): Promise<string[]> {
  const rows = await db
    .select({ id: prompts.id })
    .from(prompts)
    .where(and(eq(prompts.campaignId, campaignId), sql`${prompts.status} <> 'rejected'`, sql`not (${CANARY_TAG} = any(${prompts.tags}))`))
    .orderBy(sql`case when ${prompts.status} = 'approved' then 0 else 1 end`, asc(prompts.seq))
    .limit(n);
  return rows.map((r) => r.id);
}

/** 3 prompts × every engine's primary route × 3 draws × Charlotte. Creates the scan with its estimate; calls nothing. */
export async function planDryRun(db: Db, opts: { orgId: string; campaignId: string; promptIds?: string[]; adapters?: Adapters }) {
  const promptIds = opts.promptIds?.length ? opts.promptIds : await pickPrompts(db, opts.campaignId, DRY_RUN_SHAPE.prompts);
  if (promptIds.length < DRY_RUN_SHAPE.prompts) throw new Error(`The campaign needs at least ${DRY_RUN_SHAPE.prompts} prompts; found ${promptIds.length}`);
  const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
  return planScan(db, {
    orgId: opts.orgId,
    campaignId: opts.campaignId,
    kind: "dry_run",
    name: `Dry run ${new Date().toISOString().slice(0, 10)}`,
    spec: { promptIds, routes: (Object.keys(ROUTES) as Engine[]).map((e) => ROUTES[e].primary), regionIds: [region.id], draws: DRY_RUN_SHAPE.draws, canary: true },
    adapters: opts.adapters,
  });
}

/** Runs a planned dry run only when the caller repeats the exact estimated total. */
export async function runDryRun(
  db: Db,
  opts: { orgId: string; scanId: string; approvedUsd: number; approver: string; adapters?: Adapters; log?: (m: string) => void },
): Promise<RunSummary> {
  const [scan] = await db.select().from(scans).where(eq(scans.id, opts.scanId));
  if (!scan || scan.kind !== "dry_run") throw new Error("No dry run scan with that id");
  const est = scan.estimate as ScanEstimate | null;
  if (!est || est.totalUsd === null) throw new Error("This dry run has no priced estimate; plan a new one");
  if (opts.approvedUsd !== est.totalUsd) throw new Error(`Approved amount ${opts.approvedUsd} does not match the estimate ${est.totalUsd}`);
  const approval = await approveScan(db, opts.scanId, { userId: null, via: opts.approver });
  if (!approval.ok) throw new Error(approval.reason ?? "Approval refused");
  return runScan(db, opts.scanId, { orgId: opts.orgId, adapters: opts.adapters, log: opts.log });
}
