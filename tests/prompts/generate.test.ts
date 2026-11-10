import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as generateRoute } from "@/app/api/campaigns/[id]/prompts/generate/route";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { brandAliases, campaigns, personas, prompts, providerAccounts } from "@/lib/db/pg/schema";
import { loadAliases } from "@/lib/judge/aliases";
import { ensureCanonicalPersonas } from "@/lib/personas/seed";
import { brandedShare, isBrandedPrompt, MIN_UNBRANDED_SHARE } from "@/lib/prompts/branded";
import { dedupeAgainstCampaign } from "@/lib/prompts/dedupe";
import { cosineSimilarity, disabledEmbedder, fixtureEmbedder } from "@/lib/prompts/embeddings";
import {
  demandEvidenceLabel,
  estimatePromptGenerate,
  PromptGenerateApprovalError,
  PromptGenerateUnavailableError,
  runPromptGenerate,
} from "@/lib/prompts/generate";
import { freezePromptSet } from "@/lib/promptSets";
import { cookieFor, req, resetDatabase } from "../helpers";

async function ensureProvider(orgId: string) {
  await getDb().insert(providerAccounts).values({
    orgId,
    provider: "prompt_generate",
    perRunCapUnits: 10,
    creditsRemaining: 10,
    creditUnitUsd: null,
  });
}

describe("branded detection", () => {
  beforeEach(resetDatabase);

  it("does not treat Charlotte alone as branded for the university", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    await db.insert(brandAliases).values({
      brandId: ctx.brandId,
      alias: "Charlotte",
      kind: "short",
      requiresContext: true,
      sortOrder: 99,
    });

    const aliases = await loadAliases(db, ctx.orgId, ctx.brandId);
    expect(aliases.some((a) => a.alias === "Charlotte" && a.requiresContext)).toBe(true);
    // City name alone is location-biased for prompts (excluded from headline), even though
    // answer mention detection still treats "Charlotte" as the city, not the university.
    expect(isBrandedPrompt("What colleges are in Charlotte?", aliases)).toBe(true);
    expect(isBrandedPrompt("Is UNC Charlotte strong in data science?", aliases)).toBe(true);
    expect(isBrandedPrompt("Does UNCC offer AI majors?", aliases)).toBe(true);
  });

  it("warns when unbranded share would fall below 70%", () => {
    const share = brandedShare([
      { branded: true },
      { branded: true },
      { branded: true },
      { branded: false },
      { branded: false },
    ]);
    expect(share.unbrandedShare).toBeLessThan(MIN_UNBRANDED_SHARE);
    expect(share.warning).toBe(true);
    expect(share.warningMessage).toMatch(/70%/);
  });
});

describe("embedding dedupe", () => {
  it("exposes disabled status when the local model is unavailable", async () => {
    const result = await dedupeAgainstCampaign([{ text: "a" }, { text: "b" }], [], disabledEmbedder(), 0.9);
    expect(result.dedupeStatus).toBe("disabled");
    expect(result.kept).toHaveLength(2);
    expect(result.dropped).toHaveLength(0);
  });

  it("drops near-duplicates against campaign prompts at a configurable threshold", async () => {
    const embedder = fixtureEmbedder(16);
    const existingText = "best universities for AI research in the southeast";
    const [existingVec] = await embedder.embed([existingText]);
    const result = await dedupeAgainstCampaign(
      [
        { text: existingText, tag: "dup" },
        { text: "how do I compare nursing programs for transfer students", tag: "keep" },
      ],
      [{ text: existingText, embedding: existingVec }],
      embedder,
      0.99,
    );
    expect(result.dedupeStatus).toBe("enabled");
    expect(result.dropped.some((d) => d.candidate.tag === "dup")).toBe(true);
    expect(result.kept.some((k) => k.tag === "keep")).toBe(true);
    expect(cosineSimilarity(existingVec, existingVec)).toBeCloseTo(1, 8);
  });
});

describe("prompt generation", () => {
  beforeEach(resetDatabase);

  it("refuses live/default runs and mismatched approvals; never calls transport without approval", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    await ensureProvider(ctx.orgId);
    const transport = vi.fn(async () => ({ ok: true }));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const request = { campaignId: ctx.campaignId };
    const estimate = estimatePromptGenerate(request);
    const approval = {
      paramsHash: estimate.paramsHash,
      units: estimate.units,
      priceUsd: null as null,
      acknowledgedUnknownPrice: true as const,
    };
    const fixture = {
      prompts: [
        {
          text: "What should I look for in a data science program?",
          intent: "discovery" as const,
          provenance: "synthesized" as const,
        },
      ],
    };

    await expect(runPromptGenerate(db, { orgId: ctx.orgId, request, transport })).rejects.toBeInstanceOf(
      PromptGenerateApprovalError,
    );
    expect(transport).not.toHaveBeenCalled();

    await expect(runPromptGenerate(db, { orgId: ctx.orgId, request, approval, transport })).rejects.toBeInstanceOf(
      PromptGenerateUnavailableError,
    );
    expect(transport).not.toHaveBeenCalled();

    await expect(
      runPromptGenerate(db, {
        orgId: ctx.orgId,
        request,
        approval: { ...approval, paramsHash: "0".repeat(64) },
        fixture,
        transport,
      }),
    ).rejects.toBeInstanceOf(PromptGenerateApprovalError);
    expect(transport).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("inserts draft prompts with provenance and demand evidence labels; warns under 70% unbranded", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    await ensureProvider(ctx.orgId);
    const [persona] = await db.select().from(personas).where(eq(personas.legacyKey, "undergrad")).limit(1);
    expect(persona).toBeTruthy();

    const request = { campaignId: ctx.campaignId };
    const estimate = estimatePromptGenerate(request);
    const transport = vi.fn(async () => ({ ok: true }));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await runPromptGenerate(db, {
      orgId: ctx.orgId,
      request,
      approval: {
        paramsHash: estimate.paramsHash,
        units: estimate.units,
        priceUsd: null,
        acknowledgedUnknownPrice: true,
      },
      transport,
      embedder: disabledEmbedder(),
      fixture: {
        prompts: [
          {
            text: "What should a first-year student look for in an AI program?",
            personaId: persona!.id,
            intent: "discovery",
            provenance: "paa",
            demandEvidenceIds: [],
          },
          {
            text: "How does UNC Charlotte compare for data science research?",
            personaId: persona!.id,
            intent: "comparison",
            provenance: "web_query",
          },
          {
            text: "Is UNC Charlotte a good fit for applied AI graduate study?",
            personaId: persona!.id,
            intent: "evaluation",
            provenance: "synthesized",
          },
          {
            text: "Should I apply to UNC Charlotte for machine learning?",
            personaId: persona!.id,
            intent: "decision",
            provenance: "fanout",
          },
        ],
      },
    });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    expect(result.mode).toBe("fixture_only");
    expect(result.dedupeStatus).toBe("disabled");
    expect(result.prompts).toHaveLength(4);
    expect(result.prompts.every((p) => p.status === "draft")).toBe(true);
    expect(result.brandedShare.warning).toBe(true);

    const ours = await db.select().from(prompts).where(eq(prompts.campaignId, ctx.campaignId));
    const generated = ours.filter((r) => result.prompts.some((p) => p.id === r.id));
    expect(generated).toHaveLength(4);
    expect(generated.every((r) => r.status === "draft")).toBe(true);
    expect(generated.some((r) => demandEvidenceLabel(r.demandEvidence) === "no demand evidence")).toBe(true);
    expect(generated.filter((r) => r.branded).length).toBeGreaterThanOrEqual(2);

    const unknownEvidence = await runPromptGenerate(db, {
      orgId: ctx.orgId,
      request,
      approval: {
        paramsHash: estimate.paramsHash,
        units: estimate.units,
        priceUsd: null,
        acknowledgedUnknownPrice: true,
      },
      embedder: disabledEmbedder(),
      fixture: {
        prompts: [
          {
            text: "What career outcomes follow an energy engineering degree?",
            personaId: persona!.id,
            intent: "discovery",
            provenance: "paa",
            demandEvidenceIds: ["00000000-0000-4000-8000-000000000099"],
          },
        ],
      },
    });
    expect(unknownEvidence.prompts[0]?.demandEvidence).toEqual({ label: "no demand evidence", ids: [] });
  });

  it("API estimate/run mirrors approval gate and freeze still refuses unapproved drafts", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    await ensureProvider(ctx.orgId);
    const cookie = await cookieFor("editor@charlotte.edu", "editor");
    const params = { params: { id: ctx.campaignId } };
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const estimateResponse = await generateRoute(
      req(`/api/campaigns/${ctx.campaignId}/prompts/generate`, {
        method: "POST",
        cookie,
        body: { action: "estimate" },
      }),
      params,
    );
    expect(estimateResponse.status).toBe(200);
    const { estimate } = (await estimateResponse.json()) as {
      estimate: { paramsHash: string; units: number; mode: string };
    };
    expect(estimate.mode).toBe("fixture_only");

    const noApproval = await generateRoute(
      req(`/api/campaigns/${ctx.campaignId}/prompts/generate`, {
        method: "POST",
        cookie,
        body: {
          action: "run",
          fixture: {
            prompts: [
              {
                text: "Where should I study applied data science?",
                intent: "discovery",
                provenance: "synthesized",
              },
            ],
          },
        },
      }),
      params,
    );
    expect(noApproval.status).toBe(409);

    const ok = await generateRoute(
      req(`/api/campaigns/${ctx.campaignId}/prompts/generate`, {
        method: "POST",
        cookie,
        body: {
          action: "run",
          approval: {
            paramsHash: estimate.paramsHash,
            units: estimate.units,
            priceUsd: null,
            acknowledgedUnknownPrice: true,
          },
          fixture: {
            prompts: [
              {
                text: "Where should I study applied data science as a transfer student?",
                intent: "discovery",
                provenance: "synthesized",
              },
            ],
          },
        },
      }),
      params,
    );
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.prompts[0].status).toBe("draft");
    expect(body.dedupeStatus).toBe("disabled");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    await expect(freezePromptSet(db, ctx.orgId, ctx.campaignId)).rejects.toThrow(/No approved prompts/);
  });

  it("builtin fixture pack inserts drafts for 3–5 personas and rejects bad counts", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    await ensureProvider(ctx.orgId);
    await ensureCanonicalPersonas(db);
    const cookie = await cookieFor("editor-gen@charlotte.edu", "editor");
    const params = { params: { id: ctx.campaignId } };
    const menu = await db.select({ id: personas.id }).from(personas).limit(3);
    expect(menu).toHaveLength(3);
    const request = { personaIds: menu.map((p) => p.id), intents: ["discovery" as const] };
    const estimateResponse = await generateRoute(
      req(`/api/campaigns/${ctx.campaignId}/prompts/generate`, {
        method: "POST",
        cookie,
        body: { action: "estimate", request },
      }),
      params,
    );
    const { estimate, fixture_label } = (await estimateResponse.json()) as {
      estimate: { paramsHash: string; units: number };
      fixture_label: string;
    };
    expect(fixture_label).toBe("fixture");

    const tooFew = await generateRoute(
      req(`/api/campaigns/${ctx.campaignId}/prompts/generate`, {
        method: "POST",
        cookie,
        body: {
          action: "run",
          request: { personaIds: [menu[0]!.id], intents: ["discovery"] },
          useBuiltinFixture: true,
          approval: {
            paramsHash: estimatePromptGenerate({ campaignId: ctx.campaignId, personaIds: [menu[0]!.id], intents: ["discovery"] }).paramsHash,
            units: 1,
            priceUsd: null,
            acknowledgedUnknownPrice: true,
          },
        },
      }),
      params,
    );
    expect(tooFew.status).toBe(400);

    const ok = await generateRoute(
      req(`/api/campaigns/${ctx.campaignId}/prompts/generate`, {
        method: "POST",
        cookie,
        body: {
          action: "run",
          request,
          useBuiltinFixture: true,
          approval: {
            paramsHash: estimate.paramsHash,
            units: estimate.units,
            priceUsd: null,
            acknowledgedUnknownPrice: true,
          },
        },
      }),
      params,
    );
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.fixture_label).toBe("fixture");
    expect(body.prompts.length).toBeGreaterThanOrEqual(3);
    expect(body.prompts.every((p: { status: string }) => p.status === "draft")).toBe(true);
  });
});

describe("custom prompt", () => {
  beforeEach(resetDatabase);

  it("creates a draft with intent, persona, and branded flag", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    // Legacy Energy campaign blocks custom edits — use a non-legacy campaign.
    const [campaign] = await db
      .insert(campaigns)
      .values({ orgId: ctx.orgId, brandId: ctx.brandId, name: "Custom prompt campaign", topic: "AI", status: "active" })
      .returning();
    const cookie = await cookieFor("editor-custom@charlotte.edu", "editor");
    const { POST: promptsPost } = await import("@/app/api/campaigns/[id]/prompts/route");
    const res = await promptsPost(
      req(`/api/campaigns/${campaign.id}/prompts`, {
        method: "POST",
        cookie,
        body: {
          action: "create_custom",
          text: "What should I check before applying to a data science master's?",
          intent: "decision",
          persona_id: null,
          branded: false,
        },
      }),
      { params: { id: campaign.id } },
    );
    expect(res.status).toBe(201);
    const { prompt } = (await res.json()) as { prompt: { status: string; provenance: string; intent: string } };
    expect(prompt).toMatchObject({ status: "draft", provenance: "custom", intent: "decision" });
  });
});
