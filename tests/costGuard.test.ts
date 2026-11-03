import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { chargeUnits, checkBudget, recordCall, unitsToUsd } from "@/lib/cost/guard";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { costLedger, providerAccounts } from "@/lib/db/pg/schema";
import { getStore } from "@/lib/db";
import { estimateAioBatch } from "@/lib/serpapi";
import { resetDatabase } from "./helpers";

describe("cost guard", () => {
  beforeEach(resetDatabase);

  it("refuses an unknown provider, over the per-run cap, and over the balance", async () => {
    const db = getDb();
    const { orgId } = await legacyContext(db);
    expect((await checkBudget(db, orgId, "nobody", { units: 1 })).allowed).toBe(false);
    await db
      .update(providerAccounts)
      .set({ creditsRemaining: 5, perRunCapUnits: 10 })
      .where(and(eq(providerAccounts.orgId, orgId), eq(providerAccounts.provider, "serpapi")));
    expect((await checkBudget(db, orgId, "serpapi", { units: 4 })).allowed).toBe(true);
    expect((await checkBudget(db, orgId, "serpapi", { units: 11 })).reason).toMatch(/per-run cap/);
    expect((await checkBudget(db, orgId, "serpapi", { units: 8, uncachedUnits: 6 })).reason).toMatch(/remaining balance/);
  });

  it("refuses over the monthly USD budget when the unit price is known", async () => {
    const db = getDb();
    const { orgId } = await legacyContext(db);
    await db
      .update(providerAccounts)
      .set({ creditUnitUsd: "0.015", monthlyBudgetUsd: "1", spentUsdMonth: "0.99", creditsRemaining: 1000, perRunCapUnits: 100 })
      .where(eq(providerAccounts.orgId, orgId));
    expect((await checkBudget(db, orgId, "serpapi", { units: 2 })).reason).toMatch(/monthly budget/);
  });

  it("records every call in cost_ledger, with USD null when the price is unknown", async () => {
    const db = getDb();
    const { orgId } = await legacyContext(db);
    await recordCall(db, { orgId, provider: "serpapi", units: 1, ok: true, engine: "google", paramsHash: "h" });
    const [row] = await db.select().from(costLedger);
    expect(row.units).toBe("1");
    expect(row.usd).toBeNull();
    expect(unitsToUsd(3, "0.5")).toBe(1.5);
    expect(unitsToUsd(3, null)).toBeNull();
  });

  it("decrements credits atomically and the legacy store reads them back", async () => {
    const db = getDb();
    const { orgId } = await legacyContext(db);
    const start = (await getStore().getConfig()).serpapi_credits_remaining;
    await Promise.all([chargeUnits(db, orgId, "serpapi", 1), chargeUnits(db, orgId, "serpapi", 1)]);
    expect((await getStore().getConfig()).serpapi_credits_remaining).toBe(start - 2);
  });

  it("the SerpAPI estimate still refuses over the per-run cap", async () => {
    const store = getStore();
    await store.saveConfig({ serpapi_per_run_cap: 2 });
    const a = await store.createPrompt({ text: "q one", audience: "grad", subtopics: [] });
    const b = await store.createPrompt({ text: "q two", audience: "grad", subtopics: [] });
    const est = await estimateAioBatch([a.id, b.id]);
    expect(est.estimated_calls).toBe(4);
    expect(est.allowed).toBe(false);
    expect(est.refusal_reason).toMatch(/per-run cap/);
  });
});
