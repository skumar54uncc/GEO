import { beforeEach, describe, expect, it } from "vitest";
import { displayIntentFromStored, listOverviewQuestions } from "@/lib/overview/questions";
import { prompts } from "@/lib/db/pg/schema";
import { eq } from "drizzle-orm";
import { resetDatabase } from "../helpers";
import { addDraw, newScan, seed } from "../metrics/dbFixtures";

describe("Overview question intent (no fabrication)", () => {
  it("displayIntentFromStored never invents an intent from position", () => {
    expect(displayIntentFromStored(null)).toBe("untagged");
    expect(displayIntentFromStored(undefined)).toBe("untagged");
    expect(displayIntentFromStored("")).toBe("untagged");
    expect(displayIntentFromStored("comparison")).toBe("comparison");
    expect(displayIntentFromStored("discovery")).toBe("discovery");
    expect(displayIntentFromStored("not_a_real_intent")).toBe("untagged");
  });

  beforeEach(resetDatabase);

  it("fails if any displayed intent differs from stored prompts.intent", async () => {
    const c = await seed(4);
    await c.db.update(prompts).set({ intent: "discovery" }).where(eq(prompts.id, c.promptIds[0]));
    await c.db.update(prompts).set({ intent: "comparison" }).where(eq(prompts.id, c.promptIds[1]));
    await c.db.update(prompts).set({ intent: "evaluation" }).where(eq(prompts.id, c.promptIds[2]));
    // promptIds[3] left null → untagged
    const scan = await newScan(c);
    for (const p of c.promptIds) await addDraw(c, scan, p, { brand: true });

    const allStored = new Map(
      (
        await c.db.select({ id: prompts.id, intent: prompts.intent }).from(prompts)
      )
        .filter((r) => c.promptIds.includes(r.id))
        .map((r) => [r.id, r.intent]),
    );

    const { rows } = await listOverviewQuestions(c.db, {
      orgId: c.orgId,
      scanId: scan,
      includeBranded: true,
      tab: "all",
      limit: 50,
    });
    expect(rows.length).toBe(4);
    for (const row of rows) {
      const expected = displayIntentFromStored(allStored.get(row.promptId) ?? null);
      expect(row.intent, `prompt ${row.promptId}`).toBe(expected);
      // Never cycle by list position: null storage must be untagged, not discovery/comparison/…
      if (allStored.get(row.promptId) == null) expect(row.intent).toBe("untagged");
    }
    expect(rows.find((r) => r.promptId === c.promptIds[0])?.intent).toBe("discovery");
    expect(rows.find((r) => r.promptId === c.promptIds[3])?.intent).toBe("untagged");
  });
});
