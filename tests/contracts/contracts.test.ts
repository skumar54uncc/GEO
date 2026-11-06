import { describe, expect, it } from "vitest";
import {
  CANONICAL_PERSONA_KEYS,
  CORRELATION_LABEL,
  DEMO_DATA_BANNER,
  DEMO_ORG_NAME,
  GAP_LEVER_TYPES,
  LEGACY_PERSONA_MIGRATION,
  citedFetchPolicySchema,
  citedPageExportSchema,
  evaluateStopLoss,
  exportMetadataSchema,
  gapAnalysisSchema,
  measurementMetadataSchema,
  stopLossStateSchema,
  strategyItemSchema,
} from "@/lib/contracts";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const now = "2026-11-06T12:00:00.000Z";

describe("export contracts", () => {
  it("requires the exact demo banner on PDF and CSV exports", () => {
    const base = {
      dataKind: "demo",
      organizationId: id(1),
      organizationName: DEMO_ORG_NAME,
      generatedAt: now,
    };

    for (const format of ["pdf", "csv"] as const) {
      expect(exportMetadataSchema.safeParse({ ...base, format }).success).toBe(false);
      expect(
        exportMetadataSchema.safeParse({ ...base, format, banner: "Demo data" }).success,
      ).toBe(false);
      expect(
        exportMetadataSchema.safeParse({ ...base, format, banner: DEMO_DATA_BANNER }).success,
      ).toBe(true);
    }
  });
});

describe("measurement metadata", () => {
  const valid = {
    n: 30,
    interval95: { level: 0.95, low: 0.2, high: 0.5 },
    engine: "chatgpt",
    runner: "api_search",
    fidelity: "medium",
    measuredAt: now,
  };

  it("rejects missing dimensions and pooled series", () => {
    const { runner: _runner, ...missingRunner } = valid;
    expect(measurementMetadataSchema.safeParse(missingRunner).success).toBe(false);
    expect(
      measurementMetadataSchema.safeParse({
        ...valid,
        engine: ["chatgpt", "gemini"],
      }).success,
    ).toBe(false);
    expect(
      measurementMetadataSchema.safeParse({
        ...valid,
        runner: ["api_search", "ui_provider"],
      }).success,
    ).toBe(false);
  });
});

describe("cited page contracts", () => {
  it("requires an identifying project/contact User-Agent and fetch protections", () => {
    const policy = {
      projectName: "University GEO research",
      contactUrl: "https://example.edu/geo-contact",
      userAgent: "University GEO research/1.0 (+https://example.edu/geo-contact)",
      respectRobotsTxt: true,
      blockPrivateAddressesAfterDns: true,
      followRedirectsWithSsrfChecks: true,
      maxRedirects: 5,
      maxBodyBytes: 2_000_000,
      perHostDelayMs: 1_000,
    };

    expect(citedFetchPolicySchema.safeParse(policy).success).toBe(true);
    expect(
      citedFetchPolicySchema.safeParse({ ...policy, userAgent: "Mozilla/5.0" }).success,
    ).toBe(false);
    expect(
      citedFetchPolicySchema.safeParse({ ...policy, respectRobotsTxt: false }).success,
    ).toBe(false);
  });

  it("exports textRef but rejects full third-party text", () => {
    const page = {
      canonicalUrl: "https://example.org/article",
      fetchedAt: now,
      statusCode: 200,
      title: "Article",
      h1: "Article",
      h2s: ["Evidence"],
      publishedAt: null,
      updatedAt: null,
      wordCount: 500,
      schemaTypes: ["Article"],
      contentType: "news",
      textRef: "data/raw/abc123",
    };

    expect(citedPageExportSchema.safeParse(page).success).toBe(true);
    expect(citedPageExportSchema.safeParse({ ...page, fullText: "copied article" }).success).toBe(
      false,
    );
    const { textRef: _textRef, ...missingRef } = page;
    expect(citedPageExportSchema.safeParse(missingRef).success).toBe(false);
  });
});

describe("persona contracts", () => {
  it("defines 22 canonical personas and maps business_leader to business_partner", () => {
    expect(CANONICAL_PERSONA_KEYS).toHaveLength(22);
    expect(new Set(CANONICAL_PERSONA_KEYS).size).toBe(22);
    expect(
      Object.fromEntries(
        LEGACY_PERSONA_MIGRATION.map(({ legacyKey, canonicalKey }) => [legacyKey, canonicalKey]),
      ),
    ).toEqual({
      undergrad: "undergrad",
      grad: "grad",
      research_partner: "research_partner",
      business_partner: "business_partner",
      business_leader: "business_partner",
    });
    expect(LEGACY_PERSONA_MIGRATION.every((row) => row.idDecision === "preserve_existing_id")).toBe(true);
  });
});

describe("gap and strategy contracts", () => {
  const citedPageIds = Array.from({ length: 10 }, (_, index) => id(index + 100));
  const validGap = {
    campaignId: id(2),
    leverType: "on_page",
    label: CORRELATION_LABEL,
    cohorts: {
      won: { citedPageIds },
      lost: { citedPageIds: Array.from({ length: 10 }, (_, index) => id(index + 200)) },
    },
    termLifts: [
      {
        term: "faculty expert",
        won: { matches: 7, n: 10 },
        lost: { matches: 2, n: 10 },
      },
    ],
    evidenceIds: [id(3)],
  };

  it("locks all seven levers, cohort sizes, per-term n, and correlation label", () => {
    expect(GAP_LEVER_TYPES).toHaveLength(7);
    expect(gapAnalysisSchema.safeParse(validGap).success).toBe(true);
    expect(
      gapAnalysisSchema.safeParse({
        ...validGap,
        cohorts: { ...validGap.cohorts, lost: { citedPageIds: citedPageIds.slice(0, 9) } },
      }).success,
    ).toBe(false);
    expect(
      gapAnalysisSchema.safeParse({
        ...validGap,
        termLifts: [
          { term: "faculty expert", won: { matches: 6, n: 9 }, lost: { matches: 2, n: 10 } },
        ],
      }).success,
    ).toBe(false);
    expect(gapAnalysisSchema.safeParse({ ...validGap, label: "caused lift" }).success).toBe(false);
  });

  it("requires evidence IDs, lever, score factors; demand unknown cannot carry a numeric score", () => {
    const factors = {
      demand: { value: 0.8, source: "google_trends+search_console+keyword_volume", n: 12 },
      gapSize: { value: 0.7, source: "gap+supply", n: 20 },
      effort: { value: 0.5, source: "editor", n: 1 },
    };
    const item = {
      id: id(4),
      topic: "energy storage",
      persona: "grad" as const,
      promptCluster: "energy graduate programs",
      format: "program guide",
      headlineTerms: ["power systems"],
      faqs: [],
      targetUrl: null,
      thirdPartySources: [],
      owner: "Content team",
      publishBy: "2027-01-15",
      seasonalEventId: id(5),
      leverType: "on_page" as const,
      evidenceGrade: "C" as const,
      score: 0.8 * 0.7 * 0.5,
      scoreStatus: "scored" as const,
      factors,
      originalFactors: factors,
      originalScore: 0.8 * 0.7 * 0.5,
      evidenceIds: [id(6)],
    };
    expect(strategyItemSchema.safeParse(item).success).toBe(true);
    expect(strategyItemSchema.safeParse({ ...item, evidenceIds: [] }).success).toBe(false);
    expect(
      strategyItemSchema.safeParse({
        ...item,
        scoreStatus: "demand_unknown",
        score: 0.1,
        factors: { ...factors, demand: { value: null, source: "google_trends", n: 0 } },
        originalFactors: { ...factors, demand: { value: null, source: "google_trends", n: 0 } },
        originalScore: null,
      }).success,
    ).toBe(false);
  });
});

describe("stop-loss contracts", () => {
  it("uses strict greater-than thresholds for first-60 failures and cost", () => {
    const atErrorBoundary = evaluateStopLoss({
      firstWindowObserved: 60,
      firstWindowErrorsOrBlocked: 12,
      estimatedCostUsd: 100,
      actualCostUsd: 125,
    });
    expect(atErrorBoundary).toMatchObject({ paused: false, triggers: [] });
    expect(stopLossStateSchema.safeParse(atErrorBoundary).success).toBe(true);

    const aboveErrorBoundary = evaluateStopLoss({
      firstWindowObserved: 60,
      firstWindowErrorsOrBlocked: 13,
      estimatedCostUsd: 100,
      actualCostUsd: 125,
    });
    expect(aboveErrorBoundary.triggers).toContain("first_60_error_or_blocked_rate");

    const aboveCostBoundary = evaluateStopLoss({
      firstWindowObserved: 10,
      firstWindowErrorsOrBlocked: 10,
      estimatedCostUsd: 100,
      actualCostUsd: 125.01,
    });
    expect(aboveCostBoundary.triggers).toEqual(["estimate_cost_overrun"]);
  });

  it("rejects state that claims the wrong pause decision", () => {
    expect(
      stopLossStateSchema.safeParse({
        firstWindowObserved: 60,
        firstWindowErrorsOrBlocked: 13,
        estimatedCostUsd: 100,
        actualCostUsd: 100,
        paused: false,
        triggers: [],
      }).success,
    ).toBe(false);
  });
});
