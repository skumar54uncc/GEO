import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as freezeRoute } from "@/app/api/campaigns/[id]/freeze/route";
import { POST as generateRoute } from "@/app/api/campaigns/[id]/prompts/generate/route";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import {
  auditLog,
  campaigns,
  organizations,
  personas,
  prompts,
  providerAccounts,
} from "@/lib/db/pg/schema";
import { assertWriterNotJudge, estimatePromptGenerate, runPromptGenerate } from "@/lib/prompts/generate";
import { createCustomPrompt } from "@/lib/prompts/custom";
import { fixtureEmbedder } from "@/lib/prompts/embeddings";
import { FreezeFixtureError, FreezeUnbrandedError, freezePromptSet } from "@/lib/promptSets";
import { cookieFor, req, resetDatabase } from "../helpers";

async function ensureProvider(orgId: string) {
  await getDb().insert(providerAccounts).values({
    orgId,
    provider: "prompt_generate",
    perRunCapUnits: 20,
    creditsRemaining: 20,
    creditUnitUsd: null,
  });
}

describe("P1c freeze fixture + unbranded", () => {
  beforeEach(resetDatabase);

  it("rejects fixture provenance outside the demo org and allows it inside demo", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);

    const [nonDemoCampaign] = await db
      .insert(campaigns)
      .values({ orgId: ctx.orgId, brandId: ctx.brandId, name: "Non-demo freeze", topic: "AI", status: "active" })
      .returning();
    await db.insert(prompts).values({
      campaignId: nonDemoCampaign.id,
      text: "What should I weigh when comparing graduate programs in this field?",
      status: "approved",
      branded: false,
      provenance: "fixture",
      intent: "discovery",
    });

    await expect(freezePromptSet(db, ctx.orgId, nonDemoCampaign.id)).rejects.toBeInstanceOf(FreezeFixtureError);
    await expect(freezePromptSet(db, ctx.orgId, nonDemoCampaign.id)).rejects.toThrow(/Fixture — cannot be frozen/);

    const cookie = await cookieFor("editor-freeze-fix@charlotte.edu", "editor");
    const blocked = await freezeRoute(
      req(`/api/campaigns/${nonDemoCampaign.id}/freeze`, { method: "POST", cookie, body: {} }),
      { params: { id: nonDemoCampaign.id } },
    );
    expect(blocked.status).toBe(400);
    const blockedBody = await blocked.json();
    expect(blockedBody.code).toBe("fixture_freeze_blocked");
    expect(blockedBody.error).toMatch(/Fixture — cannot be frozen/);

    const [demoOrg] = await db
      .insert(organizations)
      .values({ name: "Demo Freeze Org", slug: `demo-freeze-${Date.now()}`, isDemo: true })
      .returning();
    const { brands } = await import("@/lib/db/pg/schema");
    const [demoBrand] = await db
      .insert(brands)
      .values({ orgId: demoOrg.id, name: "Demo Brand", rootDomain: "demo-freeze.test" })
      .returning();
    const [demoCampaign] = await db
      .insert(campaigns)
      .values({ orgId: demoOrg.id, brandId: demoBrand.id, name: "Demo freeze", topic: "AI", status: "active" })
      .returning();
    await db.insert(prompts).values({
      campaignId: demoCampaign.id,
      text: "What should I weigh when comparing graduate programs in this field?",
      status: "approved",
      branded: false,
      provenance: "fixture",
      intent: "discovery",
    });
    const ok = await freezePromptSet(db, demoOrg.id, demoCampaign.id);
    expect(ok.created).toBe(true);
    expect(ok.itemCount).toBe(1);
  });

  it("enforces >=70% unbranded by default and audit-logs an override", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    const [campaign] = await db
      .insert(campaigns)
      .values({ orgId: ctx.orgId, brandId: ctx.brandId, name: "Unbranded gate", topic: "AI", status: "active" })
      .returning();

    // 1 unbranded / 4 total = 25% < 70%
    await db.insert(prompts).values([
      {
        campaignId: campaign.id,
        text: "Neutral prompt one for graduate program fit?",
        status: "approved",
        branded: false,
        provenance: "custom",
        intent: "discovery",
      },
      {
        campaignId: campaign.id,
        text: "Is UNC Charlotte strong in energy research?",
        status: "approved",
        branded: true,
        provenance: "custom",
        intent: "evaluation",
      },
      {
        campaignId: campaign.id,
        text: "Does UNCC offer AI majors worth applying to?",
        status: "approved",
        branded: true,
        provenance: "custom",
        intent: "comparison",
      },
      {
        campaignId: campaign.id,
        text: "Should I visit the University of North Carolina at Charlotte campus?",
        status: "approved",
        branded: true,
        provenance: "custom",
        intent: "decision",
      },
    ]);

    await expect(freezePromptSet(db, ctx.orgId, campaign.id)).rejects.toBeInstanceOf(FreezeUnbrandedError);

    const cookie = await cookieFor("editor-unbranded@charlotte.edu", "editor");
    const refused = await freezeRoute(
      req(`/api/campaigns/${campaign.id}/freeze`, { method: "POST", cookie, body: {} }),
      { params: { id: campaign.id } },
    );
    expect(refused.status).toBe(400);
    expect((await refused.json()).code).toBe("unbranded_share");

    const allowed = await freezeRoute(
      req(`/api/campaigns/${campaign.id}/freeze`, {
        method: "POST",
        cookie,
        body: { unbrandedOverrideReason: "Pilot exception for branded Energy pack review." },
      }),
      { params: { id: campaign.id } },
    );
    expect(allowed.status).toBe(200);
    const body = await allowed.json();
    expect(body.created).toBe(true);
    expect(body.unbrandedOverrideReason).toMatch(/Pilot exception/);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "prompt_set.freeze"));
    expect(audits.some((a) => JSON.stringify(a.after).includes("Pilot exception"))).toBe(true);
  });
});

describe("P1c live generation + writer≠judge", () => {
  beforeEach(resetDatabase);

  it("assertWriterNotJudge rejects matching models and estimate reports not connected without key", () => {
    const prevKey = process.env.FIREWORKS_API_KEY;
    const prevContent = process.env.CONTENT_MODEL;
    const prevJudge = process.env.JUDGE_MODEL;
    try {
      delete process.env.FIREWORKS_API_KEY;
      process.env.CONTENT_MODEL = "accounts/fireworks/models/writer-a";
      process.env.JUDGE_MODEL = "accounts/fireworks/models/judge-b";
      const est = estimatePromptGenerate({ campaignId: "00000000-0000-4000-8000-000000000099" });
      expect(est.liveConnected).toBe(false);
      expect(est.mode).toBe("fixture_only");

      process.env.FIREWORKS_API_KEY = "test-key";
      process.env.CONTENT_MODEL = "accounts/fireworks/models/same";
      process.env.JUDGE_MODEL = "accounts/fireworks/models/same";
      expect(() => assertWriterNotJudge()).toThrow(/differ/);
    } finally {
      if (prevKey === undefined) delete process.env.FIREWORKS_API_KEY;
      else process.env.FIREWORKS_API_KEY = prevKey;
      if (prevContent === undefined) delete process.env.CONTENT_MODEL;
      else process.env.CONTENT_MODEL = prevContent;
      if (prevJudge === undefined) delete process.env.JUDGE_MODEL;
      else process.env.JUDGE_MODEL = prevJudge;
    }
  });

  it("live path goes through cost guard, uses writer≠judge, and fixture stays available", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    await ensureProvider(ctx.orgId);
    const { ensureCanonicalPersonas } = await import("@/lib/personas/seed");
    await ensureCanonicalPersonas(db);
    const [campaign] = await db
      .insert(campaigns)
      .values({ orgId: ctx.orgId, brandId: ctx.brandId, name: "Live gen", topic: "Energy", status: "active" })
      .returning();

    const personaRows = await db.select({ id: personas.id, key: personas.key }).from(personas).limit(3);
    expect(personaRows.length).toBe(3);

    const prevKey = process.env.FIREWORKS_API_KEY;
    const prevContent = process.env.CONTENT_MODEL;
    const prevJudge = process.env.JUDGE_MODEL;
    try {
      process.env.FIREWORKS_API_KEY = "test-key";
      process.env.CONTENT_MODEL = "accounts/fireworks/models/writer-live-p1c";
      process.env.JUDGE_MODEL = "accounts/fireworks/models/judge-live-p1c";

      const request = {
        campaignId: campaign.id,
        personaIds: personaRows.map((p) => p.id),
        intents: ["discovery" as const],
      };
      const estimate = estimatePromptGenerate(request);
      expect(estimate.liveConnected).toBe(true);
      expect(estimate.writerModel).toBe("accounts/fireworks/models/writer-live-p1c");
      expect(estimate.writerModel).not.toBe(estimate.judgeModel);

      const chat = vi.fn(async () => ({
        ok: true,
        text: JSON.stringify({
          prompts: personaRows.map((p) => ({
            text: `What evidence should I check for energy programs as ${p.key}?`,
            personaId: p.id,
            intent: "discovery",
            provenance: "synthesized",
          })),
        }),
        error: null,
      }));

      const result = await runPromptGenerate(db, {
        orgId: ctx.orgId,
        request,
        approval: {
          paramsHash: estimate.paramsHash,
          units: estimate.units,
          priceUsd: null,
          acknowledgedUnknownPrice: true,
        },
        useLive: true,
        chat: chat as never,
      });
      expect(result.mode).toBe("live");
      expect(result.writerModel).toBe("accounts/fireworks/models/writer-live-p1c");
      expect(result.prompts.length).toBe(3);
      expect(result.prompts.every((p) => p.provenance === "synthesized")).toBe(true);
      expect(chat).toHaveBeenCalled();
      const modelArg = (chat.mock.calls as unknown as Array<[{ model?: string }]>)[0]?.[0];
      expect(modelArg?.model).toBe("accounts/fireworks/models/writer-live-p1c");
      expect(modelArg?.model).not.toBe(process.env.JUDGE_MODEL);

      // Fixture path still works without live.
      const cookie = await cookieFor("editor-live@charlotte.edu", "editor");
      delete process.env.FIREWORKS_API_KEY;
      const estRes = await generateRoute(
        req(`/api/campaigns/${campaign.id}/prompts/generate`, {
          method: "POST",
          cookie,
          body: { action: "estimate", request: { personaIds: request.personaIds, intents: request.intents } },
        }),
        { params: { id: campaign.id } },
      );
      const estJson = await estRes.json();
      expect(estJson.liveConnected).toBe(false);
      expect(estJson.fixture_label).toBe("fixture");
    } finally {
      if (prevKey === undefined) delete process.env.FIREWORKS_API_KEY;
      else process.env.FIREWORKS_API_KEY = prevKey;
      if (prevContent === undefined) delete process.env.CONTENT_MODEL;
      else process.env.CONTENT_MODEL = prevContent;
      if (prevJudge === undefined) delete process.env.JUDGE_MODEL;
      else process.env.JUDGE_MODEL = prevJudge;
    }
  });
});

describe("P1c dedupe similar-to + custom author", () => {
  beforeEach(resetDatabase);

  it("keeps near-duplicates with similar to: note and custom carries author + provenance", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    await ensureProvider(ctx.orgId);
    const [campaign] = await db
      .insert(campaigns)
      .values({ orgId: ctx.orgId, brandId: ctx.brandId, name: "Dedupe keep", topic: "AI", status: "active" })
      .returning();

    const existingText = "best universities for AI research in the southeast";
    const embedder = fixtureEmbedder(16);
    const [vec] = await embedder.embed([existingText]);
    await db.insert(prompts).values({
      campaignId: campaign.id,
      text: existingText,
      status: "draft",
      branded: false,
      provenance: "synthesized",
      intent: "discovery",
      embedding: vec,
      embeddingModel: "fixture",
      embeddingDimension: 16,
    });

    const result = await runPromptGenerate(db, {
      orgId: ctx.orgId,
      request: { campaignId: campaign.id },
      approval: {
        paramsHash: estimatePromptGenerate({ campaignId: campaign.id }).paramsHash,
        units: 1,
        priceUsd: null,
        acknowledgedUnknownPrice: true,
      },
      fixture: {
        prompts: [
          {
            text: existingText,
            intent: "discovery",
            provenance: "fixture",
          },
          {
            text: "how do I compare nursing programs for transfer students",
            intent: "comparison",
            provenance: "fixture",
          },
        ],
      },
      embedder,
    });

    expect(result.prompts).toHaveLength(2);
    expect(result.similar).toBe(1);
    const similar = result.prompts.find((p) => p.note?.startsWith("similar to:"));
    expect(similar).toBeTruthy();
    expect(similar!.note).toMatch(/similar to:/);

    const { users } = await import("@/lib/db/pg/schema");
    const [author] = await db
      .insert(users)
      .values({ email: `custom-author-${Date.now()}@charlotte.edu` })
      .returning();
    const custom = await createCustomPrompt(db, {
      orgId: ctx.orgId,
      campaignId: campaign.id,
      authorId: author.id,
      raw: {
        text: existingText,
        intent: "evaluation",
        persona_id: null,
        branded: false,
      },
      embedder,
    });
    expect(custom.provenance).toBe("custom");
    expect(custom.authorId).toBe(author.id);
    expect(custom.note).toMatch(/similar to:/);
  });
});
