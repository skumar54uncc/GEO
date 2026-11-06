import { describe, expect, it } from "vitest";
import { DEMO_SEED_MARKER } from "@/lib/contracts/demoSeed";
import { assertZeroDemoSeedRows, countDemoSeedRowsForOrg } from "@/lib/demo/isolation";
import { seedMarkedDemoOrg } from "@/lib/demo/seedMarked";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { addDraw, newScan, seed } from "../metrics/dbFixtures";
import { resetDatabase } from "../helpers";

describe("demo isolation — row-level seed markers", () => {
  it("marks demo seed rows and proves UNC Charlotte has zero of them", async () => {
    await resetDatabase();
    const db = getDb();

    // Real-shaped UNC Charlotte data stays unmarked.
    const unc = await seed(2);
    const uncScan = await newScan(unc);
    await addDraw(unc, uncScan, unc.promptIds[0], { brand: true });
    await addDraw(unc, uncScan, unc.promptIds[1], {
      brand: false,
      citation: { domain: "charlotte.edu", sourceClass: "owned" },
    });

    const demo = await seedMarkedDemoOrg(db);
    expect(demo.orgId).not.toBe(unc.orgId);

    const demoCounts = await countDemoSeedRowsForOrg(db, demo.orgId);
    expect(demoCounts.draws).toBeGreaterThan(0);
    expect(demoCounts.rawPayloads).toBeGreaterThan(0);
    expect(demoCounts.citations).toBeGreaterThan(0);
    expect(demoCounts.judgeRuns).toBeGreaterThan(0);
    expect(demoCounts.recommendations).toBeGreaterThan(0);
    expect(demoCounts.strategyReports).toBeGreaterThan(0);
    expect(demoCounts.costLedger).toBeGreaterThan(0);

    const charlotte = await legacyContext(db);
    expect(charlotte.orgId).toBe(unc.orgId);
    const uncCounts = await countDemoSeedRowsForOrg(db, charlotte.orgId);
    expect(uncCounts).toEqual({
      draws: 0,
      rawPayloads: 0,
      citations: 0,
      judgeRuns: 0,
      recommendations: 0,
      strategyReports: 0,
      costLedger: 0,
    });
    assertZeroDemoSeedRows(uncCounts, "UNC Charlotte");
  });

  it("fails loudly if a demo-marked draw is planted under UNC Charlotte", async () => {
    await resetDatabase();
    const unc = await seed(1);
    const scanId = await newScan(unc);
    await addDraw(unc, scanId, unc.promptIds[0], { brand: true, seedMarker: DEMO_SEED_MARKER });

    const counts = await countDemoSeedRowsForOrg(getDb(), unc.orgId);
    expect(counts.draws).toBe(1);
    expect(() => assertZeroDemoSeedRows(counts, "UNC Charlotte")).toThrow(/demo seed rows/);
  });
});
