import { CORRELATION_LABEL, type GapLeverType } from "@/lib/contracts/gaps";
import {
  recommendationCardSchema,
  type EvidenceGrade,
  type RecommendationCard,
  type RecommendationCardItem,
  type RecommendationEvidenceRow,
} from "@/lib/contracts/recommendations";
import { ownerForLever } from "./levers";

export type BuildRecommendationCardInput = {
  leverType: GapLeverType;
  evidenceGrade: EvidenceGrade;
  /** Override playbook owner when a specific person is assigned. */
  owner?: string;
  evidence: RecommendationEvidenceRow[];
  items: RecommendationCardItem[];
  headlineTerms?: string[];
  faqs?: string[];
  format: string;
  targetUrl?: string | null;
  thirdPartySources?: string[];
};

/**
 * Builds a recommendation card for one of the seven playbook levers.
 * Every item must cite real evidence row ids that include draw and citation ids.
 */
export function buildRecommendationCard(input: BuildRecommendationCardInput): RecommendationCard {
  const derivedTerms = input.items.filter((i) => i.kind === "headline_term").map((i) => i.text);
  const derivedFaqs = input.items.filter((i) => i.kind === "faq").map((i) => i.text);
  const derivedSources = input.items.filter((i) => i.kind === "third_party_source").map((i) => i.text);
  const card: RecommendationCard = {
    leverType: input.leverType,
    owner: input.owner?.trim() || ownerForLever(input.leverType),
    evidenceGrade: input.evidenceGrade,
    label: CORRELATION_LABEL,
    evidence: input.evidence,
    items: input.items,
    headlineTerms: input.headlineTerms ?? derivedTerms,
    faqs: input.faqs ?? derivedFaqs,
    format: input.format,
    targetUrl: input.targetUrl ?? null,
    thirdPartySources: input.thirdPartySources ?? derivedSources,
  };
  return recommendationCardSchema.parse(card);
}

/** Returns evidence ids referenced by items that are missing from the evidence list. */
export function missingEvidenceIds(card: Pick<RecommendationCard, "evidence" | "items">): string[] {
  const known = new Set(card.evidence.map((row) => row.id));
  const missing = new Set<string>();
  for (const item of card.items) {
    for (const id of item.evidenceIds) {
      if (!known.has(id)) missing.add(id);
    }
  }
  return [...missing];
}
