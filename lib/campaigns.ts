import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit, type SessionUser } from "./auth";
import type { Db } from "./db/pg/client";
import {
  brands,
  campaignEngines,
  campaignPersonas,
  campaignRegions,
  campaigns,
  engineEnum,
  personas,
  prompts,
  promptSets,
  regions,
  runnerEnum,
} from "./db/pg/schema";

export const ENGINES = engineEnum.enumValues;
export const RUNNERS = runnerEnum.enumValues;

/** Planned primary runner per engine (ARCHITECTURE 5.2). Provider availability is verified in Phase 3. */
export const DEFAULT_RUNNER: Record<(typeof ENGINES)[number], (typeof RUNNERS)[number]> = {
  google_aio: "serp_provider",
  google_ai_mode: "serp_provider",
  chatgpt: "ui_provider",
  perplexity: "ui_provider",
  gemini: "ui_provider",
  claude: "api_search",
};

const engineSel = z.object({ engine: z.enum(ENGINES), runner: z.enum(RUNNERS) });

export const campaignInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  topic: z.string().trim().max(500).default(""),
  status: z.enum(["draft", "active", "archived"]).optional(),
  engines: z.array(engineSel).max(60).optional(),
  region_ids: z.array(z.string().uuid()).max(50).optional(),
  persona_ids: z.array(z.string().uuid()).max(50).optional(),
});
export type CampaignInput = z.infer<typeof campaignInput>;
export const campaignPatch = campaignInput.partial();

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

export type CampaignView = {
  id: string;
  name: string;
  topic: string;
  status: string;
  legacy: boolean;
  created_at: string;
  updated_at: string;
  engines: Array<{ engine: string; runner: string }>;
  regions: Array<{ id: string; label: string }>;
  personas: Array<{ id: string; name: string }>;
  prompt_count: number;
  approved_count: number;
  prompt_sets: Array<{ id: string; version: number; sha256: string | null; frozen_at: string | null }>;
};

export async function listCampaigns(db: Db, orgId: string, opts: { includeArchived?: boolean } = {}) {
  const rows = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      opts.includeArchived
        ? eq(campaigns.orgId, orgId)
        : and(eq(campaigns.orgId, orgId), sql`${campaigns.status} <> 'archived'`),
    )
    .orderBy(asc(campaigns.createdAt));
  const out: CampaignView[] = [];
  for (const r of rows) out.push(await getCampaign(db, orgId, r.id));
  return out;
}

export async function getCampaign(db: Db, orgId: string, id: string): Promise<CampaignView> {
  const [c] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.orgId, orgId)));
  if (!c) throw new NotFoundError("Campaign not found.");
  const engines = await db
    .select({ engine: campaignEngines.engine, runner: campaignEngines.runner })
    .from(campaignEngines)
    .where(eq(campaignEngines.campaignId, id))
    .orderBy(asc(campaignEngines.engine), asc(campaignEngines.runner));
  const regionRows = await db
    .select({ id: regions.id, label: regions.label })
    .from(campaignRegions)
    .innerJoin(regions, eq(regions.id, campaignRegions.regionId))
    .where(eq(campaignRegions.campaignId, id));
  const personaRows = await db
    .select({ id: personas.id, name: personas.name })
    .from(campaignPersonas)
    .innerJoin(personas, eq(personas.id, campaignPersonas.personaId))
    .where(eq(campaignPersonas.campaignId, id));
  const [{ total }] = await db.select({ total: count() }).from(prompts).where(eq(prompts.campaignId, id));
  const [{ approved }] = await db
    .select({ approved: count() })
    .from(prompts)
    .where(and(eq(prompts.campaignId, id), eq(prompts.status, "approved")));
  const sets = await db
    .select()
    .from(promptSets)
    .where(eq(promptSets.campaignId, id))
    .orderBy(desc(promptSets.version));
  return {
    id: c.id,
    name: c.name,
    topic: c.topic,
    status: c.status,
    legacy: Boolean((c.settings as { legacy?: boolean } | null)?.legacy),
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
    engines,
    regions: regionRows,
    personas: personaRows,
    prompt_count: total,
    approved_count: approved,
    prompt_sets: sets.map((s) => ({
      id: s.id,
      version: s.version,
      sha256: s.sha256,
      frozen_at: s.frozenAt ? s.frozenAt.toISOString() : null,
    })),
  };
}

async function validateRefs(db: Db, orgId: string, input: Partial<CampaignInput>) {
  if (input.region_ids?.length) {
    const found = await db.select({ id: regions.id }).from(regions).where(inArray(regions.id, input.region_ids));
    if (found.length !== new Set(input.region_ids).size) throw new ValidationError("Unknown region id.");
  }
  if (input.persona_ids?.length) {
    const found = await db
      .select({ id: personas.id })
      .from(personas)
      .where(
        and(inArray(personas.id, input.persona_ids), or(eq(personas.orgId, orgId), isNull(personas.orgId))),
      );
    if (found.length !== new Set(input.persona_ids).size) throw new ValidationError("Unknown persona id.");
  }
}

async function replaceLinks(db: Db, campaignId: string, input: Partial<CampaignInput>) {
  if (input.engines) {
    await db.delete(campaignEngines).where(eq(campaignEngines.campaignId, campaignId));
    const unique = Array.from(new Map(input.engines.map((e) => [`${e.engine}:${e.runner}`, e])).values());
    if (unique.length) await db.insert(campaignEngines).values(unique.map((e) => ({ campaignId, ...e })));
  }
  if (input.region_ids) {
    await db.delete(campaignRegions).where(eq(campaignRegions.campaignId, campaignId));
    const unique = Array.from(new Set(input.region_ids));
    if (unique.length) await db.insert(campaignRegions).values(unique.map((regionId) => ({ campaignId, regionId })));
  }
  if (input.persona_ids) {
    await db.delete(campaignPersonas).where(eq(campaignPersonas.campaignId, campaignId));
    const unique = Array.from(new Set(input.persona_ids));
    if (unique.length) await db.insert(campaignPersonas).values(unique.map((personaId) => ({ campaignId, personaId })));
  }
}

export async function createCampaign(db: Db, user: SessionUser, raw: unknown): Promise<CampaignView> {
  const parsed = campaignInput.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  const input = parsed.data;
  await validateRefs(db, user.orgId, input);
  const [brand] = await db.select({ id: brands.id }).from(brands).where(eq(brands.orgId, user.orgId)).limit(1);
  if (!brand) throw new ValidationError("This organization has no brand yet.");
  const id = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [row] = await tx
      .insert(campaigns)
      .values({
        orgId: user.orgId,
        brandId: brand.id,
        name: input.name,
        topic: input.topic,
        status: input.status ?? "draft",
      })
      .returning({ id: campaigns.id });
    await replaceLinks(tx, row.id, input);
    return row.id;
  });
  const view = await getCampaign(db, user.orgId, id);
  await recordAudit(db, {
    orgId: user.orgId,
    userId: user.userId,
    action: "campaign.create",
    entityType: "campaign",
    entityId: id,
    after: view,
  });
  return view;
}

export async function updateCampaign(db: Db, user: SessionUser, id: string, raw: unknown): Promise<CampaignView> {
  const parsed = campaignPatch.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  const input = parsed.data;
  const before = await getCampaign(db, user.orgId, id);
  await validateRefs(db, user.orgId, input);
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const set: Partial<typeof campaigns.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) set.name = input.name;
    if (input.topic !== undefined) set.topic = input.topic;
    if (input.status !== undefined) set.status = input.status;
    await tx
      .update(campaigns)
      .set(set)
      .where(and(eq(campaigns.id, id), eq(campaigns.orgId, user.orgId)));
    await replaceLinks(tx, id, input);
  });
  const after = await getCampaign(db, user.orgId, id);
  await recordAudit(db, {
    orgId: user.orgId,
    userId: user.userId,
    action: input.status === "archived" && before.status !== "archived" ? "campaign.archive" : "campaign.update",
    entityType: "campaign",
    entityId: id,
    before,
    after,
  });
  return after;
}

export async function campaignOptions(db: Db, orgId: string) {
  const regionRows = await db.select({ id: regions.id, label: regions.label }).from(regions).orderBy(asc(regions.label));
  const personaRows = await db
    .select({ id: personas.id, name: personas.name })
    .from(personas)
    .where(or(eq(personas.orgId, orgId), isNull(personas.orgId)))
    .orderBy(asc(personas.name));
  return { engines: ENGINES, runners: RUNNERS, default_runner: DEFAULT_RUNNER, regions: regionRows, personas: personaRows };
}
