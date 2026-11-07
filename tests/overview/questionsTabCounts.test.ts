import { inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { listOverviewQuestions } from "@/lib/overview/questions";
import { prompts } from "@/lib/db/pg/schema";
import { resetDatabase } from "../helpers";
import { addDraw, newScan, seed } from "../metrics/dbFixtures";

describe("listOverviewQuestions tabCounts and hiddenBrandedCount", () => {
  beforeEach(resetDatabase);

  it("counts tabs after branded filter and reports hidden branded count", async () => {
    const c = await seed(5);
    await c.db.update(prompts).set({ branded: true }).where(inArray(prompts.id, c.promptIds.slice(0, 2)));
    const scan = await newScan(c);
    for (const p of c.promptIds) {
      await addDraw(c, scan, p, { brand: true });
    }
    const r = await listOverviewQuestions(c.db, {
      orgId: c.orgId,
      scanId: scan,
      includeBranded: false,
      tab: "all",
      enginesTotal: 6,
    });
    expect(r.hiddenBrandedCount).toBe(2);
    expect(r.tabCounts.all).toBe(3);
    expect(r.tabCounts.won + r.tabCounts.lost).toBe(3);
    expect(r.total).toBe(3);

    const withBranded = await listOverviewQuestions(c.db, {
      orgId: c.orgId,
      scanId: scan,
      includeBranded: true,
      tab: "all",
      enginesTotal: 6,
    });
    expect(withBranded.hiddenBrandedCount).toBe(0);
    expect(withBranded.tabCounts.all).toBe(5);
  });
});
