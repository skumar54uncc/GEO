import crypto from "crypto";
import { checkBudget } from "@/lib/cost/guard";
import type { GapLeverType } from "@/lib/contracts/gaps";
import {
  recommendationCardSchema,
  type EvidenceGrade,
  type RecommendationCard,
  type RecommendationCardItem,
  type RecommendationEvidenceRow,
} from "@/lib/contracts/recommendations";
import type { Db } from "@/lib/db/pg/client";
import { contentModel } from "@/lib/fireworks";
import { buildRecommendationCard } from "./card";

export const WRITER_PROVIDER = "recommendation_writer";

export type WriterEvidence = RecommendationEvidenceRow;

export type WriterRequest = {
  campaignId: string;
  leverType: GapLeverType;
  evidenceGrade: EvidenceGrade;
  format: string;
  targetUrl?: string | null;
  evidence: WriterEvidence[];
  /** Optional draft statements the fixture / model must ground. */
  draftItems?: RecommendationCardItem[];
};

export type WriterFixture = {
  items: RecommendationCardItem[];
  headlineTerms?: string[];
  faqs?: string[];
  thirdPartySources?: string[];
  format?: string;
  targetUrl?: string | null;
  owner?: string;
};

export type WriterEstimate = {
  provider: typeof WRITER_PROVIDER;
  mode: "fixture_only";
  capability: "unknown";
  priceUsd: null;
  units: number;
  paramsHash: string;
  available: true;
  /** Resolved writer model; never equals the judge model. */
  writerModel: string;
};

export type WriterApproval = {
  paramsHash: string;
  units: number;
  priceUsd: null;
  acknowledgedUnknownPrice: true;
};

export type WriterResult = {
  provider: typeof WRITER_PROVIDER;
  mode: "fixture_only";
  capability: "unknown";
  priceUsd: null;
  paramsHash: string;
  writerModel: string;
  card: RecommendationCard;
};

export class WriterUnavailableError extends Error {}
export class WriterApprovalError extends Error {}
export class WriterGroundingError extends Error {}

function normalized(request: WriterRequest): WriterRequest {
  return {
    campaignId: request.campaignId,
    leverType: request.leverType,
    evidenceGrade: request.evidenceGrade,
    format: request.format.trim(),
    targetUrl: request.targetUrl ?? null,
    evidence: [...request.evidence]
      .map((row) => ({
        ...row,
        citationIds: [...row.citationIds].sort(),
      }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    draftItems: request.draftItems
      ? [...request.draftItems].map((item) => ({
          ...item,
          evidenceIds: [...item.evidenceIds].sort(),
        }))
      : undefined,
  };
}

/** Every statement must cite at least one supplied evidence id; unknown ids are rejected. */
export function assertGrounded(
  items: readonly RecommendationCardItem[],
  evidence: readonly WriterEvidence[],
): void {
  const known = new Set(evidence.map((row) => row.id));
  if (known.size === 0) throw new WriterGroundingError("Writer requires at least one evidence row.");
  for (const item of items) {
    if (!item.evidenceIds.length) {
      throw new WriterGroundingError(`Item "${item.text}" has no evidence ids.`);
    }
    for (const id of item.evidenceIds) {
      if (!known.has(id)) {
        throw new WriterGroundingError(`Item cites unknown evidence id ${id}.`);
      }
    }
  }
}

export function estimateWriter(request: WriterRequest): WriterEstimate {
  const writerModel = contentModel();
  const paramsHash = crypto.createHash("sha256").update(JSON.stringify(normalized(request))).digest("hex");
  return {
    provider: WRITER_PROVIDER,
    mode: "fixture_only",
    capability: "unknown",
    priceUsd: null,
    units: 1,
    paramsHash,
    available: true,
    writerModel,
  };
}

/**
 * Paid writer path: estimate → approval → cost guard. Live HTTP is unavailable;
 * only an explicitly supplied fixture runs. Output is rejected if any statement
 * cites an evidence id that was not supplied.
 */
export async function runWriter(
  db: Db,
  input: {
    orgId: string;
    request: WriterRequest;
    approval?: WriterApproval;
    fixture?: WriterFixture;
  },
): Promise<WriterResult> {
  const estimate = estimateWriter(input.request);
  if (!input.fixture) {
    throw new WriterUnavailableError(
      "Recommendation writer live capability is unavailable; only an explicitly supplied test fixture can run.",
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
    throw new WriterApprovalError("Explicit approval must exactly match the current estimate.");
  }
  const budget = await checkBudget(db, input.orgId, WRITER_PROVIDER, {
    units: estimate.units,
    uncachedUnits: estimate.units,
    usd: null,
  });
  if (!budget.allowed) throw new WriterApprovalError(budget.reason ?? "Cost guard refused the writer run.");

  const items = input.fixture.items;
  assertGrounded(items, input.request.evidence);

  const card = buildRecommendationCard({
    leverType: input.request.leverType,
    evidenceGrade: input.request.evidenceGrade,
    owner: input.fixture.owner,
    evidence: input.request.evidence,
    items,
    headlineTerms: input.fixture.headlineTerms,
    faqs: input.fixture.faqs,
    format: input.fixture.format ?? input.request.format,
    targetUrl: input.fixture.targetUrl !== undefined ? input.fixture.targetUrl : input.request.targetUrl,
    thirdPartySources: input.fixture.thirdPartySources,
  });

  return {
    provider: WRITER_PROVIDER,
    mode: "fixture_only",
    capability: "unknown",
    priceUsd: null,
    paramsHash: estimate.paramsHash,
    writerModel: estimate.writerModel,
    card: recommendationCardSchema.parse(card),
  };
}
