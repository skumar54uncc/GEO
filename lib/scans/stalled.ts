import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { auditLog, campaigns, draws, scans } from "@/lib/db/pg/schema";

/** Stalled if no worker progress for this long (running scans with no active job). */
export const STALL_AFTER_MS = 24 * 60 * 60 * 1000;

export type ScanRow = typeof scans.$inferSelect;
export type ScanStatus = ScanRow["status"];

export type IsScanStalledInput = {
  status: ScanStatus;
  createdAt: Date;
  now: Date;
  hasActiveJob: boolean;
};

/**
 * Pure predicate: a scan is stalled when it has been `running` longer than {@link STALL_AFTER_MS}
 * and has no in-flight worker job.
 */
export function isScanStalled(input: IsScanStalledInput): boolean {
  if (input.status !== "running") return false;
  if (input.hasActiveJob) return false;
  return input.now.getTime() - input.createdAt.getTime() >= STALL_AFTER_MS;
}

export type ReconcileStalledScansOptions = {
  now?: Date;
  /** Return true when a pg-boss job for this scan is active (created, retry, active). */
  hasActiveJob?: (scanId: string) => Promise<boolean>;
};

export type ReconcileStalledScanResult = {
  scanId: string;
  previousStatus: ScanStatus;
  nextStatus: "partial" | "complete";
  hadOkDraws: boolean;
};

const ACTIVE_JOB_STATES = ["created", "retry", "active"] as const;

const SCAN_QUEUES = ["scan.run", "capture.retry", "fanout.run", "judge.run", "metrics.rollup", "alerts.evaluate"] as const;

let warnedMissingPgbossTable = false;

async function pgbossJobTableExists(db: Db): Promise<boolean> {
  const r = await db.execute(sql`select to_regclass('pgboss.job') as oid`);
  const row = (r.rows as Array<{ oid: string | null }>)[0];
  return Boolean(row?.oid);
}

async function defaultHasActiveJob(db: Db, scanId: string): Promise<boolean> {
  if (!(await pgbossJobTableExists(db))) {
    if (!warnedMissingPgbossTable) {
      console.warn(
        "[reconcileStalledScans] pgboss.job not found; treating all scans as having no active job (pass hasActiveJob to override).",
      );
      warnedMissingPgbossTable = true;
    }
    return false;
  }
  const q = sql`
    select 1
    from pgboss.job
    where name in (${sql.join(
      SCAN_QUEUES.map((name) => sql`${name}`),
      sql`, `,
    )})
      and state in (${sql.join(
      ACTIVE_JOB_STATES.map((s) => sql`${s}`),
      sql`, `,
    )})
      and (data->>'scan_id' = ${scanId} or data->>'scanId' = ${scanId})
    limit 1
  `;
  try {
    const rows = await db.execute(q);
    return (rows.rows as unknown[]).length > 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `reconcileStalledScans: could not query pgboss.job (${message}). Ensure the worker has created the pg-boss schema, or pass hasActiveJob.`,
    );
  }
}

/**
 * Finds `running` scans older than 24h with no active job, sets terminal status, merges estimate stall metadata,
 * sets `pausedReason` to `stalled` when applicable, and appends audit rows.
 */
export async function reconcileStalledScans(db: Db, opts: ReconcileStalledScansOptions = {}): Promise<ReconcileStalledScanResult[]> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - STALL_AFTER_MS);
  const stale = await db
    .select({
      id: scans.id,
      status: scans.status,
      campaignId: scans.campaignId,
      estimate: scans.estimate,
    })
    .from(scans)
    .where(and(eq(scans.status, "running"), lt(scans.createdAt, cutoff)));

  const out: ReconcileStalledScanResult[] = [];
  const hasActiveJobFn = opts.hasActiveJob ?? ((id: string) => defaultHasActiveJob(db, id));

  for (const row of stale) {
    if (await hasActiveJobFn(row.id)) continue;

    const drawRows = await db
      .select({ status: draws.status })
      .from(draws)
      .where(eq(draws.scanId, row.id));
    const hadOkDraws = drawRows.some((d) => d.status === "ok");

    let nextStatus: "partial" | "complete";
    if (!drawRows.length) {
      nextStatus = "complete";
    } else if (hadOkDraws) {
      nextStatus = "partial";
    } else {
      const terminal = new Set(["ok", "empty", "error", "blocked"]);
      const allTerminal = drawRows.every((d) => terminal.has(d.status));
      nextStatus = allTerminal ? "complete" : "partial";
    }

    const stalledAt = now.toISOString();
    const prevEstimate =
      row.estimate && typeof row.estimate === "object" && !Array.isArray(row.estimate)
        ? (row.estimate as Record<string, unknown>)
        : {};
    const mergedEstimate = { ...prevEstimate, stalled: true, stalledAt };

    const updatePayload = {
      status: nextStatus as ScanStatus,
      estimate: mergedEstimate,
      pausedReason: "stalled" as const,
      pausedAt: now,
    };

    await db.transaction(async (tx) => {
      const t = tx as unknown as Db;
      await t
        .update(scans)
        .set(updatePayload)
        .where(and(eq(scans.id, row.id), eq(scans.status, "running")));

      const [orgRow] = await t.select({ orgId: campaigns.orgId }).from(campaigns).where(eq(campaigns.id, row.campaignId));

      await t.insert(auditLog).values({
        orgId: orgRow?.orgId ?? null,
        userId: null,
        action: "scan.stalled_reconciled",
        entityType: "scan",
        entityId: row.id,
        before: { status: row.status, estimate: row.estimate ?? null },
        after: { status: nextStatus, estimate: mergedEstimate, pausedReason: "stalled" },
        at: now,
      });
    });

    out.push({
      scanId: row.id,
      previousStatus: row.status,
      nextStatus,
      hadOkDraws,
    });
  }

  return out;
}
