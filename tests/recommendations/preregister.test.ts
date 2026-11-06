import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { CORRELATION_LABEL } from "@/lib/contracts/gaps";
import { getDb } from "@/lib/db/pg/client";
import { prompts, promptSets, recommendations } from "@/lib/db/pg/schema";
import {
  assertPreregistrationMutable,
  judgeRecommendationOutcome,
  judgeTargetOutcome,
  OutcomePromptSetError,
  PreRegistrationError,
  publishRecommendation,
  type RecommendationPayload,
} from "@/lib/recommendations/preregister";
import { freezePromptSet } from "@/lib/promptSets";
import { addDraw, newScan, seed } from "../metrics/dbFixtures";
import { resetDatabase } from "../helpers";

const EVIDENCE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DRAW_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const CITATION_ID = "12121212-1212-4121-8121-121212121212";

function cardPayload(): RecommendationPayload {
  return {
    card: {
      leverType: "on_page",
      owner: "Content team",
      evidenceGrade: "C",
      label: CORRELATION_LABEL,
      evidence: [{ id: EVIDENCE_ID, drawId: DRAW_ID, citationIds: [CITATION_ID] }],
      items: [{ kind: "headline_term", text: "energy", evidenceIds: [EVIDENCE_ID] }],
      headlineTerms: ["energy"],
      faqs: [],
      format: "FAQ",
      targetUrl: null,
      thirdPartySources: [],
    },
  };
}

describe("pre-registration outcomes", () => {
  beforeEach(resetDatabase);

  it("McNemar on targets labels improvement, decline, and within noise", () => {
    const targets = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const before = new Map(targets.map((id) => [id, false]));
    const afterImprove = new Map(targets.map((id) => [id, true]));
    expect(judgeTargetOutcome({ beforeWon: before, afterWon: afterImprove, targetPromptIds: targets }).label).toBe(
      "improvement",
    );

    const afterDecline = new Map(targets.map((id) => [id, false]));
    const beforeWon = new Map(targets.map((id) => [id, true]));
    expect(judgeTargetOutcome({ beforeWon, afterWon: afterDecline, targetPromptIds: targets }).label).toBe("decline");

    expect(
      judgeTargetOutcome({
        beforeWon: new Map([
          ["p1", true],
          ["p2", false],
        ]),
        afterWon: new Map([
          ["p1", true],
          ["p2", false],
        ]),
        targetPromptIds: ["p1", "p2"],
      }).label,
    ).toBe("within noise");
  });

  it("publish locks targets, baseline scan, and prompt set hash; outcome refuses a different version", async () => {
    const c = await seed(2);
    const baselineScanId = await newScan(c);
    await addDraw(c, baselineScanId, c.promptIds[0], { brand: false });
    await addDraw(c, baselineScanId, c.promptIds[1], { brand: false });

    const [rec] = await c.db
      .insert(recommendations)
      .values({
        campaignId: c.campaignId,
        kind: "gap",
        leverType: "on_page",
        owner: "Content team",
        evidenceGrade: "C",
        payload: cardPayload(),
        evidence: cardPayload().card.evidence,
        status: "open",
      })
      .returning();

    const published = await publishRecommendation(c.db, {
      recommendationId: rec.id,
      targetPromptIds: [c.promptIds[0]],
      baselineScanId,
    });
    expect(published.status).toBe("published");
    expect(published.lock.baselineScanId).toBe(baselineScanId);
    expect(published.lock.targetPromptIds).toEqual([c.promptIds[0]]);
    expect(published.lock.promptSetHash).toMatch(/^[a-f0-9]{64}$/);

    const [locked] = await c.db.select().from(recommendations).where(eq(recommendations.id, rec.id));
    expect(locked.status).toBe("published");
    expect(locked.baselineScanId).toBe(baselineScanId);
    expect(() => assertPreregistrationMutable(locked, { targetPromptIds: [c.promptIds[1]] })).toThrow(
      PreRegistrationError,
    );

    const followupSame = await newScan(c, c.promptSetId, "complete", new Date(Date.now() + 60_000));
    await addDraw(c, followupSame, c.promptIds[0], { brand: true });
    const outcome = await judgeRecommendationOutcome(c.db, {
      recommendationId: rec.id,
      followupScanId: followupSame,
      beforeWon: new Map([[c.promptIds[0], false]]),
      afterWon: new Map([[c.promptIds[0], true]]),
    });
    // One discordant pair is within noise at alpha 0.05.
    expect(outcome.label).toBe("within noise");
    expect(outcome.followupScanId).toBe(followupSame);

    await getDb()
      .insert(prompts)
      .values({
        campaignId: c.campaignId,
        text: "extra prompt for new set",
        provenance: "custom",
        status: "approved",
      });
    const { set: otherSet } = await freezePromptSet(c.db, c.orgId, c.campaignId);
    expect(otherSet.id).not.toBe(c.promptSetId);
    const [hashCheck] = await getDb().select().from(promptSets).where(eq(promptSets.id, otherSet.id));
    expect(hashCheck.sha256).not.toBe(published.lock.promptSetHash);

    const followupOther = await newScan(c, otherSet.id, "complete", new Date(Date.now() + 120_000));
    await expect(
      judgeRecommendationOutcome(c.db, {
        recommendationId: rec.id,
        followupScanId: followupOther,
        beforeWon: new Map([[c.promptIds[0], false]]),
        afterWon: new Map([[c.promptIds[0], true]]),
      }),
    ).rejects.toBeInstanceOf(OutcomePromptSetError);
  });
});
