import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AppConfig, AssetConfig, CompetitorConfig, FactRecord, SubtopicConfig } from "@/lib/types";
import type { Db } from "./client";
import {
  brandAliases,
  brandDomains,
  campaigns,
  competitorAliases,
  competitorDomains,
  competitors,
  factSets,
  facts,
  providerAccounts,
} from "./schema";

export type ConfigContext = { orgId: string; brandId: string; campaignId: string };

export type CampaignSettings = {
  legacy?: boolean;
  subtopics?: SubtopicConfig[];
  assets?: AssetConfig[];
  last_location_note?: string;
  migrated_from_sqlite?: { at: string; source_sha256: string };
};

/** "Charlotte" alone is the city. It never counts as the university by itself. */
export function aliasRequiresContext(alias: string): boolean {
  return alias.trim().toLowerCase() === "charlotte";
}

export function aliasKind(alias: string): "full" | "short" | "unit" | "program" {
  const a = alias.toLowerCase();
  if (/\b(college|center|centre|institute|school|lab|laboratory|department)\b/.test(a) || alias === alias.toUpperCase() && alias.length <= 5 && !/^unc/i.test(alias)) {
    return "unit";
  }
  if (/\buniversity\b/.test(a)) return "full";
  return "short";
}

export async function readConfig(db: Db, ctx: ConfigContext): Promise<AppConfig> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, ctx.campaignId));
  const settings = (campaign?.settings ?? {}) as CampaignSettings;

  const aliases = await db
    .select({ alias: brandAliases.alias })
    .from(brandAliases)
    .where(eq(brandAliases.brandId, ctx.brandId))
    .orderBy(asc(brandAliases.sortOrder));

  const domains = await db
    .select({ domain: brandDomains.domain })
    .from(brandDomains)
    .where(and(eq(brandDomains.brandId, ctx.brandId), eq(brandDomains.isOwned, true)))
    .orderBy(asc(brandDomains.sortOrder));

  const comps = await db
    .select()
    .from(competitors)
    .where(eq(competitors.orgId, ctx.orgId))
    .orderBy(asc(competitors.sortOrder));
  const compIds = comps.map((c) => c.id);
  const compAliases = compIds.length
    ? await db
        .select()
        .from(competitorAliases)
        .where(inArray(competitorAliases.competitorId, compIds))
        .orderBy(asc(competitorAliases.sortOrder))
    : [];
  const compDomains = compIds.length
    ? await db
        .select()
        .from(competitorDomains)
        .where(inArray(competitorDomains.competitorId, compIds))
        .orderBy(asc(competitorDomains.sortOrder))
    : [];
  const competitorList: CompetitorConfig[] = comps.map((c) => ({
    name: c.name,
    aliases: compAliases.filter((a) => a.competitorId === c.id).map((a) => a.alias),
    domains: compDomains.filter((d) => d.competitorId === c.id).map((d) => d.domain),
  }));

  const [latestFacts] = await db
    .select()
    .from(factSets)
    .where(eq(factSets.brandId, ctx.brandId))
    .orderBy(desc(factSets.version))
    .limit(1);
  const factRows = latestFacts
    ? await db.select().from(facts).where(eq(facts.factSetId, latestFacts.id)).orderBy(asc(facts.sortOrder))
    : [];
  const factList: FactRecord[] = factRows.map((f) => ({
    id: f.externalId ?? f.id,
    text: f.text,
    source_url: f.sourceUrl ?? "",
    source_label: f.sourceLabel ?? "",
    subtopics: f.tags,
    names: f.names,
    needs_confirmation: f.needsConfirmation,
  }));

  const [serp] = await db
    .select()
    .from(providerAccounts)
    .where(and(eq(providerAccounts.orgId, ctx.orgId), eq(providerAccounts.provider, "serpapi")));

  return {
    aliases: aliases.map((a) => a.alias),
    competitors: competitorList,
    subtopics: settings.subtopics ?? [],
    assets: settings.assets ?? [],
    facts: factList,
    target_domains: domains.map((d) => d.domain),
    serpapi_starting_balance: serp?.creditsStarting ?? 0,
    serpapi_credits_remaining: serp?.creditsRemaining ?? 0,
    serpapi_per_run_cap: serp?.perRunCapUnits ?? 0,
    last_location_note: settings.last_location_note ?? "",
  };
}

/** Writes only the keys present in the patch. Lists are replaced in order. */
export async function writeConfig(db: Db, ctx: ConfigContext, patch: Partial<AppConfig>): Promise<void> {
  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    if (patch.aliases) {
      await t.delete(brandAliases).where(eq(brandAliases.brandId, ctx.brandId));
      const unique = Array.from(new Set(patch.aliases.map((a) => a.trim()).filter(Boolean)));
      if (unique.length) {
        await t.insert(brandAliases).values(
          unique.map((alias, i) => ({
            brandId: ctx.brandId,
            alias,
            kind: aliasKind(alias),
            requiresContext: aliasRequiresContext(alias),
            sortOrder: i,
          })),
        );
      }
    }
    if (patch.target_domains) {
      await t.delete(brandDomains).where(eq(brandDomains.brandId, ctx.brandId));
      const unique = Array.from(new Set(patch.target_domains.map((d) => d.trim().toLowerCase()).filter(Boolean)));
      if (unique.length) {
        await t
          .insert(brandDomains)
          .values(unique.map((domain, i) => ({ brandId: ctx.brandId, domain, isOwned: true, sortOrder: i })));
      }
    }
    if (patch.competitors) {
      await t.delete(competitors).where(eq(competitors.orgId, ctx.orgId));
      for (const [i, c] of patch.competitors.entries()) {
        const [row] = await t
          .insert(competitors)
          .values({ orgId: ctx.orgId, name: c.name, source: "manual", sortOrder: i })
          .returning({ id: competitors.id });
        const aliases = Array.from(new Set(c.aliases.filter(Boolean)));
        if (aliases.length) {
          await t
            .insert(competitorAliases)
            .values(aliases.map((alias, j) => ({ competitorId: row.id, alias, sortOrder: j })));
        }
        const domains = Array.from(new Set(c.domains.filter(Boolean)));
        if (domains.length) {
          await t
            .insert(competitorDomains)
            .values(domains.map((domain, j) => ({ competitorId: row.id, domain, sortOrder: j })));
        }
      }
    }
    if (patch.facts) {
      const current = await readConfig(t, ctx);
      if (JSON.stringify(current.facts) !== JSON.stringify(patch.facts)) {
        const [latest] = await t
          .select({ version: factSets.version })
          .from(factSets)
          .where(eq(factSets.brandId, ctx.brandId))
          .orderBy(desc(factSets.version))
          .limit(1);
        const [set] = await t
          .insert(factSets)
          .values({ brandId: ctx.brandId, version: (latest?.version ?? 0) + 1, frozenAt: new Date() })
          .returning({ id: factSets.id });
        if (patch.facts.length) {
          await t.insert(facts).values(
            patch.facts.map((f, i) => ({
              factSetId: set.id,
              externalId: f.id,
              text: f.text,
              sourceUrl: f.source_url || null,
              sourceLabel: f.source_label || null,
              names: f.names ?? [],
              tags: f.subtopics ?? [],
              needsConfirmation: Boolean(f.needs_confirmation),
              sortOrder: i,
            })),
          );
        }
      }
    }
    const settingsPatch: CampaignSettings = {};
    if (patch.subtopics) settingsPatch.subtopics = patch.subtopics;
    if (patch.assets) settingsPatch.assets = patch.assets;
    if (patch.last_location_note !== undefined) settingsPatch.last_location_note = patch.last_location_note;
    if (Object.keys(settingsPatch).length) {
      const [campaign] = await t.select().from(campaigns).where(eq(campaigns.id, ctx.campaignId));
      const next = { ...((campaign?.settings ?? {}) as CampaignSettings), ...settingsPatch };
      await t.update(campaigns).set({ settings: next, updatedAt: new Date() }).where(eq(campaigns.id, ctx.campaignId));
    }
    const credits: Partial<typeof providerAccounts.$inferInsert> = {};
    if (patch.serpapi_starting_balance !== undefined) credits.creditsStarting = patch.serpapi_starting_balance;
    if (patch.serpapi_credits_remaining !== undefined) credits.creditsRemaining = patch.serpapi_credits_remaining;
    if (patch.serpapi_per_run_cap !== undefined) credits.perRunCapUnits = patch.serpapi_per_run_cap;
    if (Object.keys(credits).length) {
      await t
        .insert(providerAccounts)
        .values({ orgId: ctx.orgId, provider: "serpapi", ...credits })
        .onConflictDoUpdate({ target: [providerAccounts.orgId, providerAccounts.provider], set: credits });
    }
  });
}
