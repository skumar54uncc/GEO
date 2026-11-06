import type { CanonicalPersonaKey } from "@/lib/contracts/personas";
import type { EvidenceGrade } from "@/lib/contracts/recommendations";
import type {
  ScoreBreakdown,
  StrategyEvidenceRow,
  StrategyItem,
} from "@/lib/contracts/strategy";
import { strategyItemSchema } from "@/lib/contracts/strategy";
import type { GapLeverType } from "@/lib/contracts/gaps";
import { ownerForLever } from "@/lib/recommendations/levers";
import { uuidFromSeed } from "./hash";
import { computeScore, DEMAND_UNKNOWN_LABEL } from "./score";

export type PlanDraft = {
  topic: string;
  persona: CanonicalPersonaKey;
  promptCluster: string;
  format: string;
  headlineTerms: string[];
  faqs: string[];
  targetUrl: string | null;
  thirdPartySources: string[];
  leverType: GapLeverType;
  evidenceGrade: EvidenceGrade;
  evidenceIds: string[];
  factors: ScoreBreakdown;
  publishBy: string;
  seasonalEventId: string;
  owner?: string;
};

export function buildStrategyItem(draft: PlanDraft): StrategyItem {
  const score = computeScore(draft.factors);
  const demandUnknown = draft.factors.demand.value === null;
  if (demandUnknown && score !== null) {
    throw new Error("demand unknown must not produce a numeric score");
  }
  const item: StrategyItem = {
    id: uuidFromSeed(
      [
        draft.topic,
        draft.persona,
        draft.promptCluster,
        draft.leverType,
        draft.publishBy,
        ...draft.evidenceIds,
      ].join("|"),
    ),
    topic: draft.topic,
    persona: draft.persona,
    promptCluster: draft.promptCluster,
    format: draft.format,
    headlineTerms: draft.headlineTerms,
    faqs: draft.faqs,
    targetUrl: draft.targetUrl,
    thirdPartySources: draft.thirdPartySources,
    owner: draft.owner?.trim() || ownerForLever(draft.leverType),
    publishBy: draft.publishBy,
    seasonalEventId: draft.seasonalEventId,
    leverType: draft.leverType,
    evidenceGrade: draft.evidenceGrade,
    evidenceIds: [...draft.evidenceIds].sort(),
    score: demandUnknown ? null : score,
    scoreStatus: demandUnknown ? "demand_unknown" : "scored",
    factors: draft.factors,
    originalFactors: draft.factors,
    originalScore: demandUnknown ? null : score,
  };
  return strategyItemSchema.parse(item);
}

export function partitionPlanItems(items: StrategyItem[]): {
  scoredItems: StrategyItem[];
  unscoredItems: StrategyItem[];
} {
  const scoredItems = items
    .filter((i) => i.scoreStatus === "scored")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.promptCluster.localeCompare(b.promptCluster));
  const unscoredItems = items
    .filter((i) => i.scoreStatus === "demand_unknown")
    .sort((a, b) => a.promptCluster.localeCompare(b.promptCluster));
  return { scoredItems, unscoredItems };
}

export function evidenceRowsFromNotes(
  rows: Array<{ id: string; kind: StrategyEvidenceRow["kind"]; note: string; refIds?: string[] }>,
): StrategyEvidenceRow[] {
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    note: r.note.includes(DEMAND_UNKNOWN_LABEL) ? r.note : r.note,
    refIds: r.refIds ?? [],
  }));
}
