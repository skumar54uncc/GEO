import { describe, expect, it } from "vitest";
import { computeScore, DEMAND_UNKNOWN_LABEL, demandUnknownFactor, scoredFactor } from "@/lib/strategy/score";
import { buildStrategyItem, partitionPlanItems } from "@/lib/strategy/plan";

const seasonalEventId = "00000000-0000-4000-8000-000000000099";
const evidenceId = "00000000-0000-4000-8000-000000000088";

describe("strategy score", () => {
  it("computes demand × gap × effort and never treats missing demand as zero", () => {
    expect(
      computeScore({
        demand: scoredFactor(0.5, "d", 3),
        gapSize: scoredFactor(0.8, "g", 10),
        effort: scoredFactor(0.5, "e", 1),
      }),
    ).toBeCloseTo(0.2, 12);

    expect(
      computeScore({
        demand: demandUnknownFactor("google_trends", ["google_trends"]),
        gapSize: scoredFactor(1, "g", 10),
        effort: scoredFactor(1, "e", 1),
      }),
    ).toBeNull();
  });

  it("puts demand-unknown items in a separate unscored list", () => {
    const scored = buildStrategyItem({
      topic: "energy",
      persona: "doctoral_applicant",
      promptCluster: "energy PhD funding",
      format: "research page",
      headlineTerms: ["grid storage"],
      faqs: [],
      targetUrl: null,
      thirdPartySources: [],
      leverType: "on_page",
      evidenceGrade: "C",
      evidenceIds: [evidenceId],
      factors: {
        demand: scoredFactor(0.6, "d", 4),
        gapSize: scoredFactor(0.5, "g", 8),
        effort: scoredFactor(0.8, "e", 1),
      },
      publishBy: "2026-10-01",
      seasonalEventId,
    });
    const unknown = buildStrategyItem({
      topic: "energy",
      persona: "doctoral_applicant",
      promptCluster: "energy PhD funding unknown demand",
      format: "research page",
      headlineTerms: ["grid storage"],
      faqs: [],
      targetUrl: null,
      thirdPartySources: [],
      leverType: "original_data",
      evidenceGrade: "C",
      evidenceIds: [evidenceId],
      factors: {
        demand: demandUnknownFactor("google_trends+search_console+keyword_volume", ["google_trends"]),
        gapSize: scoredFactor(0.5, "g", 8),
        effort: scoredFactor(0.8, "e", 1),
      },
      publishBy: "2026-10-01",
      seasonalEventId,
    });
    expect(unknown.score).toBeNull();
    expect(unknown.scoreStatus).toBe("demand_unknown");
    expect(unknown.factors.demand.note).toContain(DEMAND_UNKNOWN_LABEL.split(" ")[0] === "demand" ? "not connected" : "");
    const parts = partitionPlanItems([scored, unknown]);
    expect(parts.scoredItems).toHaveLength(1);
    expect(parts.unscoredItems).toHaveLength(1);
    expect(parts.unscoredItems[0].id).toBe(unknown.id);
  });
});
