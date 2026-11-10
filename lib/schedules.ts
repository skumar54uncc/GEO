import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import { z } from "zod";
import { NotFoundError, ValidationError } from "./campaigns";
import { approveScan, computeScanEstimate, planScan, type ScanEstimate } from "./capture/batch";
import { batchSpec } from "./capture/service";
import type { Db } from "./db/pg/client";
import { alerts, campaigns, promptSets, providerAccounts, scans, schedules } from "./db/pg/schema";
import { QUEUES } from "./queues";

export type Cadence = (typeof schedules.$inferSelect)["cadence"];
export type ScheduleRow = typeof schedules.$inferSelect;

/** Display and UI create flows only offer biweekly / monthly (manual stays API-only for tests). */
export const UI_CADENCES = ["biweekly", "monthly"] as const;
export type UiCadence = (typeof UI_CADENCES)[number];

export const SCHEDULE_TZ = "America/New_York" as const;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Next run for Settings UI — America/New_York wall time. */
export function formatNextRunNy(at: Date | string | null | undefined): string | null {
  if (at == null) return null;
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

/** Expected runs per calendar month for monthly projection (biweekly ≈ 26/12). */
export function runsPerMonth(cadence: Cadence): number | null {
  if (cadence === "monthly") return 1;
  if (cadence === "biweekly") return 26 / 12;
  return null;
}

export function monthlyProjectionUsd(perRunUsd: number | null, cadence: Cadence): number | null {
  if (perRunUsd == null) return null;
  const n = runsPerMonth(cadence);
  if (n == null) return null;
  return Math.round(perRunUsd * n * 100) / 100;
}

/**
 * The period a scheduled scan covers, in UTC. Monthly: `YYYY-MM`. Biweekly: the ISO 8601 week the run falls in,
 * `YYYY-Www` (ISO year, which can differ from the calendar year around New Year). Manual schedules have no period.
 */
export function periodKey(cadence: Cadence, at: Date): string | null {
  if (cadence === "manual") return null;
  if (cadence === "monthly") return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}`;
  // ISO week: the week belongs to the year of its Thursday.
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}

/** The next run after `from`: 14 days for biweekly, the same day next month (clamped to month end) for monthly. */
export function advanceNextRun(cadence: Cadence, from: Date): Date {
  if (cadence === "manual") throw new RangeError("Manual schedules have no next run");
  if (cadence === "biweekly") return new Date(from.getTime() + 14 * 86_400_000);
  const target = new Date(from.getTime());
  const day = from.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + 1);
  const monthEnd = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, monthEnd));
  return target;
}

export const scheduleInput = z.object({
  campaign_id: z.string().uuid(),
  prompt_set_id: z.string().uuid(),
  cadence: z.enum(["biweekly", "monthly", "manual"]),
  budget_cap_usd: z.number().nonnegative().nullable().optional(),
  next_run_at: z.string().datetime().nullable().optional(),
  enabled: z.boolean().optional(),
  /**
   * Explicit estimate approval gate. Create refuses unless true.
   * Prevents a schedule that could later auto-run a paid scan without a human accepting the price.
   */
  estimate_approved: z.literal(true),
  /** The per-run USD the editor approved (may be null only when the estimate itself is unknown — still refused for paid auto-run). */
  approved_estimate_usd: z.number().nonnegative().nullable(),
});
export type ScheduleInput = z.infer<typeof scheduleInput>;

export const schedulePatch = z
  .object({
    prompt_set_id: z.string().uuid(),
    cadence: z.enum(["biweekly", "monthly", "manual"]),
    budget_cap_usd: z.number().nonnegative().nullable(),
    next_run_at: z.string().datetime().nullable(),
    enabled: z.boolean(),
  })
  .partial();
export type SchedulePatch = z.infer<typeof schedulePatch>;

export const scheduleEstimateInput = z.object({
  campaign_id: z.string().uuid(),
  prompt_set_id: z.string().uuid(),
  cadence: z.enum(["biweekly", "monthly"]),
});
export type ScheduleEstimateInput = z.infer<typeof scheduleEstimateInput>;

/** The schedule if its campaign belongs to the org. Never trust a schedule id alone. */
export async function scheduleOwned(db: Db, orgId: string, scheduleId: string): Promise<ScheduleRow> {
  const [row] = await db
    .select({ s: schedules })
    .from(schedules)
    .innerJoin(campaigns, eq(campaigns.id, schedules.campaignId))
    .where(and(eq(schedules.id, scheduleId), eq(campaigns.orgId, orgId)));
  if (!row) throw new NotFoundError("Schedule not found.");
  return row.s;
}

async function assertFrozenSetInCampaign(db: Db, campaignId: string, promptSetId: string): Promise<void> {
  const [set] = await db.select().from(promptSets).where(and(eq(promptSets.id, promptSetId), eq(promptSets.campaignId, campaignId)));
  if (!set) throw new ValidationError("Prompt set not found in this campaign.");
  if (!set.frozenAt) throw new ValidationError("Freeze the prompt set before scheduling scans on it.");
}

export type ScheduleCostPreview = {
  estimate: ScanEstimate;
  perRunUsd: number | null;
  monthlyProjectionUsd: number | null;
  cadence: UiCadence;
  providerCaps: Array<{
    provider: string;
    monthlyBudgetUsd: number | null;
    perScanCapUsd: number | null;
    exceedsMonthlyCap: boolean | null;
    exceedsPerScanCap: boolean | null;
  }>;
};

/** Estimate a typical scheduled scan (same draws/canary as tick) without creating a scan row. */
export async function estimateScheduleRun(
  db: Db,
  orgId: string,
  raw: unknown,
  adapters?: Parameters<typeof computeScanEstimate>[1]["adapters"],
): Promise<ScheduleCostPreview> {
  const parsed = scheduleEstimateInput.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  const input = parsed.data;
  const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, input.campaign_id), eq(campaigns.orgId, orgId)));
  if (!campaign) throw new NotFoundError("Campaign not found.");
  await assertFrozenSetInCampaign(db, campaign.id, input.prompt_set_id);
  const spec = await batchSpec(db, orgId, {
    campaign_id: campaign.id,
    prompt_set_id: input.prompt_set_id,
    kind: "scan",
    draws: 3,
    canary: true,
    name: `Schedule estimate ${input.cadence}`,
  });
  const estimate = await computeScanEstimate(db, {
    orgId,
    promptSetId: spec.promptSetId,
    spec: spec.spec,
    adapters,
  });
  const perRunUsd = estimate.totalUsd;
  const monthly = monthlyProjectionUsd(perRunUsd, input.cadence);
  const accounts = await db.select().from(providerAccounts).where(eq(providerAccounts.orgId, orgId));
  const byProvider = new Map<string, { usd: number }>();
  for (const cell of estimate.cells) {
    if (cell.usd == null) continue;
    const agg = byProvider.get(cell.provider) ?? { usd: 0 };
    agg.usd += cell.usd;
    byProvider.set(cell.provider, agg);
  }
  const providerCaps = accounts.map((a) => {
    const monthlyBudgetUsd = a.monthlyBudgetUsd == null ? null : Number(a.monthlyBudgetUsd);
    const perScanCapUsd = a.perScanCapUsd == null ? null : Number(a.perScanCapUsd);
    const share = byProvider.get(a.provider)?.usd ?? null;
    const monthlyShare = share == null || monthly == null || perRunUsd == null || perRunUsd === 0 ? null : (share / perRunUsd) * monthly;
    return {
      provider: a.provider,
      monthlyBudgetUsd,
      perScanCapUsd,
      exceedsMonthlyCap:
        monthlyBudgetUsd == null || monthlyShare == null ? null : monthlyShare > monthlyBudgetUsd,
      exceedsPerScanCap: perScanCapUsd == null || share == null ? null : share > perScanCapUsd,
    };
  });
  return {
    estimate,
    perRunUsd,
    monthlyProjectionUsd: monthly,
    cadence: input.cadence,
    providerCaps,
  };
}

export async function createSchedule(
  db: Db,
  orgId: string,
  raw: unknown,
  now = new Date(),
): Promise<Omit<ScheduleRow, "approvedEstimateUsd"> & { approvedEstimateUsd: number | null }> {
  const parsed = scheduleInput.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  const input = parsed.data;
  if (input.estimate_approved !== true) {
    throw new ValidationError("Creating a schedule requires explicit estimate approval (estimate_approved: true).");
  }
  const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, input.campaign_id), eq(campaigns.orgId, orgId)));
  if (!campaign) throw new NotFoundError("Campaign not found.");
  await assertFrozenSetInCampaign(db, campaign.id, input.prompt_set_id);
  // Without an explicit start the first run is one period out, so creating a schedule never spends money by surprise.
  const nextRunAt =
    input.cadence === "manual" ? null : input.next_run_at ? new Date(input.next_run_at) : advanceNextRun(input.cadence, now);
  const [row] = await db
    .insert(schedules)
    .values({
      campaignId: campaign.id,
      promptSetId: input.prompt_set_id,
      cadence: input.cadence,
      nextRunAt,
      budgetCapUsd: input.budget_cap_usd === undefined || input.budget_cap_usd === null ? null : String(input.budget_cap_usd),
      approvedEstimateUsd:
        input.approved_estimate_usd === undefined || input.approved_estimate_usd === null
          ? null
          : String(input.approved_estimate_usd),
      enabled: input.enabled ?? true,
    })
    .returning();
  const { approvedEstimateUsd: _dbUsd, ...rest } = row;
  return {
    ...rest,
    approvedEstimateUsd:
      input.approved_estimate_usd === undefined || input.approved_estimate_usd === null
        ? null
        : input.approved_estimate_usd,
  };
}

/**
 * Delete a schedule. Detaches past scans (schedule_id → null) so history remains,
 * then removes the row. Pause/resume is preferred when you only want to stop future runs.
 */
export async function deleteSchedule(db: Db, orgId: string, scheduleId: string): Promise<ScheduleRow> {
  const current = await scheduleOwned(db, orgId, scheduleId);
  await db.update(scans).set({ scheduleId: null }).where(eq(scans.scheduleId, scheduleId));
  await db.delete(schedules).where(eq(schedules.id, scheduleId));
  return current;
}

/** Frozen prompt sets only — unfrozen sets are not selectable in the Schedules UI. */
export async function listFrozenPromptSetsForOrg(db: Db, orgId: string, campaignId: string) {
  const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)));
  if (!campaign) throw new NotFoundError("Campaign not found.");
  const rows = await db
    .select({
      id: promptSets.id,
      version: promptSets.version,
      label: promptSets.label,
      frozenAt: promptSets.frozenAt,
      sha256: promptSets.sha256,
    })
    .from(promptSets)
    .where(and(eq(promptSets.campaignId, campaignId), isNotNull(promptSets.frozenAt)))
    .orderBy(asc(promptSets.version));
  return rows;
}

export async function listSchedules(db: Db, orgId: string, campaignId: string): Promise<ScheduleRow[]> {
  const rows = await db
    .select({ s: schedules })
    .from(schedules)
    .innerJoin(campaigns, eq(campaigns.id, schedules.campaignId))
    .where(and(eq(schedules.campaignId, campaignId), eq(campaigns.orgId, orgId)))
    .orderBy(asc(schedules.createdAt));
  return rows.map((r) => r.s);
}

export async function updateSchedule(db: Db, orgId: string, scheduleId: string, raw: unknown, now = new Date()): Promise<ScheduleRow> {
  const parsed = schedulePatch.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  const patch = parsed.data;
  if (!Object.keys(patch).length) throw new ValidationError("Nothing to update.");
  const current = await scheduleOwned(db, orgId, scheduleId);
  const set: Partial<typeof schedules.$inferInsert> = {};
  if (patch.prompt_set_id !== undefined) {
    await assertFrozenSetInCampaign(db, current.campaignId, patch.prompt_set_id);
    set.promptSetId = patch.prompt_set_id;
  }
  if (patch.budget_cap_usd !== undefined) set.budgetCapUsd = patch.budget_cap_usd === null ? null : String(patch.budget_cap_usd);
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  const cadence = patch.cadence ?? current.cadence;
  if (patch.cadence !== undefined) set.cadence = patch.cadence;
  if (cadence === "manual") set.nextRunAt = null;
  else if (patch.next_run_at !== undefined) set.nextRunAt = patch.next_run_at ? new Date(patch.next_run_at) : advanceNextRun(cadence, now);
  else if (patch.cadence !== undefined && current.nextRunAt === null) set.nextRunAt = advanceNextRun(cadence, now);
  const [row] = await db.update(schedules).set(set).where(eq(schedules.id, scheduleId)).returning();
  return row;
}

/** Stops future scheduled scans. History (scans already made) stays. */
export async function disableSchedule(db: Db, orgId: string, scheduleId: string): Promise<ScheduleRow> {
  return updateSchedule(db, orgId, scheduleId, { enabled: false });
}

/** Admin: pause every enabled schedule in the org. Returns how many rows were updated. */
export async function pauseAllSchedules(db: Db, orgId: string): Promise<{ paused: number; ids: string[] }> {
  const rows = await db
    .select({ id: schedules.id })
    .from(schedules)
    .innerJoin(campaigns, eq(campaigns.id, schedules.campaignId))
    .where(and(eq(campaigns.orgId, orgId), eq(schedules.enabled, true)));
  if (!rows.length) return { paused: 0, ids: [] };
  const ids = rows.map((r) => r.id);
  for (const id of ids) {
    await db.update(schedules).set({ enabled: false }).where(eq(schedules.id, id));
  }
  return { paused: ids.length, ids };
}

export type TickResult = {
  scheduleId: string;
  periodKey: string | null;
  scanId: string | null;
  action: "started" | "awaiting_approval" | "paused_reestimate" | "skipped_existing" | "error";
  detail: string | null;
  /** True when this run is a single catch-up after the laptop/worker missed one or more dues. */
  late?: boolean;
  originalDueAt?: string | null;
};

type SendJob = (queue: string, data: object) => Promise<string | null>;

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** The first run strictly after `now`, stepping from the schedule's own cadence so a late tick does not shift the calendar. */
export function nextAfter(cadence: Cadence, from: Date, now: Date): Date {
  let next = advanceNextRun(cadence, from);
  while (next.getTime() <= now.getTime()) next = advanceNextRun(cadence, next);
  return next;
}

/** True when at least one full cadence step was skipped (laptop asleep across dues). */
export function isLateCatchUp(cadence: Cadence, dueAt: Date, now: Date): boolean {
  return advanceNextRun(cadence, dueAt).getTime() <= now.getTime();
}

/** Re-estimate must not exceed the approved create-time estimate by more than 20%. */
export const REESTIMATE_OVERAGE_RATIO = 0.2;

export function estimateExceedsApproved(newUsd: number | null, approvedUsd: number | null): boolean {
  if (newUsd == null || approvedUsd == null) return false;
  if (approvedUsd <= 0) return newUsd > 0;
  return newUsd > approvedUsd * (1 + REESTIMATE_OVERAGE_RATIO);
}

async function providerCapCrossed(
  db: Db,
  orgId: string,
  estimate: ScanEstimate,
): Promise<{ crossed: boolean; detail: string | null }> {
  const accounts = await db.select().from(providerAccounts).where(eq(providerAccounts.orgId, orgId));
  const byProvider = new Map<string, number>();
  for (const cell of estimate.cells) {
    if (cell.usd == null) continue;
    byProvider.set(cell.provider, (byProvider.get(cell.provider) ?? 0) + cell.usd);
  }
  for (const a of accounts) {
    const share = byProvider.get(a.provider);
    if (share == null) continue;
    const perScan = a.perScanCapUsd == null ? null : Number(a.perScanCapUsd);
    if (perScan != null && share > perScan) {
      return { crossed: true, detail: `${a.provider} per-scan cap $${perScan} would be crossed ($${share})` };
    }
    const monthly = a.monthlyBudgetUsd == null ? null : Number(a.monthlyBudgetUsd);
    // Conservative: treat this run's share alone as the monthly check when spent is unknown here.
    if (monthly != null && share > monthly) {
      return { crossed: true, detail: `${a.provider} monthly cap $${monthly} would be crossed ($${share})` };
    }
  }
  return { crossed: false, detail: null };
}

/**
 * Runs every enabled, due schedule. On wake after missed dues: exactly ONE catch-up scan per schedule
 * (period of the original due), marked late, then next_run_at jumps past every skipped slot.
 * Every run re-estimates; if the new estimate exceeds the approved create estimate by >20% or a
 * provider cap would be crossed, the scan is paused for editor re-approval (never auto-captured).
 */
export async function tickSchedules(db: Db, opts: { now?: Date; sendJob: SendJob; log?: (m: string) => void; adapters?: Parameters<typeof planScan>[1]["adapters"] }): Promise<TickResult[]> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => {});
  const due = await db
    .select({ s: schedules, orgId: campaigns.orgId })
    .from(schedules)
    .innerJoin(campaigns, eq(campaigns.id, schedules.campaignId))
    .where(and(eq(schedules.enabled, true), isNotNull(schedules.nextRunAt), lte(schedules.nextRunAt, now)))
    .orderBy(asc(schedules.nextRunAt));
  const results: TickResult[] = [];
  for (const { s, orgId } of due) {
    if (s.cadence === "manual" || !s.nextRunAt) continue;
    const originalDueAt = s.nextRunAt;
    const late = isLateCatchUp(s.cadence, originalDueAt, now);
    // Period from the original due — never invent periods for the skipped slots.
    const period = periodKey(s.cadence, originalDueAt) as string;
    const done = (r: Omit<TickResult, "scheduleId" | "periodKey" | "late" | "originalDueAt">) => {
      const full: TickResult = {
        scheduleId: s.id,
        periodKey: period,
        late,
        originalDueAt: originalDueAt.toISOString(),
        ...r,
      };
      results.push(full);
      log(`[schedule.tick] ${s.id} ${period}: ${full.action}${late ? " late" : ""}${full.detail ? ` (${full.detail})` : ""}`);
    };
    try {
      const [existing] = await db.select({ id: scans.id }).from(scans).where(and(eq(scans.scheduleId, s.id), eq(scans.periodKey, period)));
      if (existing) {
        // Still advance past all missed slots so we never queue N catch-ups.
        await db.update(schedules).set({ nextRunAt: nextAfter(s.cadence, originalDueAt, now) }).where(eq(schedules.id, s.id));
        done({ scanId: existing.id, action: "skipped_existing", detail: "a scan for this period already exists" });
        continue;
      }
      const lateLabel = late ? ` (late; due ${originalDueAt.toISOString()})` : "";
      const spec = await batchSpec(db, orgId, {
        campaign_id: s.campaignId,
        prompt_set_id: s.promptSetId,
        kind: "scan",
        draws: 3,
        canary: true,
        name: `Scheduled ${s.cadence} scan ${period}${lateLabel}`,
      });
      let planned: Awaited<ReturnType<typeof planScan>>;
      try {
        planned = await planScan(db, { orgId, ...spec, scheduleId: s.id, periodKey: period, adapters: opts.adapters });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        await db.update(schedules).set({ nextRunAt: nextAfter(s.cadence, originalDueAt, now) }).where(eq(schedules.id, s.id));
        done({ scanId: null, action: "skipped_existing", detail: "a scan for this period was created concurrently" });
        continue;
      }
      const { scanId, estimate } = planned;
      const approvedUsd = s.approvedEstimateUsd == null ? null : Number(s.approvedEstimateUsd);
      const overApproved = estimateExceedsApproved(estimate.totalUsd, approvedUsd);
      const caps = await providerCapCrossed(db, orgId, estimate);
      const cap = s.budgetCapUsd == null ? null : Number(s.budgetCapUsd);
      const overBudgetCap = estimate.totalUsd !== null && cap !== null && estimate.totalUsd > cap;

      // Stamp late metadata + re-estimate snapshot onto the immutable estimate blob (scan row update of estimate is allowed only before approval/capture).
      const stamped = {
        ...estimate,
        late,
        originalDueAt: originalDueAt.toISOString(),
        approvedEstimateUsd: approvedUsd,
        reestimateOverage: overApproved,
        providerCapCrossed: caps.crossed,
      };
      await db
        .update(scans)
        .set({
          estimate: stamped,
          name: late ? `Scheduled ${s.cadence} scan ${period} (late; due ${originalDueAt.toISOString()})` : spec.name,
        })
        .where(eq(scans.id, scanId));

      if (overApproved || caps.crossed) {
        const reason = overApproved
          ? `re-estimate $${estimate.totalUsd} exceeds approved $${approvedUsd} by more than ${REESTIMATE_OVERAGE_RATIO * 100}%`
          : caps.detail ?? "provider cap would be crossed";
        await db
          .update(scans)
          .set({
            status: "paused",
            pausedAt: now,
            pausedReason: reason,
          })
          .where(eq(scans.id, scanId));
        await db.insert(alerts).values({
          orgId,
          campaignId: s.campaignId,
          kind: "budget_threshold",
          payload: {
            source: "schedule",
            state: "paused_reestimate",
            message: `Scheduled scan ${period} paused: ${reason}. Editor re-approval required.`,
            schedule_id: s.id,
            scan_id: scanId,
            period_key: period,
            estimate_usd: estimate.totalUsd,
            approved_estimate_usd: approvedUsd,
            late,
            original_due_at: originalDueAt.toISOString(),
            refusals: estimate.refusals,
          },
        });
        await db.update(schedules).set({ nextRunAt: nextAfter(s.cadence, originalDueAt, now) }).where(eq(schedules.id, s.id));
        done({ scanId, action: "paused_reestimate", detail: reason });
        continue;
      }

      const withinCap =
        estimate.totalUsd !== null &&
        cap !== null &&
        !overBudgetCap &&
        estimate.refusals.length === 0;
      let action: TickResult["action"] = "awaiting_approval";
      let detail: string | null = null;
      if (withinCap) {
        const approved = await approveScan(db, scanId, { userId: null, via: `schedule:${s.id}` });
        if (approved.ok) {
          try {
            await opts.sendJob(QUEUES.scanRun, { scan_id: scanId, org_id: orgId });
            action = "started";
          } catch (err) {
            action = "error";
            detail = `scan approved but scan.run was not queued: ${err instanceof Error ? err.message : String(err)}`;
          }
        } else if (approved.reason?.startsWith("Model retired or unavailable on Fireworks:")) {
          await db
            .update(scans)
            .set({
              status: "paused",
              pausedAt: now,
              pausedReason: approved.reason,
            })
            .where(eq(scans.id, scanId));
          await db.insert(alerts).values({
            orgId,
            campaignId: s.campaignId,
            kind: "budget_threshold",
            payload: {
              source: "schedule",
              state: "paused_model",
              message: `Scheduled scan ${period} paused: ${approved.reason}`,
              schedule_id: s.id,
              scan_id: scanId,
              period_key: period,
              late,
              original_due_at: originalDueAt.toISOString(),
            },
          });
          await db.update(schedules).set({ nextRunAt: nextAfter(s.cadence, originalDueAt, now) }).where(eq(schedules.id, s.id));
          done({ scanId, action: "paused_reestimate", detail: approved.reason });
          continue;
        } else detail = approved.reason;
      }
      if (action === "awaiting_approval") {
        const reason =
          estimate.refusals.length > 0
            ? `estimate has refusals: ${estimate.refusals.join("; ")}`
            : estimate.totalUsd === null
              ? "estimate total is unknown"
              : cap === null
                ? "schedule has no budget cap"
                : `estimate $${estimate.totalUsd} is over the schedule cap $${cap}`;
        detail = detail ?? reason;
        await db.insert(alerts).values({
          orgId,
          campaignId: s.campaignId,
          kind: "budget_threshold",
          payload: {
            source: "schedule",
            state: "awaiting_approval",
            message: `Scheduled scan ${period} is waiting for approval: ${reason}.`,
            schedule_id: s.id,
            scan_id: scanId,
            period_key: period,
            estimate_usd: estimate.totalUsd,
            budget_cap_usd: cap,
            late,
            original_due_at: originalDueAt.toISOString(),
            refusals: estimate.refusals,
          },
        });
      }
      // One catch-up only: jump past every skipped due to the next future slot.
      await db.update(schedules).set({ nextRunAt: nextAfter(s.cadence, originalDueAt, now) }).where(eq(schedules.id, s.id));
      done({ scanId, action, detail });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      done({ scanId: null, action: "error", detail: message });
    }
  }
  return results;
}
