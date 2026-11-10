import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentModel, judgeModel, WriterModelConfigError } from "@/lib/fireworks";
import { judgeDraw, type ChatFn } from "@/lib/judge/v2";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { draws, prompts, scans } from "@/lib/db/pg/schema";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { ensurePhase2Providers } from "@/lib/site/providerCall";
import { resetDatabase } from "../helpers";

const ORIGINAL = {
  JUDGE_MODEL: process.env.JUDGE_MODEL,
  CONTENT_MODEL: process.env.CONTENT_MODEL,
};

afterEach(() => {
  if (ORIGINAL.JUDGE_MODEL === undefined) delete process.env.JUDGE_MODEL;
  else process.env.JUDGE_MODEL = ORIGINAL.JUDGE_MODEL;
  if (ORIGINAL.CONTENT_MODEL === undefined) delete process.env.CONTENT_MODEL;
  else process.env.CONTENT_MODEL = ORIGINAL.CONTENT_MODEL;
});

describe("C3: JUDGE_MODEL required", () => {
  it("judgeModel throws when JUDGE_MODEL is unset", () => {
    delete process.env.JUDGE_MODEL;
    expect(() => judgeModel()).toThrow(/JUDGE_MODEL is not set/);
  });

  it("writer with CONTENT_MODEL equal to JUDGE_MODEL still throws", () => {
    process.env.JUDGE_MODEL = "accounts/fireworks/models/same-model";
    process.env.CONTENT_MODEL = "accounts/fireworks/models/same-model";
    expect(() => contentModel()).toThrow(WriterModelConfigError);
    expect(() => contentModel()).toThrow(/must differ from JUDGE_MODEL/);
  });

  beforeEach(resetDatabase);

  it("judgeDraw fails loudly when JUDGE_MODEL is unset and no model override", async () => {
    delete process.env.JUDGE_MODEL;
    const db = getDb();
    const { orgId, campaignId } = await legacyContext(db);
    await ensurePhase2Providers(db, orgId);
    const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
    const [p] = await db
      .insert(prompts)
      .values({ campaignId, text: "power engineering in NC", provenance: "custom", status: "approved" })
      .returning();
    const [s] = await db.insert(scans).values({ campaignId, name: "c3", kind: "capture_test", status: "complete" }).returning();
    const [d] = await db
      .insert(draws)
      .values({
        scanId: s.id,
        promptId: p.id,
        engine: "claude",
        runner: "api_search",
        fidelity: "medium",
        provider: "anthropic",
        regionId: region.id,
        drawIndex: 1,
        status: "ok",
        answerText: "UNC Charlotte has a strong power program.",
        capturedAt: new Date(),
      })
      .returning();

    let called = 0;
    const chat: ChatFn = async () => {
      called++;
      return { ok: true, text: "{}", error: null };
    };
    const res = await judgeDraw(db, d.id, {
      orgId,
      aliases: [
        {
          alias: "UNC Charlotte",
          entityType: "brand",
          entityId: "00000000-0000-4000-8000-00000000000b",
          entityName: "UNC Charlotte",
          requiresContext: false,
        },
      ],
      chat,
    });
    expect(called).toBe(0);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("JUDGE_MODEL is not set");
  });
});
