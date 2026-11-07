import { and, eq, isNotNull, sql } from "drizzle-orm";
import { defaultSeedConfig } from "@/lib/db/types";
import { DEFAULT_LOCATION_NOTE, AIO_LOCATION_NOTE } from "@/lib/types";
import type { Db } from "./client";
import { writeConfig, type CampaignSettings } from "./config";
import { brands, campaigns, organizations, personas, providerAccounts, regions, scans } from "./schema";

export const DEFAULT_ORG_SLUG = process.env.DEFAULT_ORG_SLUG || "unc-charlotte";
export const LEGACY_SCAN_NAME = "Legacy and manual captures";

export type LegacyContext = {
  orgId: string;
  brandId: string;
  campaignId: string;
  scanId: string;
};

const g = globalThis as unknown as { __geoLegacyCtx?: Promise<LegacyContext> };

/** Known location notes become structured regions. Any other note is kept verbatim as a label. */
export function regionForNote(note: string): typeof regions.$inferInsert {
  if (note === DEFAULT_LOCATION_NOTE) {
    return { label: note, country: "US", state: "NC", city: "Charlotte", language: "en", serpLocation: null };
  }
  if (note === AIO_LOCATION_NOTE) {
    return { label: note, country: "US", state: null, city: null, language: "en", serpLocation: "United States" };
  }
  return { label: note };
}

/**
 * Legacy audience enum to persona. Display names follow docs/PERSONAS.md taxonomy
 * where a mapping exists (undergrad/grad/industry≈business_partner/government≈state_policymaker).
 */
export const LEGACY_PERSONAS: Record<string, { name: string; goal: string }> = {
  undergrad: { name: "Undergraduate prospect (general)", goal: "Choose an undergraduate program and university" },
  grad: { name: "Graduate prospect (general)", goal: "Choose a graduate program, lab, or advisor" },
  industry: { name: "Business leader / potential partner", goal: "Find research partners, talent, or testbeds" },
  hel: { name: "Higher ed peer (legacy)", goal: "Benchmark peer institutions and programs" },
  government: { name: "State policymaker", goal: "Find expertise and evidence for policy decisions" },
};

export async function ensureLegacyPersonas(db: Db, orgId: string): Promise<Record<string, string>> {
  const existing = await db
    .select({ id: personas.id, key: personas.legacyKey })
    .from(personas)
    .where(and(eq(personas.orgId, orgId), isNotNull(personas.legacyKey)));
  const map: Record<string, string> = {};
  for (const row of existing) if (row.key) map[row.key] = row.id;
  for (const [key, p] of Object.entries(LEGACY_PERSONAS)) {
    if (map[key]) {
      // Keep IDs; refresh display name/goal to the taxonomy labels.
      await db.update(personas).set({ name: p.name, goal: p.goal }).where(eq(personas.id, map[key]));
      continue;
    }
    const [row] = await db
      .insert(personas)
      .values({ orgId, name: p.name, goal: p.goal, legacyKey: key })
      .returning({ id: personas.id });
    map[key] = row.id;
  }
  return map;
}

export async function ensureRegion(db: Db, note: string): Promise<string> {
  const [existing] = await db.select({ id: regions.id }).from(regions).where(eq(regions.label, note));
  if (existing) return existing.id;
  const [row] = await db.insert(regions).values(regionForNote(note)).onConflictDoNothing().returning({ id: regions.id });
  if (row) return row.id;
  const [again] = await db.select({ id: regions.id }).from(regions).where(eq(regions.label, note));
  return again.id;
}

async function create(db: Db): Promise<LegacyContext> {
  let [org] = await db.select().from(organizations).where(eq(organizations.slug, DEFAULT_ORG_SLUG));
  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({ name: "UNC Charlotte", slug: DEFAULT_ORG_SLUG })
      .onConflictDoNothing()
      .returning();
    if (!org) [org] = await db.select().from(organizations).where(eq(organizations.slug, DEFAULT_ORG_SLUG));
  }

  let [brand] = await db.select().from(brands).where(eq(brands.orgId, org.id)).limit(1);
  let freshBrand = false;
  if (!brand) {
    [brand] = await db
      .insert(brands)
      .values({ orgId: org.id, name: "UNC Charlotte", rootDomain: "charlotte.edu", entityType: "university" })
      .returning();
    freshBrand = true;
  }

  let [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.orgId, org.id), sql`${campaigns.settings}->>'legacy' = 'true'`))
    .limit(1);
  if (!campaign) {
    const seed = defaultSeedConfig();
    const settings: CampaignSettings = {
      legacy: true,
      subtopics: seed.subtopics,
      assets: seed.assets,
      last_location_note: seed.last_location_note,
    };
    [campaign] = await db
      .insert(campaigns)
      .values({
        orgId: org.id,
        brandId: brand.id,
        name: "Energy (legacy captures)",
        topic: "Energy research",
        status: "active",
        settings,
      })
      .returning();
  } else if (campaign.name === "Energy") {
    // Rename migrated legacy campaign; never touch content-team "Energy".
    [campaign] = await db
      .update(campaigns)
      .set({ name: "Energy (legacy captures)" })
      .where(eq(campaigns.id, campaign.id))
      .returning();
  }

  const [account] = await db
    .select()
    .from(providerAccounts)
    .where(and(eq(providerAccounts.orgId, org.id), eq(providerAccounts.provider, "serpapi")));
  if (freshBrand || !account) {
    const seed = defaultSeedConfig();
    const ctx = { orgId: org.id, brandId: brand.id, campaignId: campaign.id };
    await writeConfig(db, ctx, freshBrand ? seed : {
      serpapi_starting_balance: seed.serpapi_starting_balance,
      serpapi_credits_remaining: seed.serpapi_credits_remaining,
      serpapi_per_run_cap: seed.serpapi_per_run_cap,
    });
  }

  await ensureLegacyPersonas(db, org.id);

  let [scan] = await db
    .select()
    .from(scans)
    .where(and(eq(scans.campaignId, campaign.id), eq(scans.name, LEGACY_SCAN_NAME)))
    .limit(1);
  if (!scan) {
    [scan] = await db
      .insert(scans)
      .values({ campaignId: campaign.id, name: LEGACY_SCAN_NAME, status: "running" })
      .returning();
  }

  return { orgId: org.id, brandId: brand.id, campaignId: campaign.id, scanId: scan.id };
}

/** Ensures the default org, brand, Energy campaign, SerpAPI account and legacy scan exist. */
export function legacyContext(db: Db): Promise<LegacyContext> {
  if (!g.__geoLegacyCtx) {
    g.__geoLegacyCtx = create(db).catch((err) => {
      g.__geoLegacyCtx = undefined;
      throw err;
    });
  }
  return g.__geoLegacyCtx;
}

export function resetLegacyContextCache(): void {
  g.__geoLegacyCtx = undefined;
}
