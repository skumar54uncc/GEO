import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { brandDomains, brands, competitorDomains, competitors } from "@/lib/db/pg/schema";
import { registrableDomain } from "@/lib/domain";

export type SourceClass = "owned" | "competitor" | "editorial" | "ranking" | "reference" | "gov" | "ugc" | "other";

const REFERENCE = new Set(["wikipedia.org", "wikidata.org", "britannica.com"]);
const RANKING = new Set(["usnews.com", "niche.com", "timeshighereducation.com", "topuniversities.com", "shanghairanking.com"]);
const UGC = new Set(["reddit.com", "quora.com", "youtube.com", "facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com", "linkedin.com", "medium.com"]);

/** Domain level classes only. Anything not on a list is "other"; editorial needs a reviewed list first. */
export async function sourceClassifier(db: Db, orgId: string): Promise<(domain: string) => SourceClass> {
  const owned = await db
    .select({ domain: brandDomains.domain })
    .from(brandDomains)
    .innerJoin(brands, eq(brands.id, brandDomains.brandId))
    .where(eq(brands.orgId, orgId));
  const comp = await db
    .select({ domain: competitorDomains.domain })
    .from(competitorDomains)
    .innerJoin(competitors, eq(competitors.id, competitorDomains.competitorId))
    .where(eq(competitors.orgId, orgId));
  const ownedSet = owned.map((r) => r.domain.toLowerCase());
  const compSet = comp.map((r) => r.domain.toLowerCase());
  const matches = (d: string, list: string[]) => list.some((t) => d === t || d.endsWith(`.${t}`));
  return (domain: string) => {
    const d = domain.toLowerCase();
    if (matches(d, ownedSet)) return "owned";
    if (matches(d, compSet)) return "competitor";
    if (/\.(gov|mil)$/.test(d) || d.endsWith(".gov.us") || d === "nc.gov") return "gov";
    const reg = registrableDomain(d) ?? d;
    if (REFERENCE.has(reg)) return "reference";
    if (RANKING.has(reg)) return "ranking";
    if (UGC.has(reg)) return "ugc";
    return "other";
  };
}