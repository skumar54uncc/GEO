import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as answerGet } from "@/app/api/answers/[id]/route";
import { GET as aggregatesGet } from "@/app/api/citations/aggregates/route";
import { POST as contentPost } from "@/app/api/content-analysis/route";
import { safeSpan } from "@/lib/analysis/answerExplorer";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import {
  brands,
  campaigns,
  citations,
  claims,
  draws,
  fanoutQueries,
  judgeRuns,
  mentions,
  organizations,
  prompts,
  providerAccounts,
  regions,
  scans,
} from "@/lib/db/pg/schema";
import { cookieFor, req, resetDatabase } from "./helpers";

const json = (response: Response) => response.json() as Promise<Record<string, any>>;

describe("Phase 6 answer explorer", () => {
  beforeEach(resetDatabase);

  it("returns org-scoped plain text and Unicode-safe UTF-16/code-point/byte spans", async () => {
    const db = getDb();
    const context = await legacyContext(db);
    const cookie = await cookieFor("viewer@charlotte.edu", "viewer");
    const [region] = await db.insert(regions).values({ label: "Phase 6 answer fixture" }).returning();
    const [prompt] = await db
      .insert(prompts)
      .values({ campaignId: context.campaignId, text: "Who stands out?", provenance: "custom", status: "approved" })
      .returning();
    const answer = `Café 🎓 says <script>alert("x")</script> UNC Charlotte leads.`;
    const start = answer.indexOf("UNC Charlotte");
    const [draw] = await db
      .insert(draws)
      .values({
        scanId: context.scanId,
        promptId: prompt.id,
        engine: "chatgpt",
        runner: "ui_provider",
        fidelity: "high",
        provider: "fixture",
        regionId: region.id,
        drawIndex: 1,
        status: "ok",
        answerText: answer,
        capturedAt: new Date(),
      })
      .returning();
    const [judge] = await db
      .insert(judgeRuns)
      .values({
        drawId: draw.id,
        judgeModel: "fixture",
        judgePromptVersion: "fixture-v1",
        rawOutput: "{}",
        sentiment: "positive",
        sentimentSpanStart: start,
        sentimentSpanEnd: start + "UNC Charlotte".length,
      })
      .returning();
    await db.insert(mentions).values({
      judgeRunId: judge.id,
      entityType: "brand",
      entityId: context.brandId,
      aliasMatched: "UNC Charlotte",
      spanStart: start,
      spanEnd: start + "UNC Charlotte".length,
      prominence: "body",
    });
    await db.insert(claims).values({
      judgeRunId: judge.id,
      text: "UNC Charlotte leads",
      spanStart: start,
      spanEnd: answer.indexOf(" leads") + " leads".length,
      verdict: "unverifiable",
    });
    await db.insert(citations).values({
      drawId: draw.id,
      url: "https://example.edu/source",
      canonicalUrl: "https://example.edu/source",
      domain: "example.edu",
      position: 1,
      linked: true,
      sourceClass: "editorial",
    });
    await db.insert(fanoutQueries).values({ drawId: draw.id, query: "best universities", source: "provider_field" });

    const response = await answerGet(req(`/api/answers/${draw.id}`, { cookie }), { params: { id: draw.id } });
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.answer).toMatchObject({ format: "plain_text", renderAs: "text_only", text: answer });
    expect(body.answer.escapedText).toContain("&lt;script&gt;");
    expect(body.answer.offsetsApplyTo).toBe("text");
    expect(body.answer).not.toHaveProperty("html");
    expect(body.mentions[0].span).toMatchObject({
      text: "UNC Charlotte",
      startUtf16: start,
      startCodePoint: Array.from(answer.slice(0, start)).length,
      startUtf8Byte: Buffer.byteLength(answer.slice(0, start)),
    });
    expect(body.mentions[0].span.startUtf8Byte).toBeGreaterThan(body.mentions[0].span.startUtf16);
    expect(body.fanoutQueries).toEqual([{ query: "best universities", source: "provider_field" }]);

    const emoji = answer.indexOf("🎓");
    expect(safeSpan(answer, emoji + 1, emoji + 2)).toBeNull();
    expect((await answerGet(req("/api/answers/00000000-0000-4000-8000-000000000000", { cookie }), {
      params: { id: "00000000-0000-4000-8000-000000000000" },
    })).status).toBe(404);

    const [otherOrg] = await db.insert(organizations).values({ name: "Other", slug: "other-phase6" }).returning();
    const [otherBrand] = await db
      .insert(brands)
      .values({ orgId: otherOrg.id, name: "Other University", rootDomain: "other.example", entityType: "university" })
      .returning();
    const [otherCampaign] = await db
      .insert(campaigns)
      .values({ orgId: otherOrg.id, brandId: otherBrand.id, name: "Other campaign" })
      .returning();
    const [otherPrompt] = await db
      .insert(prompts)
      .values({ campaignId: otherCampaign.id, text: "private", provenance: "custom" })
      .returning();
    const [otherScan] = await db
      .insert(scans)
      .values({ campaignId: otherCampaign.id, name: "private", status: "complete" })
      .returning();
    const [otherDraw] = await db
      .insert(draws)
      .values({
        scanId: otherScan.id,
        promptId: otherPrompt.id,
        engine: "chatgpt",
        runner: "ui_provider",
        fidelity: "high",
        provider: "fixture",
        regionId: region.id,
        drawIndex: 1,
        status: "ok",
        answerText: "private answer",
        capturedAt: new Date(),
      })
      .returning();
    expect((await answerGet(req(`/api/answers/${otherDraw.id}`, { cookie }), { params: { id: otherDraw.id } })).status).toBe(404);
  });
});

describe("Phase 6 citation aggregates", () => {
  beforeEach(resetDatabase);

  it("requires and enforces engine, runner, fidelity, and index boundaries without pooling", async () => {
    const db = getDb();
    const context = await legacyContext(db);
    const cookie = await cookieFor("viewer2@charlotte.edu", "viewer");
    const [region] = await db.insert(regions).values({ label: "Phase 6 aggregate fixture" }).returning();
    const [prompt] = await db
      .insert(prompts)
      .values({ campaignId: context.campaignId, text: "q", provenance: "custom", status: "approved" })
      .returning();
    const series = [
      ["chatgpt", "ui_provider", "high", "kept.edu"],
      ["chatgpt", "ui_provider", "high", "kept.edu"],
      ["chatgpt", "api_search", "medium", "wrong-runner.edu"],
      ["chatgpt", "ui_provider", "low", "wrong-fidelity.edu"],
      ["google_aio", "serp_provider", "high", "wrong-index.edu"],
    ] as const;
    for (let i = 0; i < series.length; i++) {
      const [engine, runner, fidelity, domain] = series[i];
      const [draw] = await db
        .insert(draws)
        .values({
          scanId: context.scanId,
          promptId: prompt.id,
          engine,
          runner,
          fidelity,
          provider: "fixture",
          regionId: region.id,
          drawIndex: i + 1,
          status: "ok",
          answerText: "answer",
          capturedAt: new Date(),
        })
        .returning();
      await db.insert(citations).values({
        drawId: draw.id,
        url: `https://${domain}/x`,
        domain,
        sourceClass: "editorial",
      });
    }
    const query = `campaign_id=${context.campaignId}&engine=chatgpt&runner=ui_provider&fidelity=high&index=chat`;
    const response = await aggregatesGet(req(`/api/citations/aggregates?${query}`, { cookie }));
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.boundary).toMatchObject({ engine: "chatgpt", runner: "ui_provider", fidelity: "high", index: "chat" });
    expect(body.n).toEqual({ citations: 2, drawsWithCitations: 2 });
    expect(body.domains).toHaveLength(1);
    expect(body.domains[0]).toMatchObject({ domain: "kept.edu", count: 2, n: 2, rate: 1 });
    expect(body.domains[0].ci95.low).toBeGreaterThan(0);
    expect(body.otherShare).toMatchObject({ sourceClass: "other", count: 0, n: 2, rate: 0 });
    expect(body.topUnclassifiedDomains).toEqual([]);

    const [otherDraw] = await db
      .insert(draws)
      .values({
        scanId: context.scanId,
        promptId: prompt.id,
        engine: "chatgpt",
        runner: "ui_provider",
        fidelity: "high",
        provider: "fixture",
        regionId: region.id,
        drawIndex: 99,
        status: "ok",
        answerText: "answer",
        capturedAt: new Date(),
      })
      .returning();
    await db.insert(citations).values({
      drawId: otherDraw.id,
      url: "https://unknown.example/x",
      domain: "unknown.example",
      sourceClass: "other",
    });
    const withOther = await json(await aggregatesGet(req(`/api/citations/aggregates?${query}`, { cookie })));
    expect(withOther.otherShare).toMatchObject({ sourceClass: "other", count: 1, n: 3, rate: 1 / 3 });
    expect(withOther.topUnclassifiedDomains[0]).toMatchObject({ domain: "unknown.example", count: 1, n: 3 });

    expect((await aggregatesGet(req(`/api/citations/aggregates?${query.replace("&runner=ui_provider", "")}`, { cookie }))).status).toBe(400);
    expect((await aggregatesGet(req(`/api/citations/aggregates?${query.replace("index=chat", "index=google")}`, { cookie }))).status).toBe(400);
  });
});

describe("fixture-only Content Analysis adapter", () => {
  beforeEach(resetDatabase);

  it("refuses default/live and mismatched approvals, then runs only an approved fixture without network", async () => {
    const db = getDb();
    const context = await legacyContext(db);
    const cookie = await cookieFor("editor@charlotte.edu", "editor");
    await db.insert(providerAccounts).values({
      orgId: context.orgId,
      provider: "content_analysis",
      perRunCapUnits: 1,
      creditsRemaining: 1,
      creditUnitUsd: null,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const request = {
      campaignId: context.campaignId,
      entityNames: ["UNC Charlotte"],
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    };
    const estimateResponse = await contentPost(
      req("/api/content-analysis", { method: "POST", cookie, body: { action: "estimate", request } }),
    );
    const estimate = (await json(estimateResponse)).estimate;
    expect(estimate).toMatchObject({ capability: "unknown", priceUsd: null, mode: "fixture_only", available: true });

    const approval = {
      paramsHash: estimate.paramsHash,
      units: estimate.units,
      priceUsd: null,
      acknowledgedUnknownPrice: true,
    };
    const noFixture = await contentPost(
      req("/api/content-analysis", { method: "POST", cookie, body: { action: "run", request, approval } }),
    );
    expect(noFixture.status).toBe(503);
    const fixture = {
      mentions: [
        {
          entityName: "UNC Charlotte",
          url: "https://news.example/item",
          title: "Fixture mention",
          publishedAt: null,
          sentiment: "neutral",
        },
      ],
    };
    const mismatch = await contentPost(
      req("/api/content-analysis", {
        method: "POST",
        cookie,
        body: { action: "run", request, fixture, approval: { ...approval, paramsHash: "0".repeat(64) } },
      }),
    );
    expect(mismatch.status).toBe(409);
    const ok = await contentPost(
      req("/api/content-analysis", { method: "POST", cookie, body: { action: "run", request, fixture, approval } }),
    );
    expect(ok.status).toBe(200);
    expect(await json(ok)).toMatchObject({ capability: "unknown", priceUsd: null, mode: "fixture_only", mentions: fixture.mentions });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    expect((await db.select().from(providerAccounts).where(eq(providerAccounts.provider, "content_analysis"))).length).toBe(1);
  });
});
