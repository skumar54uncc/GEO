import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { costLedger, draws, judgeRuns, prompts, scans } from "@/lib/db/pg/schema";
import {
  BAKEOFF_ENGINE,
  jaccard,
  parseHandLabelsCsv,
  runModelBakeoff,
  usdFromUsage,
  type BakeoffChat,
} from "@/lib/judge/bakeoff";
import { selectBrandMatchedSample } from "@/lib/judge/sample";
import { ensurePhase2Providers } from "@/lib/site/providerCall";
import { resetDatabase } from "../helpers";

describe("E1: judge bake-off agreement", () => {
  beforeEach(resetDatabase);

  it("agreement math is correct for sentiment, missed_mention, and named_sources Jaccard", async () => {
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
      "1. NC State has the largest program.\n2. UNC Charlotte has a strong power program through EPIC. Sources: U.S. News.";
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
        "draw_id,sentiment,missed_mention,named_sources",
        `${d.id},positive,n,U.S. News; Chronicle`,
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
        named_sources: [
          { name: "U.S. News", quote: "U.S. News" },
          { name: "Chronicle", quote: "Chronicle" },
        ],
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
    expect(row.sentimentAgree).toBe(1);
    expect(row.missedMentionAgree).toBe(1);
    expect(row.namedSourcesJaccard).toBe(1);
    expect(jaccard(["U.S. News"], ["u.s. news", "chronicle"])).toBeCloseTo(1 / 2, 10);
    expect(row.usd).toBeCloseTo(usdFromUsage("accounts/fireworks/models/qwen3p8-max", 100, 50).usd!, 10);

    const ledger = await db.select().from(costLedger).where(eq(costLedger.engine, BAKEOFF_ENGINE));
    expect(ledger).toHaveLength(1);
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
          sentiment: "positive",
          missedMention: false,
          namedSources: [],
        },
      ],
      approve: false,
      chat,
    });
    expect(called).toBe(0);
    expect(row.validJsonRate).toBe(0);
    expect(await db.select().from(costLedger)).toHaveLength(0);
  });
});

describe("E1: judge sample selection", () => {
  beforeEach(resetDatabase);

  it("spreads across engines and only takes brand-matched ok draws", async () => {
    const db = getDb();
    const { orgId, campaignId } = await legacyContext(db);
    const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
    const [p] = await db
      .insert(prompts)
      .values({ campaignId, text: "best power programs", provenance: "custom", status: "approved" })
      .returning();
    const [s] = await db.insert(scans).values({ campaignId, name: "sample", kind: "scan", status: "complete" }).returning();

    const engines = ["chatgpt", "gemini", "perplexity", "claude", "google_aio", "google_ai_mode"] as const;
    for (const [i, engine] of engines.entries()) {
      // Two brand-matched + one city-only (no brand alias) per engine.
      for (let j = 0; j < 2; j++) {
        await db.insert(draws).values({
          scanId: s.id,
          promptId: p.id,
          engine,
          runner: "api_search",
          fidelity: "medium",
          provider: "anthropic",
          regionId: region.id,
          drawIndex: j + 1,
          status: "ok",
          answerText: `UNC Charlotte program ${engine} ${j}`,
          capturedAt: new Date(),
        });
      }
      await db.insert(draws).values({
        scanId: s.id,
        promptId: p.id,
        engine,
        runner: "api_search",
        fidelity: "medium",
        provider: "anthropic",
        regionId: region.id,
        drawIndex: 3,
        status: "ok",
        answerText: "Charlotte is a growing city with light rail.",
        capturedAt: new Date(),
      });
      await db.insert(draws).values({
        scanId: s.id,
        promptId: p.id,
        engine,
        runner: "api_search",
        fidelity: "medium",
        provider: "anthropic",
        regionId: region.id,
        drawIndex: 4,
        status: "error",
        answerText: "UNC Charlotte should be ignored because status is error",
        capturedAt: new Date(),
      });
      void i;
    }

    const sample = await selectBrandMatchedSample(db, { orgId, scanId: s.id, limit: 20 });
    expect(sample.length).toBe(12); // 6 engines × 2 brand-matched
    expect(sample.every((r) => r.answer.includes("UNC Charlotte"))).toBe(true);
    expect(sample.every((r) => !r.answer.includes("light rail"))).toBe(true);
    const counts = new Map<string, number>();
    for (const r of sample) counts.set(r.engine, (counts.get(r.engine) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 2)).toBe(true);
    expect(counts.size).toBe(6);
  });
});
