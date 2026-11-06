import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { GapEvidenceBundle } from "@/lib/gaps";
import { getDb } from "@/lib/db/pg/client";
import { citations, providerAccounts, recommendations } from "@/lib/db/pg/schema";
import { buildRecommendationCard } from "@/lib/recommendations/card";
import {
  judgeRecommendationOutcome,
  publishRecommendation,
  type RecommendationPayload,
} from "@/lib/recommendations/preregister";
import { estimateWriter, runWriter, WRITER_PROVIDER } from "@/lib/recommendations/writer";
import { addDraw, newScan, seed } from "../metrics/dbFixtures";
import { resetDatabase } from "../helpers";

const ORIGINAL = {
  JUDGE_MODEL: process.env.JUDGE_MODEL,
  CONTENT_MODEL: process.env.CONTENT_MODEL,
};

/**
 * End-to-end fixture: one realistic lost energy prompt → gap bundle →
 * grounded recommendation → publish → follow-up scan → McNemar outcome.
 * Term-lift / lost-cohort math is stubbed via GapEvidenceBundle (other agent).
 */
describe("Phase 7 recommendation e2e fixture", () => {
  beforeEach(async () => {
    process.env.JUDGE_MODEL = "accounts/fireworks/models/judge-e2e";
    process.env.CONTENT_MODEL = "accounts/fireworks/models/writer-e2e";
    await resetDatabase();
  });

  afterEach(() => {
    if (ORIGINAL.JUDGE_MODEL === undefined) delete process.env.JUDGE_MODEL;
    else process.env.JUDGE_MODEL = ORIGINAL.JUDGE_MODEL;
    if (ORIGINAL.CONTENT_MODEL === undefined) delete process.env.CONTENT_MODEL;
    else process.env.CONTENT_MODEL = ORIGINAL.CONTENT_MODEL;
  });

  it("lost energy prompt → gaps → recommendation → publish → follow-up → outcome", async () => {
    // Six target prompts so McNemar (b=0,c=6) is a significant improvement.
    const c = await seed(6);
    await c.db.insert(providerAccounts).values({
      orgId: c.orgId,
      provider: WRITER_PROVIDER,
      perRunCapUnits: 1,
      creditsRemaining: 1,
      creditUnitUsd: null,
    });

    const baselineScanId = await newScan(c);
    const energyPromptId = c.promptIds[0];
    const lostDrawId = await addDraw(c, baselineScanId, energyPromptId, {
      brand: false,
      citation: { domain: "usnews.com", sourceClass: "other" },
    });
    const [citation] = await c.db.select().from(citations).where(eq(citations.drawId, lostDrawId));
    expect(citation).toBeTruthy();

    for (let i = 1; i < c.promptIds.length; i++) {
      await addDraw(c, baselineScanId, c.promptIds[i], { brand: false });
    }

    const evidenceId = "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1";
    const gapBundle: GapEvidenceBundle = {
      campaignId: c.campaignId,
      scanId: baselineScanId,
      leverType: "on_page",
      lost: {
        scanId: baselineScanId,
        engine: "chatgpt",
        runner: "ui_provider",
        regionId: c.regionId,
        personaId: null,
        branded: false,
        promptIds: c.promptIds,
      },
      termLifts: [
        {
          term: "Carolinas Grid Engine",
          logOddsLift: 1.2,
          won: { matches: 12, n: 20 },
          lost: { matches: 2, n: 20 },
        },
      ],
      citedPageIds: [],
      closestOwnedPage: { crawlPageId: null, similarity: null, noMatchingPage: true },
      evidenceIds: [evidenceId],
    };

    const evidence = [
      {
        id: evidenceId,
        drawId: lostDrawId,
        citationIds: [citation.id],
        note: "Lost: best energy engineering programs in the Southeast",
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const writerRequest = {
      campaignId: c.campaignId,
      leverType: gapBundle.leverType,
      evidenceGrade: "C" as const,
      format: "FAQ answer capsule on energy partnership page",
      targetUrl: null as string | null,
      evidence,
    };
    const estimate = estimateWriter(writerRequest);
    const approval = {
      paramsHash: estimate.paramsHash,
      units: estimate.units,
      priceUsd: null as null,
      acknowledgedUnknownPrice: true as const,
    };
    const written = await runWriter(c.db, {
      orgId: c.orgId,
      request: writerRequest,
      approval,
      fixture: {
        items: [
          {
            kind: "headline_term",
            text: gapBundle.termLifts[0].term,
            evidenceIds: [evidenceId],
          },
          {
            kind: "faq",
            text: "What is UNC Charlotte's role in the Carolinas Grid Engine?",
            evidenceIds: [evidenceId],
          },
          {
            kind: "target_page",
            text: "Publish a new energy partnership FAQ (no matching owned page)",
            evidenceIds: [evidenceId],
          },
        ],
        format: writerRequest.format,
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const card = buildRecommendationCard({
      leverType: written.card.leverType,
      evidenceGrade: written.card.evidenceGrade,
      evidence: written.card.evidence,
      items: written.card.items,
      format: written.card.format,
      targetUrl: written.card.targetUrl,
      headlineTerms: written.card.headlineTerms,
      faqs: written.card.faqs,
    });
    expect(card.evidence[0].drawId).toBe(lostDrawId);
    expect(card.evidence[0].citationIds).toEqual([citation.id]);

    const payload: RecommendationPayload = { card };
    const [rec] = await c.db
      .insert(recommendations)
      .values({
        campaignId: c.campaignId,
        kind: "gap",
        leverType: card.leverType,
        owner: card.owner,
        evidenceGrade: card.evidenceGrade,
        payload,
        evidence: card.evidence,
        status: "in_progress",
      })
      .returning();

    const published = await publishRecommendation(c.db, {
      recommendationId: rec.id,
      targetPromptIds: gapBundle.lost.promptIds,
      baselineScanId,
    });
    expect(published.lock.promptSetId).toBe(c.promptSetId);

    const followupScanId = await newScan(c, c.promptSetId, "complete", new Date(Date.now() + 86_400_000));
    const beforeWon = new Map<string, boolean>();
    const afterWon = new Map<string, boolean>();
    for (const promptId of c.promptIds) {
      beforeWon.set(promptId, false);
      afterWon.set(promptId, true);
      await addDraw(c, followupScanId, promptId, { brand: true });
    }

    const outcome = await judgeRecommendationOutcome(getDb(), {
      recommendationId: rec.id,
      followupScanId,
      beforeWon,
      afterWon,
    });
    expect(outcome.pairs).toBe(6);
    expect(outcome.b).toBe(0);
    expect(outcome.c).toBe(6);
    expect(outcome.label).toBe("improvement");

    const [finalRow] = await getDb().select().from(recommendations).where(eq(recommendations.id, rec.id));
    expect(finalRow.status).toBe("published");
    expect(finalRow.followupScanId).toBe(followupScanId);
    expect((finalRow.payload as RecommendationPayload).preregistration?.promptSetHash).toBe(
      published.lock.promptSetHash,
    );
  });
});
