import { describe, expect, it } from "vitest";
import { CORRELATION_LABEL } from "@/lib/contracts/gaps";
import { recommendationCardSchema } from "@/lib/contracts/recommendations";
import { buildRecommendationCard, missingEvidenceIds } from "@/lib/recommendations/card";
import { LEVER_OWNERS } from "@/lib/recommendations/levers";

const EVIDENCE_ID = "11111111-1111-4111-8111-111111111111";
const DRAW_ID = "22222222-2222-4222-8222-222222222222";
const CITATION_ID = "33333333-3333-4333-8333-333333333333";

describe("recommendation card", () => {
  it("builds a playbook lever card with owner, grade A-D, and evidence-linked items", () => {
    const card = buildRecommendationCard({
      leverType: "on_page",
      evidenceGrade: "C",
      format: "FAQ answer capsule",
      targetUrl: "https://epic.charlotte.edu/energy",
      evidence: [
        {
          id: EVIDENCE_ID,
          drawId: DRAW_ID,
          citationIds: [CITATION_ID],
          note: "Cited peer listicle for lost energy prompt",
        },
      ],
      items: [
        {
          kind: "headline_term",
          text: "Carolinas Grid Engine",
          evidenceIds: [EVIDENCE_ID],
        },
        {
          kind: "faq",
          text: "What is the Carolinas Grid Engine partnership?",
          evidenceIds: [EVIDENCE_ID],
        },
        {
          kind: "third_party_source",
          text: "https://example.edu/best-energy-programs",
          evidenceIds: [EVIDENCE_ID],
        },
      ],
    });

    expect(card.owner).toBe(LEVER_OWNERS.on_page);
    expect(card.evidenceGrade).toBe("C");
    expect(card.label).toBe(CORRELATION_LABEL);
    expect(card.evidence[0].drawId).toBe(DRAW_ID);
    expect(card.evidence[0].citationIds).toEqual([CITATION_ID]);
    expect(card.items.every((item) => item.evidenceIds.includes(EVIDENCE_ID))).toBe(true);
    expect(recommendationCardSchema.safeParse(card).success).toBe(true);
  });

  it("rejects items that cite evidence ids not present on the card", () => {
    const ghost = "99999999-9999-4999-8999-999999999999";
    expect(() =>
      buildRecommendationCard({
        leverType: "earned_media",
        evidenceGrade: "B",
        format: "pitch list",
        evidence: [{ id: EVIDENCE_ID, drawId: DRAW_ID, citationIds: [CITATION_ID] }],
        items: [{ kind: "third_party_source", text: "pitch author", evidenceIds: [ghost] }],
      }),
    ).toThrow();
    expect(
      missingEvidenceIds({
        evidence: [{ id: EVIDENCE_ID, drawId: DRAW_ID, citationIds: [CITATION_ID] }],
        items: [{ kind: "faq", text: "x", evidenceIds: [ghost] }],
      }),
    ).toEqual([ghost]);
  });
});
