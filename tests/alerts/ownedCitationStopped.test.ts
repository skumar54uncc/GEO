import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { evaluateAlerts } from "@/lib/alerts/evaluate";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { fidelityFor } from "@/lib/capture/types";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { alerts, brandDomains, campaigns, citations, draws, prompts, scans } from "@/lib/db/pg/schema";
import { freezePromptSet } from "@/lib/promptSets";
import { resetDatabase } from "../helpers";

describe("owned_citation_stopped alert", () => {
  beforeEach(resetDatabase);

  it("fires per engine when an owned page disappears vs previous scan", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
    const [{ brandId }] = await db
      .select({ brandId: campaigns.brandId })
      .from(campaigns)
      .where(eq(campaigns.id, ctx.campaignId));
    const existingDom = await db
      .select({ id: brandDomains.id })
      .from(brandDomains)
      .where(eq(brandDomains.brandId, brandId))
      .limit(1);
    if (!existingDom.length) {
      await db.insert(brandDomains).values({ brandId, domain: "charlotte.edu" });
    }

    const [prompt] = await db
      .insert(prompts)
      .values({
        campaignId: ctx.campaignId,
        text: "best graduate programs in North Carolina",
        provenance: "custom",
        status: "approved",
        branded: false,
      })
      .returning();
    const { set } = await freezePromptSet(db, ctx.orgId, ctx.campaignId);

    const [prev] = await db
      .insert(scans)
      .values({
        campaignId: ctx.campaignId,
        promptSetId: set.id,
        name: "prev",
        status: "complete",
        kind: "scan",
        approvedAt: new Date("2026-10-01T00:00:00Z"),
        createdAt: new Date("2026-10-01T00:00:00Z"),
      })
      .returning();
    const [curr] = await db
      .insert(scans)
      .values({
        campaignId: ctx.campaignId,
        promptSetId: set.id,
        name: "curr",
        status: "complete",
        kind: "scan",
        approvedAt: new Date("2026-11-01T00:00:00Z"),
        createdAt: new Date("2026-11-01T00:00:00Z"),
      })
      .returning();

    const [dPrev] = await db
      .insert(draws)
      .values({
        scanId: prev.id,
        promptId: prompt.id,
        promptSetId: set.id,
        engine: "chatgpt",
        runner: "ui_provider",
        fidelity: fidelityFor("ui_provider"),
        provider: "dataforseo",
        regionId: region.id,
        drawIndex: 1,
        status: "ok",
        answerText: "fixture",
        capturedAt: new Date(),
      })
      .returning();
    await db.insert(citations).values({
      drawId: dPrev.id,
      url: "https://charlotte.edu/energy",
      canonicalUrl: "https://charlotte.edu/energy",
      domain: "charlotte.edu",
      sourceClass: "owned",
    });

    await db.insert(draws).values({
      scanId: curr.id,
      promptId: prompt.id,
      promptSetId: set.id,
      engine: "chatgpt",
      runner: "ui_provider",
      fidelity: fidelityFor("ui_provider"),
      provider: "dataforseo",
      regionId: region.id,
      drawIndex: 1,
      status: "ok",
      answerText: "fixture",
      capturedAt: new Date(),
    });

    const created = await evaluateAlerts(db, { orgId: ctx.orgId, scanId: curr.id });
    expect(created.some((c) => c.kind === "owned_citation_stopped")).toBe(true);
    const rows = await db.select().from(alerts).where(eq(alerts.kind, "owned_citation_stopped"));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(String((rows[0]!.payload as { message?: string }).message)).toMatch(/stopped citing/i);
  }, 90_000);
});
