import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { DEMO_DATA_BANNER, DEMO_ORG_NAME } from "@/lib/contracts/exports";
import type { DemandRunResult, DemandSource } from "@/lib/demand/types";
import { getDb } from "@/lib/db/pg/client";
import { auditLog, organizations, providerAccounts, strategyReports } from "@/lib/db/pg/schema";
import {
  buildStrategyExportMetadata,
  editStrategyItemFactors,
  estimateLandscapeSample,
  exportStrategyPlanCsv,
  runLandscapeSample,
  runStrategyPipeline,
  sha256Hex,
} from "@/lib/strategy";
import { DEMAND_UNKNOWN_LABEL } from "@/lib/strategy/score";
import { addDraw, newScan, seed } from "../metrics/dbFixtures";
import { cookieFor, resetDatabase, userIdFor } from "../helpers";

const EVIDENCE_ID = "b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2";

function connected(source: DemandSource, volume = 500): DemandRunResult {
  return {
    connected: true,
    status: "ok",
    source,
    mode: "fixture_only",
    paramsHash: "abc",
    signals: [
      {
        term: "energy storage graduate",
        value: { query: "energy storage phd", volume, rising: true },
        source,
      },
    ],
  };
}

function notConnected(source: DemandSource): DemandRunResult {
  return {
    connected: false,
    status: "not_connected",
    source,
    missing: [`${source}_key`],
    mode: "fixture_only",
    signals: [],
  };
}

describe("Phase 8 strategy pipeline e2e", () => {
  beforeEach(resetDatabase);

  it("runs demand→landscape→supply→gaps→plan; same inputs hash to the same report", async () => {
    const c = await seed(3);
    const scanId = await newScan(c);
    await addDraw(c, scanId, c.promptIds[0], {
      brand: false,
      citation: { domain: "usnews.com", sourceClass: "other" },
    });

    const collectDemand = async (source: DemandSource) => {
      if (source === "google_trends" || source === "search_console" || source === "keyword_volume") {
        return connected(source, 800);
      }
      return connected(source, 10);
    };

    const fixture = {
      topic: "energy storage",
      campaignId: c.campaignId,
      orgId: c.orgId,
      persona: "doctoral_applicant" as const,
      leverType: "on_page" as const,
      evidenceGrade: "C" as const,
      promptCluster: "energy storage PhD programs",
      format: "research FAQ capsule",
      faqs: ["What energy storage labs exist?"],
      effort: { value: 0.6, source: "editor_estimate", n: 1 },
      collectDemand,
      gap: {
        leverType: "on_page" as const,
        gapSize: 0.8,
        n: 20,
        evidenceIds: [EVIDENCE_ID],
        termLifts: [{ term: "Carolinas Grid Engine", logOddsLift: 1.1 }],
        closestOwnedPage: { crawlPageId: null, noMatchingPage: true },
      },
      citations: [
        {
          domain: "usnews.com",
          sourceClass: "ranking",
          url: "https://usnews.com/best-energy",
          citesUs: false,
          citesPeer: true,
        },
      ],
      fromDate: "2026-09-01",
      now: new Date("2026-09-01T12:00:00.000Z"),
    };

    const first = await runStrategyPipeline(c.db, fixture);
    const second = await runStrategyPipeline(c.db, fixture);

    expect(first.report.inputs.inputsHash).toBe(second.report.inputs.inputsHash);
    expect(first.report.id).toBe(second.report.id);
    expect(first.report.output).toEqual(second.report.output);
    expect(first.report.inputs.inputsHash).toHaveLength(64);
    expect(sha256Hex({
      topic: first.report.inputs.topic,
      campaignId: first.report.inputs.campaignId,
      demand: first.report.inputs.demand,
      landscape: first.report.inputs.landscape,
      supply: first.report.inputs.supply,
      gaps: first.report.inputs.gaps,
      calendar: first.report.inputs.calendar,
    })).toBe(first.report.inputs.inputsHash);
    expect(first.report.output.pipeline).toEqual(["demand", "landscape", "supply", "gaps", "plan"]);
    expect(first.report.output.scoredItems).toHaveLength(1);
    expect(first.report.output.unscoredItems).toHaveLength(0);
    expect(first.report.output.scoredItems[0].leverType).toBe("on_page");
    expect(first.report.output.scoredItems[0].owner).toBe("Content team");
    expect(first.report.output.scoredItems[0].evidenceIds).toContain(EVIDENCE_ID);
    expect(first.report.output.scoredItems[0].publishBy).toBe("2026-10-01"); // FAFSA opens
    expect(first.report.output.offsite[0]?.domain).toBe("usnews.com");
    expect(first.landscape).toMatchObject({ mode: "reuse_existing", scanId });

    const rows = await c.db.select().from(strategyReports).where(eq(strategyReports.campaignId, c.campaignId));
    expect(rows).toHaveLength(1);
  });

  it("keeps demand-unknown items unscored, not silently zeroed", async () => {
    const c = await seed(2);
    await newScan(c);

    const result = await runStrategyPipeline(c.db, {
      topic: "quantum sensing",
      campaignId: c.campaignId,
      orgId: c.orgId,
      persona: "research_partner",
      leverType: "earned_media",
      evidenceGrade: "C",
      promptCluster: "quantum sensing partners",
      format: "media pitch",
      effort: { value: 0.4, source: "editor_estimate", n: 1 },
      collectDemand: async (source) =>
        source === "google_trends" ? notConnected(source) : connected(source),
      gap: {
        leverType: "earned_media",
        gapSize: 0.9,
        n: 12,
        evidenceIds: [EVIDENCE_ID],
      },
      fromDate: "2026-09-01",
      now: new Date("2026-09-01T12:00:00.000Z"),
    });

    expect(result.demand.demandKnown).toBe(false);
    expect(result.report.output.scoredItems).toHaveLength(0);
    expect(result.report.output.unscoredItems).toHaveLength(1);
    expect(result.report.output.unscoredItems[0].score).toBeNull();
    expect(result.report.output.unscoredItems[0].scoreStatus).toBe("demand_unknown");
    expect(result.report.output.unscoredItems[0].factors.demand.value).toBeNull();
  });

  it("requires estimate → approval → cost guard for a new landscape sample (fixtures only)", async () => {
    const c = await seed(1);
    await c.db.insert(providerAccounts).values({
      orgId: c.orgId,
      provider: "strategy_landscape_sample",
      perRunCapUnits: 5,
      creditsRemaining: 5,
      creditUnitUsd: null,
    });
    const estimate = estimateLandscapeSample({
      campaignId: c.campaignId,
      topic: "energy storage",
      promptCount: 3,
    });
    await expect(
      runLandscapeSample(c.db, {
        orgId: c.orgId,
        estimate,
        approval: {
          paramsHash: "wrong",
          units: estimate.units,
          priceUsd: null,
          acknowledgedUnknownPrice: true,
        },
        fixture: {
          mode: "fixture_sample",
          scanId: "00000000-0000-4000-8000-000000000001",
          paramsHash: estimate.paramsHash,
          ownersByEngine: [],
        },
      }),
    ).rejects.toThrow(/paramsHash/);

    const ok = await runLandscapeSample(c.db, {
      orgId: c.orgId,
      estimate,
      approval: {
        paramsHash: estimate.paramsHash,
        units: estimate.units,
        priceUsd: null,
        acknowledgedUnknownPrice: true,
      },
      fixture: {
        mode: "fixture_sample",
        scanId: "00000000-0000-4000-8000-000000000001",
        paramsHash: estimate.paramsHash,
        ownersByEngine: [{ engine: "chatgpt", runner: "ui_provider", mentionedBrand: false, n: 3 }],
      },
    });
    expect(ok.mode).toBe("fixture_sample");
  });

  it("audits score edits and keeps the original score", async () => {
    const c = await seed(2);
    await newScan(c);
    await cookieFor("strategy-editor@example.test", "editor");
    const userId = await userIdFor("strategy-editor@example.test");
    const { report } = await runStrategyPipeline(c.db, {
      topic: "energy storage",
      campaignId: c.campaignId,
      orgId: c.orgId,
      createdBy: userId,
      persona: "business_partner",
      leverType: "listing",
      evidenceGrade: "B",
      promptCluster: "energy industry partners",
      format: "directory claim checklist",
      effort: { value: 0.5, source: "editor_estimate", n: 1 },
      collectDemand: async (source) => connected(source, 400),
      gap: { leverType: "listing", gapSize: 0.7, n: 15, evidenceIds: [EVIDENCE_ID] },
      fromDate: "2026-09-01",
      now: new Date("2026-09-01T12:00:00.000Z"),
    });
    const item = report.output.scoredItems[0];
    const originalScore = item.originalScore;
    expect(originalScore).not.toBeNull();

    const edited = await editStrategyItemFactors(c.db, {
      user: { userId, email: "strategy-editor@example.test", name: null, orgId: c.orgId, role: "editor" },
      reportId: report.id,
      itemId: item.id,
      factors: {
        ...item.factors,
        effort: { value: 0.9, source: "editor_override", n: 1, note: "lower lift needed" },
      },
    });
    const after = edited.output.scoredItems.find((i) => i.id === item.id)!;
    expect(after.originalScore).toBe(originalScore);
    expect(after.score).not.toBe(originalScore);
    expect(after.factors.effort.source).toBe("editor_override");

    const audits = await c.db.select().from(auditLog).where(eq(auditLog.action, "strategy_report.edit_score"));
    expect(audits).toHaveLength(1);
  });

  it("exports CSV with DEMO DATA banner for the demo org", async () => {
    const c = await seed(2);
    await newScan(c);
    await c.db.update(organizations).set({ name: DEMO_ORG_NAME, isDemo: true }).where(eq(organizations.id, c.orgId));

    const { report } = await runStrategyPipeline(c.db, {
      topic: "energy storage",
      campaignId: c.campaignId,
      orgId: c.orgId,
      persona: "doctoral_applicant",
      leverType: "on_page",
      evidenceGrade: "C",
      promptCluster: "energy storage PhD",
      format: "FAQ",
      effort: { value: 0.5, source: "e", n: 1 },
      collectDemand: async (source) =>
        source === "search_console" ? notConnected(source) : connected(source),
      gap: { leverType: "on_page", gapSize: 0.5, n: 10, evidenceIds: [EVIDENCE_ID] },
      fromDate: "2026-09-01",
      now: new Date("2026-09-01T12:00:00.000Z"),
    });

    const meta = buildStrategyExportMetadata({
      organizationId: c.orgId,
      organizationName: DEMO_ORG_NAME,
      isDemo: true,
      generatedAt: "2026-09-01T12:00:00.000Z",
    });
    const { csv } = exportStrategyPlanCsv(report, meta);
    expect(csv.startsWith(DEMO_DATA_BANNER)).toBe(true);
    expect(csv).toContain(DEMAND_UNKNOWN_LABEL);
    expect(csv).toContain("offsite_domain");
  });
});
