import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { STALL_AFTER_MS, isScanStalled, reconcileStalledScans } from "@/lib/scans/stalled";
import { getDb } from "@/lib/db/pg/client";
import { auditLog, scans } from "@/lib/db/pg/schema";
import { resetDatabase } from "../helpers";
import { addDraw, newScan, seed } from "../metrics/dbFixtures";

describe("stalled scans helper", () => {
  it("isScanStalled is true only for old running scans without a job", () => {
    const now = new Date("2026-11-06T12:00:00Z");
    const old = new Date(now.getTime() - STALL_AFTER_MS - 1);
    expect(
      isScanStalled({
        status: "running",
        createdAt: old,
        now,
        hasActiveJob: false,
      }),
    ).toBe(true);
    expect(
      isScanStalled({
        status: "running",
        createdAt: old,
        now,
        hasActiveJob: true,
      }),
    ).toBe(false);
    expect(
      isScanStalled({
        status: "complete",
        createdAt: old,
        now,
        hasActiveJob: false,
      }),
    ).toBe(false);
  });

  it("reconcileStalledScans transitions a stale running scan with ok draws to partial", async () => {
    await resetDatabase();
    const db = getDb();
    const ctx = await seed(1);
    const staleAt = new Date(Date.now() - STALL_AFTER_MS - 60_000);
    const scanId = await newScan(ctx, ctx.promptSetId, "running", staleAt);
    await addDraw(ctx, scanId, ctx.promptIds[0]!, { status: "ok", brand: true });

    const results = await reconcileStalledScans(db, {
      now: new Date(),
      hasActiveJob: async () => false,
    });
    expect(results.some((r) => r.scanId === scanId)).toBe(true);

    const [row] = await db.select().from(scans).where(eq(scans.id, scanId));
    expect(row?.status).toBe("partial");
    expect(row?.pausedReason).toBe("stalled");
    const est = row?.estimate as Record<string, unknown> | null;
    expect(est?.stalled).toBe(true);
    expect(typeof est?.stalledAt).toBe("string");

    const [log] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, scanId));
    expect(log?.action).toBe("scan.stalled_reconciled");
    expect((log?.after as { status?: string })?.status).toBe("partial");
  });
});
