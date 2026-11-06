import crypto from "crypto";
import type { Db } from "@/lib/db/pg/client";
import { checkBudget } from "@/lib/cost/guard";

export const CONTENT_ANALYSIS_PROVIDER = "content_analysis";

export type ContentAnalysisRequest = {
  campaignId: string;
  entityNames: string[];
  startDate: string;
  endDate: string;
};

export type ContentAnalysisFixture = {
  mentions: Array<{
    entityName: string;
    url: string;
    title: string | null;
    publishedAt: string | null;
    sentiment: "positive" | "neutral" | "negative" | "mixed" | "unknown";
  }>;
};

export type ContentAnalysisEstimate = {
  provider: typeof CONTENT_ANALYSIS_PROVIDER;
  mode: "fixture_only";
  capability: "unknown";
  priceUsd: null;
  units: number;
  paramsHash: string;
  available: true;
};

export type ContentAnalysisApproval = {
  paramsHash: string;
  units: number;
  priceUsd: null;
  acknowledgedUnknownPrice: true;
};

export class ContentAnalysisUnavailableError extends Error {}
export class ContentAnalysisApprovalError extends Error {}

function normalized(request: ContentAnalysisRequest): ContentAnalysisRequest {
  return {
    ...request,
    entityNames: [...request.entityNames].map((name) => name.trim()).filter(Boolean).sort(),
  };
}

export function estimateContentAnalysis(request: ContentAnalysisRequest): ContentAnalysisEstimate {
  const paramsHash = crypto.createHash("sha256").update(JSON.stringify(normalized(request))).digest("hex");
  return {
    provider: CONTENT_ANALYSIS_PROVIDER,
    mode: "fixture_only",
    capability: "unknown",
    priceUsd: null,
    units: 1,
    paramsHash,
    available: true,
  };
}

/**
 * Fixture execution still uses the normal budget gate. Live/default execution is intentionally
 * unavailable, and this adapter has no HTTP transport, credentials, endpoint, or retry path.
 */
export async function runContentAnalysis(
  db: Db,
  input: {
    orgId: string;
    request: ContentAnalysisRequest;
    approval?: ContentAnalysisApproval;
    fixture?: ContentAnalysisFixture;
  },
) {
  const estimate = estimateContentAnalysis(input.request);
  if (!input.fixture) {
    throw new ContentAnalysisUnavailableError(
      "Content Analysis live capability is unavailable; only an explicitly supplied test fixture can run.",
    );
  }
  const approval = input.approval;
  if (
    !approval ||
    approval.paramsHash !== estimate.paramsHash ||
    approval.units !== estimate.units ||
    approval.priceUsd !== null ||
    approval.acknowledgedUnknownPrice !== true
  ) {
    throw new ContentAnalysisApprovalError("Explicit approval must exactly match the current estimate.");
  }
  const budget = await checkBudget(db, input.orgId, CONTENT_ANALYSIS_PROVIDER, {
    units: estimate.units,
    uncachedUnits: estimate.units,
    usd: null,
  });
  if (!budget.allowed) throw new ContentAnalysisApprovalError(budget.reason ?? "Cost guard refused the fixture run.");

  return {
    provider: CONTENT_ANALYSIS_PROVIDER,
    mode: "fixture_only" as const,
    capability: "unknown" as const,
    priceUsd: null,
    paramsHash: estimate.paramsHash,
    mentions: input.fixture.mentions.map((mention) => ({ ...mention })),
  };
}
