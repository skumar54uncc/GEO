import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { brands, campaignEngines, campaignPersonas, campaignRegions, campaigns, personas, regions } from "@/lib/db/pg/schema";
import { DEFAULT_RUNNER, ENGINES } from "@/lib/campaigns";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { CONTENT_TEAM_CAMPAIGNS, CONTENT_TEAM_PERSONAS } from "./personas";

export type SeedResult = {
  personas: Array<{ key: string; id: string; created: boolean }>;
  campaigns: Array<{ name: string; id: string; created: boolean }>;
};

/** Library personas (org_id null) with draft prefixes. Idempotent on personas.key. */
export async function ensureContentTeamPersonas(db: Db): Promise<SeedResult["personas"]> {
  const out: SeedResult["personas"] = [];
  for (const p of CONTENT_TEAM_PERSONAS) {
    const [existing] = await db.select({ id: personas.id }).from(personas).where(eq(personas.key, p.key));
    if (existing) {
      await db
        .update(personas)
        .set({ name: p.name, goal: p.goal, draftPrefix: p.draftPrefix })
        .where(eq(personas.id, existing.id));
      out.push({ key: p.key, id: existing.id, created: false });
      continue;
    }
    const [created] = await db
      .insert(personas)
      .values({
        orgId: null,
        name: p.name,
        goal: p.goal,
        key: p.key,
        draftPrefix: p.draftPrefix,
        notes: "Draft prefix. Content team must approve before production use.",
      })
      .returning({ id: personas.id });
    out.push({ key: p.key, id: created.id, created: true });
  }
  return out;
}

/**
 * Non-legacy campaigns AI / Energy / Internships. Never touches the legacy Energy campaign
 * (settings.legacy = true). Idempotent via settings.content_team_v1 + name.
 */
export async function ensureContentTeamCampaigns(db: Db, orgId: string): Promise<SeedResult["campaigns"]> {
  const [brand] = await db.select({ id: brands.id }).from(brands).where(eq(brands.orgId, orgId)).limit(1);
  if (!brand) throw new Error("No brand for org; run bootstrap first.");
  const charlotte = await ensureNamedRegion(db, CHARLOTTE_REGION);
  const personaRows = await ensureContentTeamPersonas(db);
  const out: SeedResult["campaigns"] = [];

  for (const c of CONTENT_TEAM_CAMPAIGNS) {
    const existing = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.orgId, orgId),
          eq(campaigns.name, c.name),
          sql`coalesce((${campaigns.settings}->>'legacy')::boolean, false) = false`,
          sql`coalesce((${campaigns.settings}->>'content_team_v1')::boolean, false) = true`,
        ),
      )
      .limit(1);
    if (existing[0]) {
      out.push({ name: c.name, id: existing[0].id, created: false });
      continue;
    }
    const [created] = await db
      .insert(campaigns)
      .values({
        orgId,
        brandId: brand.id,
        name: c.name,
        topic: c.topic,
        status: "active",
        settings: { content_team_v1: true, pillar: c.pillar },
      })
      .returning({ id: campaigns.id });
    await db.insert(campaignEngines).values(
      ENGINES.map((engine) => ({
        campaignId: created.id,
        engine,
        runner: engine === "perplexity" || engine === "claude" ? ("api_search" as const) : DEFAULT_RUNNER[engine],
      })),
    );
    await db.insert(campaignRegions).values({ campaignId: created.id, regionId: charlotte.id }).onConflictDoNothing();
    if (personaRows.length) {
      await db
        .insert(campaignPersonas)
        .values(personaRows.map((p) => ({ campaignId: created.id, personaId: p.id })))
        .onConflictDoNothing();
    }
    out.push({ name: c.name, id: created.id, created: true });
  }
  return out;
}

export async function seedContentTeam(db: Db, orgId: string): Promise<SeedResult> {
  // Phase 4 library seed preserves the five content-team IDs and adds the remaining canonical personas.
  const { ensureCanonicalPersonas } = await import("@/lib/personas/seed");
  await ensureCanonicalPersonas(db);
  const personasOut = await ensureContentTeamPersonas(db);
  const campaignsOut = await ensureContentTeamCampaigns(db, orgId);
  return { personas: personasOut, campaigns: campaignsOut };
}

/** Resolve Charlotte region id if present (for estimates). */
export async function charlotteRegionId(db: Db): Promise<string | null> {
  const [r] = await db.select({ id: regions.id }).from(regions).where(eq(regions.label, CHARLOTTE_REGION.label));
  return r?.id ?? null;
}
