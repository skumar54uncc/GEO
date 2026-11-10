import { beforeEach, describe, expect, it } from "vitest";
import {
  DATAFORSEO_LOCATION_CODES,
  dataForSeoLocationCode,
  ensureCatalogRegions,
  REGION_CATALOG,
  REGION_NOT_SUPPORTED_LABEL,
  regionLocationSupport,
} from "@/lib/capture/regions";
import { computeScanEstimate } from "@/lib/capture/batch";
import type { MetricDraw } from "@/lib/metrics/load";
import {
  assertNoHonoredNoInEligible,
  eligibleRegionDraws,
  regionComparisonCells,
} from "@/lib/metrics/regionComparison";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { resetDatabase } from "../helpers";

describe("P2 B3 regions location_code map", () => {
  it("pins US / North Carolina / Charlotte DataForSEO codes from the locations endpoint", () => {
    expect(DATAFORSEO_LOCATION_CODES.us_national).toBe(2840);
    expect(DATAFORSEO_LOCATION_CODES.nc_statewide).toBe(21160);
    expect(DATAFORSEO_LOCATION_CODES.charlotte_metro).toBe(1021048);
    const byKey = Object.fromEntries(REGION_CATALOG.map((e) => [e.key, e.locationCode]));
    expect(byKey.us_national).toBe(2840);
    expect(byKey.nc_statewide).toBe(21160);
    expect(byKey.charlotte_metro).toBe(1021048);
  });

  it("resolves location_code from serp_location / label", async () => {
    await resetDatabase();
    const db = getDb();
    const seeded = await ensureCatalogRegions(db);
    const charlotte = seeded.find((r) => r.city === "Charlotte");
    const us = seeded.find((r) => r.label === "United States");
    const nc = seeded.find((r) => r.state === "North Carolina" && !r.city);
    expect(dataForSeoLocationCode(charlotte!)).toBe(1021048);
    expect(dataForSeoLocationCode(us!)).toBe(2840);
    expect(dataForSeoLocationCode(nc!)).toBe(21160);
  });
});

describe("P2 B3 estimate multiplies by region count", () => {
  beforeEach(resetDatabase);

  it("2 regions doubles draws and cost vs 1 region (same routes/prompts)", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    const catalog = await ensureCatalogRegions(db);
    const r1 = catalog.find((r) => r.city === "Charlotte")!;
    const r2 = catalog.find((r) => r.label === "United States")!;
    const routes = [{ engine: "google_aio" as const, runner: "serp_provider" as const, provider: "serpapi" as const }];
    const { prompts } = await import("@/lib/db/pg/schema");
    const [p] = await db
      .insert(prompts)
      .values({
        campaignId: ctx.campaignId,
        text: "B3 region estimate prompt",
        branded: false,
        status: "approved",
        provenance: "custom",
      })
      .returning({ id: prompts.id });

    const est1 = await computeScanEstimate(db, {
      orgId: ctx.orgId,
      spec: { promptIds: [p.id], routes, regionIds: [r1.id], draws: 3, canary: false },
    });
    const est2 = await computeScanEstimate(db, {
      orgId: ctx.orgId,
      spec: { promptIds: [p.id], routes, regionIds: [r1.id, r2.id], draws: 3, canary: false },
    });
    expect(est1.regionCount).toBe(1);
    expect(est2.regionCount).toBe(2);
    expect(est2.totalDraws).toBe(est1.totalDraws * 2);
    if (est1.totalUsd != null && est2.totalUsd != null) {
      expect(est2.totalUsd).toBeCloseTo(est1.totalUsd * 2, 6);
      expect(est2.usdPerRegion).toBeCloseTo(est1.totalUsd, 6);
    } else {
      expect(est2.usdPerRegion).toBeNull();
      expect(est1.usdPerRegion).toBeNull();
    }
  });
});

describe("P2 B3 region comparison honored rules", () => {
  function draw(partial: Partial<MetricDraw> & Pick<MetricDraw, "regionId" | "regionHonored" | "engine" | "runner">): MetricDraw {
    return {
      drawId: partial.drawId ?? crypto.randomUUID(),
      promptId: partial.promptId ?? "p1",
      engine: partial.engine,
      runner: partial.runner,
      provider: "serpapi",
      regionId: partial.regionId,
      regionHonored: partial.regionHonored,
      branded: false,
      personaId: null,
      intent: null,
      mentions: partial.mentions ?? [{ entityType: "brand", entityId: "b1", spanStart: 0, listPosition: null }],
      citations: [],
      claims: [],
    };
  }

  it("not-honored region never shows as honored; eligible drops no", () => {
    const regionId = "reg-a";
    const draws = [
      draw({ regionId, regionHonored: "yes", engine: "chatgpt", runner: "ui_provider", promptId: "p1" }),
      draw({ regionId, regionHonored: "no", engine: "chatgpt", runner: "ui_provider", promptId: "p2" }),
      draw({ regionId, regionHonored: "unknown", engine: "chatgpt", runner: "ui_provider", promptId: "p3" }),
    ];
    const kept = eligibleRegionDraws(draws);
    expect(kept.every((d) => d.regionHonored !== "no")).toBe(true);
    assertNoHonoredNoInEligible(draws);
    const cells = regionComparisonCells(draws, [{ id: regionId, label: "Charlotte" }]);
    const cell = cells.find((c) => c.engine === "chatgpt")!;
    expect(cell.honoredMix.no).toBe(1);
    expect(cell.honoredMix.yes).toBe(1);
    expect(cell.honoredMix.unknown).toBe(1);
  });

  it("engines that ignore location show region not supported instead of a number", () => {
    expect(regionLocationSupport("chatgpt", "api_parametric")).toBe("not_supported");
    expect(regionLocationSupport("chatgpt", "ui_provider")).toBe("supported");
    const regionId = "reg-b";
    const draws = [
      draw({
        regionId,
        regionHonored: "yes",
        engine: "chatgpt",
        runner: "api_parametric",
        promptId: "p1",
      }),
    ];
    const cells = regionComparisonCells(draws, [{ id: regionId, label: "US" }]);
    expect(cells[0]!.display).toBe(REGION_NOT_SUPPORTED_LABEL);
    expect(cells[0]!.promptsWon).toBeNull();
  });
});
