import crypto from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { checkBudget } from "@/lib/cost/guard";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, personas, prompts } from "@/lib/db/pg/schema";
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

export type GenerateEstimate = {
  provider: typeof PROMPT_GENERATE_PROVIDER;
  mode: "fixture_only";
  capability: "unknown";
  priceUsd: null;
  units: number;
  paramsHash: string;
  available: true;
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
};

export type GenerateResult = {
  provider: typeof PROMPT_GENERATE_PROVIDER;
  mode: "fixture_only";
  capability: "unknown";
  priceUsd: null;
  paramsHash: string;
  prompts: GeneratedPromptRow[];
  dropped: number;
  dedupeStatus: DedupeStatus;
  brandedShare: ReturnType<typeof brandedShare>;
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
  return {
    provider: PROMPT_GENERATE_PROVIDER,
    mode: "fixture_only",
    capability: "unknown",
    priceUsd: null,
    units: 1,
    paramsHash,
    available: true,
  };
}

export function demandEvidencePayload(ids: string[] | undefined): DemandEvidencePayload {
  if (!ids || ids.length === 0) return { label: "no demand evidence", ids: [] };
  return { ids: [...ids] };
}

export function demandEvidenceLabel(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "no demand evidence";
  const row = payload as { label?: string; ids?: unknown };
  if (row.label === "no demand evidence") return "no demand evidence";
  if (Array.isArray(row.ids) && row.ids.length > 0) return `${row.ids.length} demand evidence id(s)`;
  return "no demand evidence";
}

/**
 * Fixture execution still uses the normal budget gate. Live/default execution is intentionally
 * unavailable in this wave. Optional `transport` is never invoked without matching approval;
 * tests spy on it (or fetch) to prove no paid call fires.
 */
export async function runPromptGenerate(
  db: Db,
  input: {
    orgId: string;
    request: GenerateRequest;
    approval?: GenerateApproval;
    fixture?: GenerateFixture;
    embedder?: Embedder;
    /** Injected paid transport. Must never be called without approval. */
    transport?: (args: { request: GenerateRequest; approval: GenerateApproval }) => Promise<unknown>;
  },
): Promise<GenerateResult> {
  const estimate = estimatePromptGenerate(input.request);
  if (!input.fixture) {
    throw new PromptGenerateUnavailableError(
      "Prompt generation live capability is unavailable; only an explicitly supplied test fixture can run.",
    );
  }
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
    throw new PromptGenerateApprovalError(budget.reason ?? "Cost guard refused the fixture run.");
  }

  // Paid transport only after approval + budget. Default path never calls it.
  if (input.transport) {
    await input.transport({ request: input.request, approval });
  }

  const [campaign] = await db
    .select({ id: campaigns.id, brandId: campaigns.brandId, orgId: campaigns.orgId, topic: campaigns.topic })
    .from(campaigns)
    .where(and(eq(campaigns.id, input.request.campaignId), eq(campaigns.orgId, input.orgId)));
  if (!campaign) throw new PromptGenerateValidationError("Campaign not found.");

  const aliases = await loadAliases(db, input.orgId, campaign.brandId);
  const threshold = input.request.cosineThreshold ?? DEFAULT_COSINE_THRESHOLD;
  const embedder = input.embedder ?? (await createLocalEmbedder());

  const personaRows = await db.select({ id: personas.id, key: personas.key }).from(personas);
  const byKey = new Map(personaRows.filter((p) => p.key).map((p) => [p.key!, p.id]));
  const byId = new Set(personaRows.map((p) => p.id));

  const intentsFilter = input.request.intents ? new Set(input.request.intents) : null;
  const personaFilter = input.request.personaIds ? new Set(input.request.personaIds) : null;

  type Cand = {
    text: string;
    personaId: string | null;
    intent: Intent;
    funnelStage: string;
    provenance: Provenance;
    demandEvidence: DemandEvidencePayload;
    branded: boolean;
  };

  const candidates: Cand[] = [];
  for (const item of input.fixture.prompts) {
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
      demandEvidence: demandEvidencePayload(item.demandEvidenceIds),
      branded: isBrandedPrompt(item.text, aliases),
    });
  }

  if (!candidates.length) {
    throw new PromptGenerateValidationError("Fixture produced no prompts after persona/intent filters.");
  }

  const existing = await db
    .select({ text: prompts.text, embedding: prompts.embedding })
    .from(prompts)
    .where(eq(prompts.campaignId, campaign.id));

  const deduped = await dedupeAgainstCampaign(candidates, existing, embedder, threshold);
  const share = brandedShare(deduped.kept);

  const inserted: GeneratedPromptRow[] = [];
  for (const row of deduped.kept) {
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
    });
  }

  // Guardrail: generation never auto-approves.
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

  return {
    provider: PROMPT_GENERATE_PROVIDER,
    mode: "fixture_only",
    capability: "unknown",
    priceUsd: null,
    paramsHash: estimate.paramsHash,
    prompts: inserted,
    dropped: deduped.dropped.length,
    dedupeStatus: deduped.dedupeStatus,
    brandedShare: share,
  };
}
