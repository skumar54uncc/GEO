import crypto from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { checkBudget, recordCall } from "@/lib/cost/guard";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, demandSignals, personas, prompts } from "@/lib/db/pg/schema";
import { contentModel, fireworksChat, judgeModel, WriterModelConfigError } from "@/lib/fireworks";
import { ledgerUnitsFromUsage } from "@/lib/judge/v2";
import { loadAliases } from "@/lib/judge/aliases";
import { brandedShare, isBrandedPrompt } from "@/lib/prompts/branded";
import { dedupeAgainstCampaign } from "@/lib/prompts/dedupe";
import {
  createLocalEmbedder,
  DEFAULT_COSINE_THRESHOLD,
  type DedupeStatus,
  type Embedder,
} from "@/lib/prompts/embeddings";

export const PROMPT_GENERATE_PROVIDER = "prompt_generate";

export const provenanceValues = [
  "observed_ai_log",
  "web_query",
  "paa",
  "fanout",
  "synthesized",
  "custom",
  "fixture",
] as const;

export const intentValues = ["discovery", "comparison", "evaluation", "decision"] as const;

export type Provenance = (typeof provenanceValues)[number];
export type Intent = (typeof intentValues)[number];

export const generateRequestSchema = z.object({
  campaignId: z.string().uuid(),
  personaIds: z.array(z.string().uuid()).optional(),
  intents: z.array(z.enum(intentValues)).optional(),
  /** Cosine threshold for embedding dedupe. */
  cosineThreshold: z.number().min(0).max(1).optional(),
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export const generateFixturePromptSchema = z.object({
  text: z.string().trim().min(1).max(8000),
  personaId: z.string().uuid().nullable().optional(),
  personaKey: z.string().trim().min(1).optional(),
  intent: z.enum(intentValues),
  funnelStage: z.string().trim().min(1).max(64).optional(),
  provenance: z.enum(provenanceValues),
  /** Demand signal ids. Omit or empty => labeled "no demand evidence". */
  demandEvidenceIds: z.array(z.string().uuid()).optional(),
});

export const generateFixtureSchema = z.object({
  prompts: z.array(generateFixturePromptSchema).min(1).max(200),
});

export type GenerateFixture = z.infer<typeof generateFixtureSchema>;

export type GenerateMode = "fixture_only" | "live";

export type GenerateEstimate = {
  provider: typeof PROMPT_GENERATE_PROVIDER;
  mode: GenerateMode;
  capability: "unknown" | "available";
  priceUsd: null;
  units: number;
  paramsHash: string;
  available: true;
  /** True when FIREWORKS_API_KEY is set. */
  liveConnected: boolean;
  /** Resolved writer model when live; null when not connected / not configured. */
  writerModel: string | null;
  judgeModel: string;
};

export type GenerateApproval = {
  paramsHash: string;
  units: number;
  priceUsd: null;
  acknowledgedUnknownPrice: true;
};

export type DemandEvidencePayload =
  | { label: "no demand evidence"; ids: [] }
  | { ids: string[]; label?: undefined };

export type GeneratedPromptRow = {
  id: string;
  text: string;
  personaId: string | null;
  intent: Intent;
  funnelStage: string | null;
  branded: boolean;
  provenance: Provenance;
  demandEvidence: DemandEvidencePayload;
  status: "draft";
  note: string | null;
};

export type GenerateResult = {
  provider: typeof PROMPT_GENERATE_PROVIDER;
  mode: GenerateMode;
  capability: "unknown" | "available";
  priceUsd: null;
  paramsHash: string;
  prompts: GeneratedPromptRow[];
  /** Count of near-duplicates kept with a "similar to:" note (never silently dropped). */
  similar: number;
  /** @deprecated alias of `similar` for older clients. */
  dropped: number;
  dedupeStatus: DedupeStatus;
  brandedShare: ReturnType<typeof brandedShare>;
  writerModel: string | null;
};

export class PromptGenerateUnavailableError extends Error {}
export class PromptGenerateApprovalError extends Error {}
export class PromptGenerateValidationError extends Error {}

const INTENT_FUNNEL: Record<Intent, string> = {
  discovery: "awareness",
  comparison: "consideration",
  evaluation: "consideration",
  decision: "decision",
};

export function similarToNote(matchedText: string): string {
  const clipped = matchedText.replace(/\s+/g, " ").trim().slice(0, 240);
  return `similar to: ${clipped}`;
}

export function isSimilarToNote(note: string | null | undefined): boolean {
  return Boolean(note && /^similar to:/i.test(note.trim()));
}

/** Live path needs Fireworks key + a writer model distinct from the judge. */
export function liveGenerationConnected(): boolean {
  return Boolean(process.env.FIREWORKS_API_KEY?.trim());
}

/**
 * Asserts CONTENT_MODEL is set and differs from JUDGE_MODEL.
 * Used by the live generation path (writer never judges visibility).
 */
export function assertWriterNotJudge(): string {
  const writer = contentModel();
  const judge = judgeModel();
  if (writer === judge) {
    throw new WriterModelConfigError("CONTENT_MODEL must differ from JUDGE_MODEL.");
  }
  return writer;
}

function normalized(request: GenerateRequest): GenerateRequest {
  return {
    campaignId: request.campaignId,
    personaIds: request.personaIds ? [...request.personaIds].sort() : undefined,
    intents: request.intents ? [...request.intents].sort() : undefined,
    cosineThreshold: request.cosineThreshold,
  };
}

export function estimatePromptGenerate(request: GenerateRequest): GenerateEstimate {
  const paramsHash = crypto.createHash("sha256").update(JSON.stringify(normalized(request))).digest("hex");
  const connected = liveGenerationConnected();
  let writerModel: string | null = null;
  if (connected) {
    try {
      writerModel = assertWriterNotJudge();
    } catch {
      writerModel = null;
    }
  }
  const liveReady = connected && writerModel !== null;
  return {
    provider: PROMPT_GENERATE_PROVIDER,
    mode: liveReady ? "live" : "fixture_only",
    capability: liveReady ? "available" : "unknown",
    priceUsd: null,
    units: 1,
    paramsHash,
    available: true,
    liveConnected: connected,
    writerModel,
    judgeModel: judgeModel(),
  };
}

export function demandEvidencePayload(ids: string[] | undefined): DemandEvidencePayload {
  if (!ids || ids.length === 0) return { label: "no demand evidence", ids: [] };
  return { ids: [...ids] };
}

/** Keeps only demand_signals ids that belong to this campaign. Unknown ids are dropped. */
export async function verifiedDemandEvidence(
  db: Db,
  campaignId: string,
  ids: string[] | undefined,
): Promise<DemandEvidencePayload> {
  if (!ids || ids.length === 0) return { label: "no demand evidence", ids: [] };
  const unique = [...new Set(ids)];
  const rows = await db
    .select({ id: demandSignals.id })
    .from(demandSignals)
    .where(and(eq(demandSignals.campaignId, campaignId), inArray(demandSignals.id, unique)));
  if (!rows.length) return { label: "no demand evidence", ids: [] };
  return { ids: rows.map((row) => row.id) };
}

export function demandEvidenceLabel(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "no demand evidence";
  const row = payload as { label?: string; ids?: unknown };
  if (row.label === "no demand evidence") return "no demand evidence";
  if (Array.isArray(row.ids) && row.ids.length > 0) return `${row.ids.length} demand evidence id(s)`;
  return "no demand evidence";
}

type Cand = {
  text: string;
  personaId: string | null;
  intent: Intent;
  funnelStage: string;
  provenance: Provenance;
  demandEvidence: DemandEvidencePayload;
  branded: boolean;
  note: string | null;
};

async function resolveCandidatesFromFixture(
  db: Db,
  campaign: { id: string; brandId: string },
  orgId: string,
  request: GenerateRequest,
  fixture: GenerateFixture,
): Promise<Cand[]> {
  const aliases = await loadAliases(db, orgId, campaign.brandId);
  const personaRows = await db.select({ id: personas.id, key: personas.key }).from(personas);
  const byKey = new Map(personaRows.filter((p) => p.key).map((p) => [p.key!, p.id]));
  const byId = new Set(personaRows.map((p) => p.id));

  const intentsFilter = request.intents ? new Set(request.intents) : null;
  const personaFilter = request.personaIds ? new Set(request.personaIds) : null;

  const candidates: Cand[] = [];
  for (const item of fixture.prompts) {
    if (intentsFilter && !intentsFilter.has(item.intent)) continue;
    let personaId: string | null = item.personaId ?? null;
    if (personaId === null && item.personaKey) {
      personaId = byKey.get(item.personaKey) ?? null;
      if (!personaId) throw new PromptGenerateValidationError(`Unknown persona key: ${item.personaKey}`);
    }
    if (personaId && !byId.has(personaId)) {
      throw new PromptGenerateValidationError(`Unknown persona id: ${personaId}`);
    }
    if (personaFilter && personaId && !personaFilter.has(personaId)) continue;
    if (personaFilter && !personaId) continue;

    candidates.push({
      text: item.text.trim(),
      personaId,
      intent: item.intent,
      funnelStage: item.funnelStage ?? INTENT_FUNNEL[item.intent],
      provenance: item.provenance,
      demandEvidence: await verifiedDemandEvidence(db, campaign.id, item.demandEvidenceIds),
      branded: isBrandedPrompt(item.text, aliases),
      note: null,
    });
  }
  return candidates;
}

/**
 * Live Fireworks writer: generates draft prompts as JSON. Writer model must differ from judge.
 * Records real usage tokens in cost_ledger (estimate only for the pre-call budget check upstream).
 */
export async function generateLiveFixture(
  opts: {
    db: Db;
    orgId: string;
    topic: string;
    personas: Array<{ id: string; key: string | null; opening: string | null }>;
    intents: Intent[];
    chat?: typeof fireworksChat;
  },
): Promise<GenerateFixture> {
  const writer = assertWriterNotJudge();
  const judge = judgeModel();
  if (writer === judge) {
    throw new WriterModelConfigError("CONTENT_MODEL must differ from JUDGE_MODEL.");
  }

  const personaLines = opts.personas
    .map((p) => `- id=${p.id} key=${p.key ?? "none"} opening=${JSON.stringify(p.opening ?? "")}`)
    .join("\n");
  const system = `You draft measurement prompts for an AI search visibility study.
Return JSON: {"prompts":[{"text":"...","personaId":"<uuid or null>","intent":"discovery|comparison|evaluation|decision","provenance":"synthesized"}]}.
Rules: never name a specific university or brand alias in the prompt text; use persona openings as voice only; one prompt per persona×intent; provenance is always "synthesized".`;
  const user = `Topic: ${opts.topic || "higher education programs"}
Intents: ${opts.intents.join(", ")}
Personas:
${personaLines}`;

  const estimatedUnits = Math.ceil((system.length + user.length) / 4) + 800;
  const chat = opts.chat ?? fireworksChat;
  const res = await chat({ model: writer, system, user, temperature: 0.2, json: true });
  const usage = ledgerUnitsFromUsage(res.promptTokens, res.completionTokens);
  await recordCall(opts.db, {
    orgId: opts.orgId,
    provider: "fireworks",
    units: usage ?? estimatedUnits,
    ok: res.ok,
    engine: "prompt_generate",
    error: res.error,
    usageEstimated: usage === null,
  });
  if (!res.ok) {
    throw new PromptGenerateUnavailableError(res.error ?? "Live generation failed.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    throw new PromptGenerateValidationError("Live writer returned non-JSON.");
  }
  const shaped = generateFixtureSchema.safeParse(parsed);
  if (!shaped.success) {
    throw new PromptGenerateValidationError("Live writer JSON did not match the prompt fixture schema.");
  }
  // Live drafts are synthesized (not fixture provenance) so non-demo orgs can freeze after review.
  return {
    prompts: shaped.data.prompts.map((p) => ({
      ...p,
      provenance: "synthesized" as const,
    })),
  };
}

/**
 * Estimate → approval → cost guard. Fixture path always available.
 * Live path requires FIREWORKS_API_KEY + CONTENT_MODEL ≠ JUDGE_MODEL.
 * Near-duplicates are kept with a "similar to:" note — never silently dropped.
 */
export async function runPromptGenerate(
  db: Db,
  input: {
    orgId: string;
    request: GenerateRequest;
    approval?: GenerateApproval;
    fixture?: GenerateFixture;
    /** When true and connected, call the Fireworks writer (fixture still wins if supplied). */
    useLive?: boolean;
    embedder?: Embedder;
    /** Injected paid transport. Must never be called without approval. */
    transport?: (args: { request: GenerateRequest; approval: GenerateApproval }) => Promise<unknown>;
    chat?: typeof fireworksChat;
  },
): Promise<GenerateResult> {
  const estimate = estimatePromptGenerate(input.request);
  const approval = input.approval;
  if (
    !approval ||
    approval.paramsHash !== estimate.paramsHash ||
    approval.units !== estimate.units ||
    approval.priceUsd !== null ||
    approval.acknowledgedUnknownPrice !== true
  ) {
    throw new PromptGenerateApprovalError("Explicit approval must exactly match the current estimate.");
  }

  const budget = await checkBudget(db, input.orgId, PROMPT_GENERATE_PROVIDER, {
    units: estimate.units,
    uncachedUnits: estimate.units,
    usd: null,
  });
  if (!budget.allowed) {
    throw new PromptGenerateApprovalError(budget.reason ?? "Cost guard refused the generation run.");
  }

  const [campaign] = await db
    .select({ id: campaigns.id, brandId: campaigns.brandId, orgId: campaigns.orgId, topic: campaigns.topic })
    .from(campaigns)
    .where(and(eq(campaigns.id, input.request.campaignId), eq(campaigns.orgId, input.orgId)));
  if (!campaign) throw new PromptGenerateValidationError("Campaign not found.");

  let mode: GenerateMode = "fixture_only";
  let writerModel: string | null = null;
  let fixture = input.fixture;

  if (!fixture && input.useLive) {
    if (!liveGenerationConnected()) {
      throw new PromptGenerateUnavailableError("Live generation is not connected (FIREWORKS_API_KEY missing).");
    }
    writerModel = assertWriterNotJudge();
    const personaIds = input.request.personaIds ?? [];
    if (personaIds.length < 3 || personaIds.length > 5) {
      throw new PromptGenerateValidationError("Pick 3 to 5 personas for generation.");
    }
    const intents = (input.request.intents?.length
      ? input.request.intents
      : (["discovery", "comparison", "evaluation", "decision"] as Intent[])) as Intent[];
    const rows = await db
      .select({ id: personas.id, key: personas.key, draftPrefix: personas.draftPrefix })
      .from(personas)
      .where(inArray(personas.id, personaIds));
    if (rows.length !== personaIds.length) {
      throw new PromptGenerateValidationError("One or more personas were not found.");
    }
    fixture = await generateLiveFixture({
      db: input.db,
      orgId: input.orgId,
      topic: campaign.topic,
      personas: rows.map((r) => ({ id: r.id, key: r.key, opening: r.draftPrefix })),
      intents,
      chat: input.chat,
    });
    mode = "live";
  }

  if (!fixture) {
    throw new PromptGenerateUnavailableError(
      "Prompt generation live capability is unavailable; supply a fixture or enable live generation.",
    );
  }

  // Paid transport only after approval + budget + a resolved fixture/live payload.
  if (input.transport) {
    await input.transport({ request: input.request, approval });
  }

  const candidates = await resolveCandidatesFromFixture(db, campaign, input.orgId, input.request, fixture);
  if (!candidates.length) {
    throw new PromptGenerateValidationError("Fixture produced no prompts after persona/intent filters.");
  }

  const threshold = input.request.cosineThreshold ?? DEFAULT_COSINE_THRESHOLD;
  const embedder = input.embedder ?? (await createLocalEmbedder());

  const existing = await db
    .select({ text: prompts.text, embedding: prompts.embedding })
    .from(prompts)
    .where(eq(prompts.campaignId, campaign.id));

  const deduped = await dedupeAgainstCampaign(candidates, existing, embedder, threshold);

  // Never silently drop: keep near-duplicates with a reviewer-visible "similar to:" note.
  const toInsert: Array<Cand & { embedding?: number[] }> = [
    ...deduped.kept.map((row) => ({ ...row, note: row.note ?? null })),
    ...deduped.dropped.map((d) => ({
      ...d.candidate,
      embedding: undefined as number[] | undefined,
      note: similarToNote(d.matchedText),
    })),
  ];

  const share = brandedShare(toInsert);

  const inserted: GeneratedPromptRow[] = [];
  for (const row of toInsert) {
    const [created] = await db
      .insert(prompts)
      .values({
        campaignId: campaign.id,
        text: row.text,
        personaId: row.personaId,
        intent: row.intent,
        funnelStage: row.funnelStage,
        branded: row.branded,
        provenance: row.provenance,
        demandEvidence: row.demandEvidence,
        status: "draft",
        note: row.note,
        embedding: row.embedding ?? null,
        embeddingModel: row.embedding ? embedder.model : null,
        embeddingDimension: row.embedding ? embedder.dimension : null,
      })
      .returning({
        id: prompts.id,
        text: prompts.text,
        personaId: prompts.personaId,
        intent: prompts.intent,
        funnelStage: prompts.funnelStage,
        branded: prompts.branded,
        provenance: prompts.provenance,
        demandEvidence: prompts.demandEvidence,
        status: prompts.status,
        note: prompts.note,
      });

    inserted.push({
      id: created.id,
      text: created.text,
      personaId: created.personaId,
      intent: created.intent as Intent,
      funnelStage: created.funnelStage,
      branded: created.branded,
      provenance: created.provenance as Provenance,
      demandEvidence: created.demandEvidence as DemandEvidencePayload,
      status: "draft",
      note: created.note,
    });
  }

  if (inserted.some((p) => p.status !== "draft")) {
    throw new PromptGenerateValidationError("Generated prompts must remain draft.");
  }
  if (inserted.length) {
    const statuses = await db
      .select({ status: prompts.status })
      .from(prompts)
      .where(
        inArray(
          prompts.id,
          inserted.map((p) => p.id),
        ),
      );
    if (statuses.some((s) => s.status !== "draft")) {
      throw new PromptGenerateValidationError("Generated prompts must remain draft.");
    }
  }

  const similar = deduped.dropped.length;
  return {
    provider: PROMPT_GENERATE_PROVIDER,
    mode,
    capability: mode === "live" ? "available" : "unknown",
    priceUsd: null,
    paramsHash: estimate.paramsHash,
    prompts: inserted,
    similar,
    dropped: similar,
    dedupeStatus: deduped.dedupeStatus,
    brandedShare: share,
    writerModel: mode === "live" ? writerModel : null,
  };
}
