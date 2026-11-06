import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import {
  aiReferralTraffic,
  alerts,
  auditFindings,
  auditRuns,
  botHits,
  botLogImports,
  brandAliases,
  brandDomains,
  brands,
  calibrationRuns,
  campaignEngines,
  campaignPersonas,
  campaignRegions,
  campaigns,
  canaryRuns,
  citations,
  claims,
  competitors,
  costLedger,
  crawlPages,
  crawlRuns,
  demandSignals,
  draws,
  entityCandidates,
  entityChecks,
  factSets,
  facts,
  fanoutQueries,
  goldLabels,
  judgeRuns,
  memberships,
  mentions,
  organizations,
  pagespeedResults,
  peerSuggestions,
  promptSetItems,
  promptSets,
  personas,
  prompts,
  providerAccounts,
  recommendations,
  scans,
  schedules,
  seasonalEvents,
  searchConsoleQueries,
  serpSnapshots,
  sites,
  siteHosts,
  sourceClassOverrides,
  strategyReports,
} from "@/lib/db/pg/schema";

/**
 * Deletes data scoped to one organization so demo re-seeding is idempotent.
 * Order respects ON DELETE no-action FKs (draws, scans, brands, etc.).
 *
 * Uses `session_replication_role = replica` inside the transaction so immutable-table
 * triggers do not block admin teardown of a demo org. Never use this on UNC Charlotte.
 */
export async function deleteAllDataForOrg(db: Db, orgId: string): Promise<void> {
  const campRows = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.orgId, orgId));
  const campaignIds = campRows.map((r) => r.id);

  const brandRows = await db.select({ id: brands.id }).from(brands).where(eq(brands.orgId, orgId));
  const brandIds = brandRows.map((r) => r.id);

  let scanIds: string[] = [];
  let drawIds: string[] = [];
  let promptIds: string[] = [];
  let setIds: string[] = [];

  if (campaignIds.length) {
    const s = await db.select({ id: scans.id }).from(scans).where(inArray(scans.campaignId, campaignIds));
    scanIds = s.map((r) => r.id);
    const p = await db.select({ id: prompts.id }).from(prompts).where(inArray(prompts.campaignId, campaignIds));
    promptIds = p.map((r) => r.id);
    const ps = await db.select({ id: promptSets.id }).from(promptSets).where(inArray(promptSets.campaignId, campaignIds));
    setIds = ps.map((r) => r.id);
  }
  if (scanIds.length) {
    const d = await db.select({ id: draws.id }).from(draws).where(inArray(draws.scanId, scanIds));
    drawIds = d.map((r) => r.id);
  }

  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    // Bypass immutability triggers for audited demo teardown only.
    await t.execute(sql`SELECT set_config('session_replication_role', 'replica', true)`);

    await t.delete(costLedger).where(eq(costLedger.orgId, orgId));

    if (drawIds.length) {
      const jr = await t.select({ id: judgeRuns.id }).from(judgeRuns).where(inArray(judgeRuns.drawId, drawIds));
      const judgeRunIds = jr.map((r) => r.id);
      if (judgeRunIds.length) {
        await t.delete(mentions).where(inArray(mentions.judgeRunId, judgeRunIds));
        await t.delete(claims).where(inArray(claims.judgeRunId, judgeRunIds));
        await t.delete(judgeRuns).where(inArray(judgeRuns.id, judgeRunIds));
      }
      await t.delete(fanoutQueries).where(inArray(fanoutQueries.drawId, drawIds));
      await t.delete(citations).where(inArray(citations.drawId, drawIds));
      await t.delete(goldLabels).where(inArray(goldLabels.drawId, drawIds));
      await t.delete(canaryRuns).where(inArray(canaryRuns.drawId, drawIds));
      await t.delete(draws).where(inArray(draws.id, drawIds));
    }

    await t.delete(canaryRuns).where(eq(canaryRuns.orgId, orgId));
    await t.delete(calibrationRuns).where(eq(calibrationRuns.orgId, orgId));

    if (campaignIds.length) {
      await t.delete(recommendations).where(inArray(recommendations.campaignId, campaignIds));
      await t.delete(strategyReports).where(inArray(strategyReports.campaignId, campaignIds));
    }
    if (scanIds.length) {
      await t.delete(scans).where(inArray(scans.id, scanIds));
    }
    if (campaignIds.length) {
      await t.delete(schedules).where(inArray(schedules.campaignId, campaignIds));
      await t.delete(demandSignals).where(inArray(demandSignals.campaignId, campaignIds));
    }
    if (setIds.length) await t.delete(promptSetItems).where(inArray(promptSetItems.promptSetId, setIds));
    if (setIds.length) await t.delete(promptSets).where(inArray(promptSets.id, setIds));
    if (promptIds.length) await t.delete(prompts).where(inArray(prompts.id, promptIds));

    if (campaignIds.length) {
      await t.delete(campaignEngines).where(inArray(campaignEngines.campaignId, campaignIds));
      await t.delete(campaignRegions).where(inArray(campaignRegions.campaignId, campaignIds));
      await t.delete(campaignPersonas).where(inArray(campaignPersonas.campaignId, campaignIds));
      await t.delete(campaigns).where(inArray(campaigns.id, campaignIds));
    }

    if (promptIds.length) await t.delete(serpSnapshots).where(inArray(serpSnapshots.promptId, promptIds));

    await t.delete(alerts).where(eq(alerts.orgId, orgId));
    await t.delete(seasonalEvents).where(eq(seasonalEvents.orgId, orgId));
    await t.delete(sourceClassOverrides).where(eq(sourceClassOverrides.orgId, orgId));
    await t.delete(providerAccounts).where(eq(providerAccounts.orgId, orgId));
    await t.delete(memberships).where(eq(memberships.orgId, orgId));

    if (brandIds.length) {
      const siteRows = await t.select({ id: sites.id }).from(sites).where(inArray(sites.brandId, brandIds));
      const siteIds = siteRows.map((r) => r.id);
      if (siteIds.length) {
        await t.delete(searchConsoleQueries).where(inArray(searchConsoleQueries.siteId, siteIds));
        await t.delete(aiReferralTraffic).where(inArray(aiReferralTraffic.siteId, siteIds));
        await t.delete(peerSuggestions).where(inArray(peerSuggestions.siteId, siteIds));
        await t.delete(entityCandidates).where(inArray(entityCandidates.siteId, siteIds));
        await t.delete(botLogImports).where(inArray(botLogImports.siteId, siteIds));

        const crawlRunRows = await t.select({ id: crawlRuns.id }).from(crawlRuns).where(inArray(crawlRuns.siteId, siteIds));
        const crawlRunIds = crawlRunRows.map((r) => r.id);
        if (crawlRunIds.length) {
          await t.delete(entityCandidates).where(inArray(entityCandidates.crawlRunId, crawlRunIds));
          const pageRows = await t.select({ id: crawlPages.id }).from(crawlPages).where(inArray(crawlPages.crawlRunId, crawlRunIds));
          const pageIds = pageRows.map((r) => r.id);
          if (pageIds.length) {
            await t.delete(auditFindings).where(inArray(auditFindings.pageId, pageIds));
            await t.delete(pagespeedResults).where(inArray(pagespeedResults.pageId, pageIds));
            await t.delete(crawlPages).where(inArray(crawlPages.id, pageIds));
          }
          const auditRunRows = await t.select({ id: auditRuns.id }).from(auditRuns).where(inArray(auditRuns.crawlRunId, crawlRunIds));
          const auditRunIds = auditRunRows.map((r) => r.id);
          await t.delete(auditFindings).where(inArray(auditFindings.crawlRunId, crawlRunIds));
          if (auditRunIds.length) {
            await t.delete(auditFindings).where(inArray(auditFindings.auditRunId, auditRunIds));
            await t.delete(auditRuns).where(inArray(auditRuns.id, auditRunIds));
          }
          await t.delete(pagespeedResults).where(inArray(pagespeedResults.crawlRunId, crawlRunIds));
          await t.delete(crawlRuns).where(inArray(crawlRuns.id, crawlRunIds));
        }

        const hostRows = await t.select({ id: siteHosts.id }).from(siteHosts).where(inArray(siteHosts.siteId, siteIds));
        const hostIds = hostRows.map((r) => r.id);
        if (hostIds.length) {
          await t.delete(botHits).where(inArray(botHits.hostId, hostIds));
          await t.delete(auditFindings).where(inArray(auditFindings.hostId, hostIds));
          await t.delete(siteHosts).where(inArray(siteHosts.id, hostIds));
        }
        await t.delete(botHits).where(inArray(botHits.siteId, siteIds));
        await t.delete(sites).where(inArray(sites.id, siteIds));
      }
    }

    for (const bid of brandIds) {
      await t.delete(entityChecks).where(eq(entityChecks.brandId, bid));
      const fsRows = await t.select({ id: factSets.id }).from(factSets).where(eq(factSets.brandId, bid));
      const factSetIds = fsRows.map((r) => r.id);
      if (factSetIds.length) {
        await t.delete(facts).where(inArray(facts.factSetId, factSetIds));
        await t.delete(factSets).where(inArray(factSets.id, factSetIds));
      }
      await t.delete(brandAliases).where(eq(brandAliases.brandId, bid));
      await t.delete(brandDomains).where(eq(brandDomains.brandId, bid));
    }
    await t.delete(competitors).where(eq(competitors.orgId, orgId));
    if (brandIds.length) await t.delete(brands).where(inArray(brands.id, brandIds));

    await t.delete(personas).where(eq(personas.orgId, orgId));

    await t.delete(organizations).where(eq(organizations.id, orgId));
  });
}
