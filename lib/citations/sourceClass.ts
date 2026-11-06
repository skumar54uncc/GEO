import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import {
  brandDomains,
  brands,
  competitorDomains,
  competitors,
  sourceClassOverrides,
} from "@/lib/db/pg/schema";
import { registrableDomain } from "@/lib/domain";

export type SourceClass = "owned" | "competitor" | "editorial" | "ranking" | "reference" | "gov" | "ugc" | "other";
export type SourceKind =
  | "owned"
  | "edu_peer"
  | "ranking"
  | "listing"
  | "wikipedia"
  | "reference"
  | "reddit"
  | "forum"
  | "video"
  | "news"
  | "government"
  | "education"
  | "social"
  | "review"
  | "other";

export type SourceClassification = { sourceClass: SourceClass; kind: SourceKind };
export type SourceContext = {
  ownedDomains?: string[];
  competitorDomains?: string[];
  /** Manual org overrides, keyed by registrable domain. Checked before built-in lists. */
  overrides?: Record<string, SourceClassification>;
};

const RANKING = new Set([
  "usnews.com",
  "niche.com",
  "princetonreview.com",
  "timeshighereducation.com",
  "topuniversities.com",
  "shanghairanking.com",
  "forbes.com",
  "bestcolleges.com",
]);
const LISTING = new Set([
  "collegeboard.org",
  "commonapp.org",
  "petersons.com",
  "collegedata.com",
  "cappex.com",
  "joinhandshake.com",
  "indeed.com",
  "glassdoor.com",
]);
const REFERENCE = new Set(["wikipedia.org", "wikidata.org", "britannica.com"]);
const NEWS = new Set([
  "apnews.com",
  "reuters.com",
  "nytimes.com",
  "washingtonpost.com",
  "cnn.com",
  "nbcnews.com",
  "abcnews.go.com",
  "cbsnews.com",
  "npr.org",
  "chronicle.com",
  "insidehighered.com",
  "charlotteobserver.com",
  "wfae.org",
  "wbtv.com",
  "wsoctv.com",
  "qcnews.com",
  "bizjournals.com",
  "axios.com",
]);
const REVIEW = new Set(["collegevine.com", "unigo.com", "ratemyprofessors.com"]);
const FORUM = new Set(["quora.com", "stackexchange.com", "collegeconfidential.com"]);
const SOCIAL = new Set(["facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com", "linkedin.com", "medium.com"]);

function hostname(input: string): string {
  try {
    return new URL(input.includes("://") ? input : `https://${input}`).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return input.toLowerCase().replace(/\.$/, "");
  }
}

function matches(host: string, domains: string[] | undefined): boolean {
  return (domains ?? []).some((value) => {
    const domain = hostname(value);
    return host === domain || host.endsWith(`.${domain}`);
  });
}

/** Detailed kind is separate so the approved source_class enum remains unchanged. */
export function classifySource(input: string, context: SourceContext = {}): SourceClassification {
  const host = hostname(input);
  const domain = registrableDomain(host) ?? host;
  if (matches(host, context.ownedDomains)) return { sourceClass: "owned", kind: "owned" };
  if (matches(host, context.competitorDomains)) return { sourceClass: "competitor", kind: "edu_peer" };
  const override = context.overrides?.[domain];
  if (override) return override;
  if (/\.(gov|mil)$/.test(host) || host.endsWith(".gov.us")) return { sourceClass: "gov", kind: "government" };
  if (domain === "wikipedia.org") return { sourceClass: "reference", kind: "wikipedia" };
  if (REFERENCE.has(domain)) return { sourceClass: "reference", kind: "reference" };
  if (RANKING.has(domain)) return { sourceClass: "ranking", kind: "ranking" };
  if (LISTING.has(domain)) return { sourceClass: "editorial", kind: "listing" };
  if (REVIEW.has(domain)) return { sourceClass: "ugc", kind: "review" };
  if (domain === "reddit.com") return { sourceClass: "ugc", kind: "reddit" };
  if (domain === "youtube.com" || domain === "youtu.be") return { sourceClass: "ugc", kind: "video" };
  if (FORUM.has(domain)) return { sourceClass: "ugc", kind: "forum" };
  if (SOCIAL.has(domain)) return { sourceClass: "ugc", kind: "social" };
  if (NEWS.has(domain)) return { sourceClass: "editorial", kind: "news" };
  if (host.endsWith(".edu")) return { sourceClass: "editorial", kind: "education" };
  return { sourceClass: "other", kind: "other" };
}

export async function loadSourceContext(db: Db, orgId: string): Promise<SourceContext> {
  const [owned, peers, overrides] = await Promise.all([
    db
      .select({ domain: brandDomains.domain })
      .from(brandDomains)
      .innerJoin(brands, eq(brands.id, brandDomains.brandId))
      .where(eq(brands.orgId, orgId)),
    db
      .select({ domain: competitorDomains.domain })
      .from(competitorDomains)
      .innerJoin(competitors, eq(competitors.id, competitorDomains.competitorId))
      .where(eq(competitors.orgId, orgId)),
    db.select().from(sourceClassOverrides).where(eq(sourceClassOverrides.orgId, orgId)),
  ]);
  return {
    ownedDomains: owned.map((row) => row.domain),
    competitorDomains: peers.map((row) => row.domain),
    overrides: Object.fromEntries(
      overrides.map((row) => [
        registrableDomain(row.domain) ?? row.domain.toLowerCase(),
        { sourceClass: row.sourceClass as SourceClass, kind: row.kind as SourceKind },
      ]),
    ),
  };
}

export async function sourceClassifier(db: Db, orgId: string): Promise<(input: string) => SourceClass> {
  const context = await loadSourceContext(db, orgId);
  return (input) => classifySource(input, context).sourceClass;
}
