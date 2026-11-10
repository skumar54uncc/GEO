import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { auditRuns, brands, crawlRuns, sites } from "@/lib/db/pg/schema";

/** True when the org has at least one completed site audit run. */
export async function orgHasSiteAudit(db: Db, orgId: string): Promise<boolean> {
  const siteRows = await db
    .select({ id: sites.id })
    .from(sites)
    .innerJoin(brands, eq(brands.id, sites.brandId))
    .where(eq(brands.orgId, orgId));
  if (!siteRows.length) return false;
  const siteIds = siteRows.map((s) => s.id);
  const runs = await db
    .select({ id: crawlRuns.id })
    .from(crawlRuns)
    .where(inArray(crawlRuns.siteId, siteIds))
    .limit(50);
  if (!runs.length) return false;
  const [audit] = await db
    .select({ id: auditRuns.id })
    .from(auditRuns)
    .where(inArray(auditRuns.crawlRunId, runs.map((r) => r.id)))
    .limit(1);
  return Boolean(audit);
}

/** Soft-banner payload for campaign create when no audit exists yet. */
export function noAuditBannerMessage(): string {
  return "This organization has no site audit yet. Start with an audit before measuring visibility.";
}
