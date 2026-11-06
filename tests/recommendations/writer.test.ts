import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { providerAccounts } from "@/lib/db/pg/schema";
import {
  assertGrounded,
  estimateWriter,
  runWriter,
  WriterApprovalError,
  WriterGroundingError,
  WriterUnavailableError,
  WRITER_PROVIDER,
} from "@/lib/recommendations/writer";
import { resetDatabase } from "../helpers";

const EVIDENCE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BAD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DRAW_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CITATION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const ORIGINAL = {
  JUDGE_MODEL: process.env.JUDGE_MODEL,
  CONTENT_MODEL: process.env.CONTENT_MODEL,
};

beforeEach(async () => {
  process.env.JUDGE_MODEL = "accounts/fireworks/models/judge-fixture";
  process.env.CONTENT_MODEL = "accounts/fireworks/models/writer-fixture";
  await resetDatabase();
});

afterEach(() => {
  if (ORIGINAL.JUDGE_MODEL === undefined) delete process.env.JUDGE_MODEL;
  else process.env.JUDGE_MODEL = ORIGINAL.JUDGE_MODEL;
  if (ORIGINAL.CONTENT_MODEL === undefined) delete process.env.CONTENT_MODEL;
  else process.env.CONTENT_MODEL = ORIGINAL.CONTENT_MODEL;
});

function request(campaignId: string) {
  return {
    campaignId,
    leverType: "on_page" as const,
    evidenceGrade: "C" as const,
    format: "FAQ answer capsule",
    targetUrl: null,
    evidence: [{ id: EVIDENCE_ID, drawId: DRAW_ID, citationIds: [CITATION_ID] }],
  };
}

describe("grounded recommendation writer", () => {
  it("rejects statements that cite an evidence id that does not exist", () => {
    expect(() =>
      assertGrounded(
        [{ kind: "headline_term", text: "invented", evidenceIds: [BAD_ID] }],
        [{ id: EVIDENCE_ID, drawId: DRAW_ID, citationIds: [CITATION_ID] }],
      ),
    ).toThrow(WriterGroundingError);
  });

  it("proves no paid call without approval, then runs fixture-only after estimate → approval → cost guard", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    await db.insert(providerAccounts).values({
      orgId: ctx.orgId,
      provider: WRITER_PROVIDER,
      perRunCapUnits: 1,
      creditsRemaining: 1,
      creditUnitUsd: null,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const req = request(ctx.campaignId);
    const estimate = estimateWriter(req);
    expect(estimate).toMatchObject({
      provider: WRITER_PROVIDER,
      mode: "fixture_only",
      priceUsd: null,
      writerModel: "accounts/fireworks/models/writer-fixture",
    });
    expect(estimate.writerModel).not.toBe(process.env.JUDGE_MODEL);

    await expect(runWriter(db, { orgId: ctx.orgId, request: req })).rejects.toBeInstanceOf(WriterUnavailableError);
    await expect(
      runWriter(db, {
        orgId: ctx.orgId,
        request: req,
        fixture: {
          items: [{ kind: "headline_term", text: "Carolinas Grid Engine", evidenceIds: [EVIDENCE_ID] }],
        },
      }),
    ).rejects.toBeInstanceOf(WriterApprovalError);

    const approval = {
      paramsHash: estimate.paramsHash,
      units: estimate.units,
      priceUsd: null as null,
      acknowledgedUnknownPrice: true as const,
    };
    await expect(
      runWriter(db, {
        orgId: ctx.orgId,
        request: req,
        approval: { ...approval, paramsHash: "0".repeat(64) },
        fixture: {
          items: [{ kind: "headline_term", text: "Carolinas Grid Engine", evidenceIds: [EVIDENCE_ID] }],
        },
      }),
    ).rejects.toBeInstanceOf(WriterApprovalError);

    await expect(
      runWriter(db, {
        orgId: ctx.orgId,
        request: req,
        approval,
        fixture: {
          items: [{ kind: "headline_term", text: "bogus", evidenceIds: [BAD_ID] }],
        },
      }),
    ).rejects.toBeInstanceOf(WriterGroundingError);

    const ok = await runWriter(db, {
      orgId: ctx.orgId,
      request: req,
      approval,
      fixture: {
        items: [
          { kind: "headline_term", text: "Carolinas Grid Engine", evidenceIds: [EVIDENCE_ID] },
          { kind: "faq", text: "What is the Carolinas Grid Engine?", evidenceIds: [EVIDENCE_ID] },
        ],
        format: "FAQ answer capsule",
      },
    });
    expect(ok.mode).toBe("fixture_only");
    expect(ok.card.items).toHaveLength(2);
    expect(ok.card.evidence[0].citationIds).toEqual([CITATION_ID]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
