import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { costLedger, draws, judgeRuns, prompts, scans } from "@/lib/db/pg/schema";
import {
  BAKEOFF_ENGINE,
  parseHandLabelsCsv,
  runModelBakeoff,
  usdFromUsage,
  type BakeoffChat,
} from "@/lib/judge/bakeoff";
import { ensurePhase2Providers } from "@/lib/site/providerCall";
import { resetDatabase } from "../helpers";

describe("C7: judge bake-off", () => {
  beforeEach(resetDatabase);

  it("agreement math is correct with mocked chat", async () => {
    const db = getDb();
    const { orgId, campaignId } = await legacyContext(db);
    await ensurePhase2Providers(db, orgId);
    const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
    const [p] = await db
      .insert(prompts)
      .values({ campaignId, text: "power engineering in NC", provenance: "custom", status: "approved" })
      .returning();
    const [s] = await db.insert(scans).values({ campaignId, name: "bake", kind: "scan", status: "complete" }).returning();
    const answer =
      "1. NC State has the largest program.\n2. UNC Charlotte has a strong power program through EPIC.";
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
        answerText: answer,
        capturedAt: new Date(),
      })
      .returning();

    const labels = parseHandLabelsCsv(
      [
        "draw_id,brand_mentioned,sentiment,position",
        `${d.id},y,positive,2`,
      ].join("\n"),
    );

    const chat: BakeoffChat = async () => ({
      ok: true,
      text: JSON.stringify({
        entities: [
          { key: "brand", sentiment: "positive", sentiment_quote: "has a strong power program" },
          { key: "NC State", sentiment: "neutral", sentiment_quote: null },
        ],
        claims: [],
        named_sources: [],
        possible_mentions: [],
      }),
      error: null,
      promptTokens: 100,
      completionTokens: 50,
    });

    const row = await runModelBakeoff(db, {
      orgId,
      model: "accounts/fireworks/models/qwen3p8-max",
      labels,
      approve: true,
      chat,
    });

    expect(row.n).toBe(1);
    expect(row.validJsonRate).toBe(1);
    expect(row.brandMentionedAgree).toBe(1);
    expect(row.sentimentAgree).toBe(1);
    expect(row.positionAgree).toBe(1);
    expect(row.promptTokens).toBe(100);
    expect(row.completionTokens).toBe(50);
    expect(row.priceNeeded).toBe(false);
    expect(row.usd).toBeCloseTo(usdFromUsage("accounts/fireworks/models/qwen3p8-max", 100, 50).usd!, 10);

    const ledger = await db.select().from(costLedger).where(eq(costLedger.engine, BAKEOFF_ENGINE));
    expect(ledger).toHaveLength(1);
    expect(Number(ledger[0].units)).toBe(150);
    expect(await db.select().from(judgeRuns)).toHaveLength(0);
  });

  it("writes nothing without --approve", async () => {
    const db = getDb();
    const { orgId } = await legacyContext(db);
    let called = 0;
    const chat: BakeoffChat = async () => {
      called++;
      return { ok: true, text: "{}", error: null, promptTokens: 1, completionTokens: 1 };
    };
    const row = await runModelBakeoff(db, {
      orgId,
      model: "accounts/fireworks/models/glm-5p3",
      labels: [
        {
          drawId: "00000000-0000-4000-8000-000000000099",
          brandMentioned: true,
          sentiment: "positive",
          position: 1,
        },
      ],
      approve: false,
      chat,
    });
    expect(called).toBe(0);
    expect(row.validJsonRate).toBe(0);
    expect(await db.select().from(costLedger)).toHaveLength(0);
    expect(await db.select().from(judgeRuns)).toHaveLength(0);
  });
});
