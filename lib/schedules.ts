import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import { z } from "zod";
import { NotFoundError, ValidationError } from "./campaigns";
import { approveScan, planScan } from "./capture/batch";
import { batchSpec } from "./capture/service";
import type { Db } from "./db/pg/client";
import { alerts, campaigns, promptSets, scans, schedules } from "./db/pg/schema";
import { QUEUES } from "./queues";

export type Cadence = (typeof schedules.$inferSelect)["cadence"];
export type ScheduleRow = typeof schedules.$inferSelect;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

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

export async function createSchedule(db: Db, orgId: string, raw: unknown, now = new Date()): Promise<ScheduleRow> {
  const parsed = scheduleInput.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  const input = parsed.data;
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
      enabled: input.enabled ?? true,
    })
    .returning();
  return row;
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

export type TickResult = {
  scheduleId: string;
  periodKey: string | null;
  scanId: string | null;
  action: "started" | "awaiting_approval" | "skipped_existing" | "error";
  detail: string | null;
};

type SendJob = (queue: string, data: object) => Promise<string | null>;

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** The first run strictly after `now`, stepping from the schedule's own cadence so a late tick does not shift the calendar. */
function nextAfter(cadence: Cadence, from: Date, now: Date): Date {
  let next = advanceNextRun(cadence, from);
  while (next.getTime() <= now.getTime()) next = advanceNextRun(cadence, next);
  return next;
}

/**
 * Runs every enabled, due schedule once per period. One scan per (schedule, period): a second tick in the same
 * period finds the scan and does nothing. The scan is estimated first; it auto-runs only when the estimate is known,
 * has no refusals, and is within the schedule's budget cap (no cap set means no auto-run). Otherwise it waits for a
 * person and a budget_threshold alert says so. A schedule that fails is reported and does not stop the others.
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
    // Period comes from the due instant (next_run_at), not wall-clock now, so a late tick still attributes the correct slot.
    const period = periodKey(s.cadence, s.nextRunAt) as string;
    const done = (r: Omit<TickResult, "scheduleId" | "periodKey">) => {
      const full = { scheduleId: s.id, periodKey: period, ...r };
      results.push(full);
      log(`[schedule.tick] ${s.id} ${period}: ${full.action}${full.detail ? ` (${full.detail})` : ""}`);
    };
    try {
      const [existing] = await db.select({ id: scans.id }).from(scans).where(and(eq(scans.scheduleId, s.id), eq(scans.periodKey, period)));
      if (existing) {
        await db.update(schedules).set({ nextRunAt: nextAfter(s.cadence, s.nextRunAt, now) }).where(eq(schedules.id, s.id));
        done({ scanId: existing.id, action: "skipped_existing", detail: "a scan for this period already exists" });
        continue;
      }
      const spec = await batchSpec(db, orgId, {
        campaign_id: s.campaignId,
        prompt_set_id: s.promptSetId,
        kind: "scan",
        draws: 3,
        canary: true,
        name: `Scheduled ${s.cadence} scan ${period}`,
      });
      let planned: Awaited<ReturnType<typeof planScan>>;
      try {
        planned = await planScan(db, { orgId, ...spec, scheduleId: s.id, periodKey: period, adapters: opts.adapters });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Another tick won the race for this period.
        await db.update(schedules).set({ nextRunAt: nextAfter(s.cadence, s.nextRunAt, now) }).where(eq(schedules.id, s.id));
        done({ scanId: null, action: "skipped_existing", detail: "a scan for this period was created concurrently" });
        continue;
      }
      const { scanId, estimate } = planned;
      const cap = s.budgetCapUsd === null ? null : Number(s.budgetCapUsd);
      const withinCap = estimate.totalUsd !== null && cap !== null && estimate.totalUsd <= cap && estimate.refusals.length === 0;
      let action: TickResult["action"] = "awaiting_approval";
      let detail: string | null = null;
      if (withinCap) {
        const approved = await approveScan(db, scanId, { userId: null, via: `schedule:${s.id}` });
        if (approved.ok) {
          try {
            await opts.sendJob(QUEUES.scanRun, { scan_id: scanId, org_id: orgId });
            action = "started";
          } catch (err) {
            // Approved but not queued. Say so; never retry a paid run automatically.
            action = "error";
            detail = `scan approved but scan.run was not queued: ${err instanceof Error ? err.message : String(err)}`;
          }
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
            refusals: estimate.refusals,
          },
        });
      }
      await db.update(schedules).set({ nextRunAt: nextAfter(s.cadence, s.nextRunAt, now) }).where(eq(schedules.id, s.id));
      done({ scanId, action, detail });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      done({ scanId: null, action: "error", detail: message });
    }
  }
  return results;
}
