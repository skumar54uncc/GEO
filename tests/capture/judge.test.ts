import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { listPosition, matchAliases, prominenceAt, type AliasEntry } from "@/lib/judge/aliases";
import { JUDGE_V2_PROMPT_VERSION, judgeDraw, spanOf, validateJudge, type ChatFn } from "@/lib/judge/v2";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { claims, draws, judgeRuns, mentions, prompts, scans } from "@/lib/db/pg/schema";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { ensurePhase2Providers } from "@/lib/site/providerCall";
import { resetDatabase } from "../helpers";

const B = "00000000-0000-4000-8000-00000000000b";
const Q = "00000000-0000-4000-8000-00000000000a";
const U = "00000000-0000-4000-8000-00000000000c";
const N = "00000000-0000-4000-8000-00000000000d";

const UNCC: AliasEntry[] = [
  { alias: "UNC Charlotte", entityType: "brand", entityId: B, entityName: "UNC Charlotte", requiresContext: false },
  { alias: "University of North Carolina at Charlotte", entityType: "brand", entityId: B, entityName: "UNC Charlotte", requiresContext: false },
  { alias: "UNCC", entityType: "brand", entityId: B, entityName: "UNC Charlotte", requiresContext: false },
  { alias: "EPIC", entityType: "brand", entityId: B, entityName: "UNC Charlotte", requiresContext: false },
  { alias: "Charlotte", entityType: "brand", entityId: B, entityName: "UNC Charlotte", requiresContext: true },
  { alias: "Queens University of Charlotte", entityType: "competitor", entityId: Q, entityName: "Queens University of Charlotte", requiresContext: false },
  { alias: "University of North Carolina", entityType: "competitor", entityId: U, entityName: "UNC Chapel Hill", requiresContext: false },
  { alias: "NC State", entityType: "competitor", entityId: N, entityName: "NC State", requiresContext: false },
];

const brandHits = (text: string) => matchAliases(text, UNCC).filter((m) => m.entityType === "brand");

describe("alias matcher: Charlotte city traps", () => {
  const traps = [
    "Charlotte is the largest city in North Carolina.",
    "Many engineering firms are based in Charlotte, NC.",
    "Charlotte FC plays at Bank of America Stadium.",
    "Johnson C. Smith University in Charlotte is an HBCU.",
    "Central Piedmont Community College serves Charlotte.",
    "The Charlotte School of Law closed in 2017.",
    "Queens University of Charlotte offers small classes.",
    "Students describe an epic campus life at NC State.",
    "Charlotte's light rail connects uptown to University City.",
  ];
  for (const t of traps) {
    it(`no brand mention: ${t}`, () => {
      expect(brandHits(t)).toEqual([]);
    });
  }

  it("Queens University of Charlotte is the competitor, not the brand", () => {
    const m = matchAliases("Queens University of Charlotte offers small classes.", UNCC);
    expect(m.map((x) => x.entityName)).toEqual(["Queens University of Charlotte"]);
  });

  it("the full name beats the system name, and spans are exact", () => {
    const text = "Consider the University of North Carolina at Charlotte for power engineering.";
    const m = matchAliases(text, UNCC);
    expect(m).toHaveLength(1);
    expect(m[0].entityType).toBe("brand");
    expect(text.slice(m[0].start, m[0].end)).toBe("University of North Carolina at Charlotte");
  });

  it("finds real mentions, case insensitive for names, case sensitive for acronyms", () => {
    const text = "unc charlotte runs EPIC; UNCC students also use the Charlotte light rail.";
    const m = brandHits(text);
    expect(m.map((x) => x.text)).toEqual(["unc charlotte", "EPIC", "UNCC"]);
  });

  it("list position and prominence", () => {
    const text = "Top programs in North Carolina:\n\n1. NC State - large program\n2. UNC Charlotte - EPIC research\n3. Duke\n\nSources:\n- UNC Charlotte site";
    const m = brandHits(text);
    expect(listPosition(text, m[0].start)).toBe(2);
    expect(prominenceAt(text, m[0].start)).toBe("body");
    expect(prominenceAt(text, text.lastIndexOf("UNC Charlotte"))).toBe("footnote_only");
    expect(prominenceAt("UNC Charlotte leads in grid research.", 0)).toBe("headline");
  });
});

describe("judge output validation and spans", () => {
  it("rejects invalid JSON, unknown keys, and missing keys", () => {
    expect(validateJudge("not json", ["brand"]).errors[0]).toMatch(/not valid JSON/);
    const wrongKey = JSON.stringify({ entities: [{ key: "Duke", sentiment: "positive", sentiment_quote: null }], claims: [], named_sources: [], possible_mentions: [] });
    expect(validateJudge(wrongKey, ["brand"]).errors.join(" ")).toMatch(/not one of the given keys/);
    expect(validateJudge(wrongKey, ["brand"]).errors.join(" ")).toMatch(/missing keys: brand/);
    const ok = JSON.stringify({ entities: [{ key: "brand", sentiment: "positive", sentiment_quote: "strong" }], claims: [], named_sources: [], possible_mentions: [] });
    expect(validateJudge("```json\n" + ok + "\n```", ["brand"]).value?.entities[0].sentiment).toBe("positive");
  });

  it("spans come from exact quotes; a quote not in the text has no span", () => {
    expect(spanOf("UNC Charlotte has a strong power program.", "strong power program")).toEqual({ start: 20, end: 40 });
    expect(spanOf("abc", "zzz")).toBeNull();
  });
});

describe("judgeDraw", () => {
  beforeEach(resetDatabase);

  async function seedDraw(answer: string) {
    const db = getDb();
    const { orgId, campaignId } = await legacyContext(db);
    await ensurePhase2Providers(db, orgId);
    const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
    const [p] = await db.insert(prompts).values({ campaignId, text: "power engineering in NC", provenance: "custom", status: "approved" }).returning();
    const [s] = await db.insert(scans).values({ campaignId, name: "j", kind: "capture_test", status: "complete" }).returning();
    const [d] = await db
      .insert(draws)
      .values({ scanId: s.id, promptId: p.id, engine: "claude", runner: "api_search", fidelity: "medium", provider: "anthropic", regionId: region.id, drawIndex: 1, status: "ok", answerText: answer, capturedAt: new Date() })
      .returning();
    return { db, orgId, drawId: d.id };
  }

  const answer = "1. NC State has the largest program.\n2. UNC Charlotte has a strong power program through EPIC.\n\nCharlotte is a growing energy hub.";

  it("repair path: first output invalid, one repair, both raw outputs stored, deterministic mentions recorded", async () => {
    const { db, orgId, drawId } = await seedDraw(answer);
    const calls: string[] = [];
    const chat: ChatFn = async ({ user }) => {
      calls.push(user);
      if (calls.length === 1) return { ok: true, text: "{ not json", error: null };
      return {
        ok: true,
        text: JSON.stringify({
          entities: [
            { key: "brand", sentiment: "positive", sentiment_quote: "has a strong power program" },
            { key: "NC State", sentiment: "neutral", sentiment_quote: null },
          ],
          claims: [{ about: "brand", quote: "has a strong power program through EPIC" }],
          named_sources: [],
          possible_mentions: [],
        }),
        error: null,
      };
    };
    const res = await judgeDraw(db, drawId, { orgId, aliases: UNCC, chat, model: "test-judge" });
    expect(res.ok).toBe(true);
    expect(res.repairUsed).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("not valid JSON");

    const [run] = await db.select().from(judgeRuns).where(eq(judgeRuns.drawId, drawId));
    expect(run.judgePromptVersion).toBe(JUDGE_V2_PROMPT_VERSION);
    expect(JSON.parse(run.rawOutput).map((o: { step: string }) => o.step)).toEqual(["first", "repair"]);
    expect(run.sentiment).toBe("positive");
    expect(answer.slice(run.sentimentSpanStart!, run.sentimentSpanEnd!)).toBe("has a strong power program");

    const ms = await db.select().from(mentions).where(eq(mentions.judgeRunId, run.id));
    const brand = ms.find((m) => m.entityType === "brand")!;
    expect(brand).toMatchObject({ aliasMatched: "UNC Charlotte", listPosition: 2, prominence: "first_paragraph" });
    expect(answer.slice(brand.spanStart!, brand.spanEnd!)).toBe("UNC Charlotte");
    expect(ms).toHaveLength(2);
    const cl = await db.select().from(claims).where(eq(claims.judgeRunId, run.id));
    expect(cl[0].verdict).toBe("unverifiable");
    expect(cl[0].spanStart).toBe(answer.indexOf("has a strong"));

    expect((await judgeDraw(db, drawId, { orgId, aliases: UNCC, chat })).skipped).toMatch(/already judged/);
  });

  it("two invalid outputs: error recorded, no third call, mentions still recorded", async () => {
    const { db, orgId, drawId } = await seedDraw(answer);
    let n = 0;
    const chat: ChatFn = async () => (n++, { ok: true, text: "[]", error: null });
    const res = await judgeDraw(db, drawId, { orgId, aliases: UNCC, chat, model: "test-judge" });
    expect(n).toBe(2);
    expect(res.ok).toBe(false);
    const [run] = await db.select().from(judgeRuns).where(eq(judgeRuns.drawId, drawId));
    expect(run.error).toMatch(/object/);
    expect(run.parsed).toBeNull();
    expect(await db.select().from(mentions).where(eq(mentions.judgeRunId, run.id))).toHaveLength(2);
  });

  it("an answer that only mentions the city calls no model and records no brand mention", async () => {
    const { db, orgId, drawId } = await seedDraw("Charlotte is a growing energy hub with many utilities.");
    let n = 0;
    const res = await judgeDraw(db, drawId, { orgId, aliases: UNCC, chat: async () => (n++, { ok: true, text: "{}", error: null }) });
    expect(n).toBe(0);
    expect(res.ok).toBe(true);
    const [run] = await db.select().from(judgeRuns).where(eq(judgeRuns.drawId, drawId));
    expect(run.judgeModel).toBe("deterministic");
    expect(run.sentiment).toBe("none");
    expect(await db.select().from(mentions)).toHaveLength(0);
  });
});
