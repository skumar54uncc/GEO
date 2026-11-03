import { and, eq } from "drizzle-orm";
import { getDomain } from "tldts";
import type { Db } from "@/lib/db/pg/client";
import { brands, siteHosts, sites } from "@/lib/db/pg/schema";

export class SiteNotFound extends Error {}
export class SiteInputError extends Error {}

/** Accepts "charlotte.edu", "https://www.charlotte.edu/path" and similar. Returns the origin with a trailing slash. */
export function normalizeRootUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new SiteInputError("Enter a website address.");
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new SiteInputError(`"${raw}" is not a valid website address.`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new SiteInputError("Only http and https sites can be audited.");
  if (!u.hostname.includes(".")) throw new SiteInputError(`"${u.hostname}" is not a public host name.`);
  return `${u.protocol}//${u.host.toLowerCase()}/`;
}

export function rootDomainOf(host: string): string {
  return (getDomain(host, { allowPrivateDomains: false }) ?? host).toLowerCase();
}

export function isUnderDomain(host: string, rootDomain: string): boolean {
  const h = host.toLowerCase();
  return h === rootDomain || h.endsWith(`.${rootDomain}`);
}

/** Origin for a host, reusing the root URL's scheme and port (the port only matters for local fixtures). */
export function hostOrigin(host: string, rootUrl: string): string {
  const u = new URL(rootUrl);
  return `${u.protocol}//${host}${u.port ? `:${u.port}` : ""}`;
}

export type SiteContext = {
  site: typeof sites.$inferSelect;
  brand: typeof brands.$inferSelect;
  orgId: string;
  rootHost: string;
  rootDomain: string;
};

/** The host the root URL lands on (charlotte.edu redirects to www.charlotte.edu). */
export async function primaryHostFor(db: Db, siteId: string): Promise<string> {
  const ctx = await siteContext(db, siteId);
  const [row] = await db
    .select({ rootFinalUrl: siteHosts.rootFinalUrl })
    .from(siteHosts)
    .where(and(eq(siteHosts.siteId, siteId), eq(siteHosts.host, ctx.rootHost)));
  return row?.rootFinalUrl ? new URL(row.rootFinalUrl).hostname.toLowerCase() : ctx.rootHost;
}

export async function siteContext(db: Db, siteId: string, orgId?: string): Promise<SiteContext> {
  const [row] = await db
    .select({ site: sites, brand: brands })
    .from(sites)
    .innerJoin(brands, eq(brands.id, sites.brandId))
    .where(orgId ? and(eq(sites.id, siteId), eq(brands.orgId, orgId)) : eq(sites.id, siteId));
  if (!row) throw new SiteNotFound("Site not found.");
  const rootHost = new URL(row.site.rootUrl).hostname.toLowerCase();
  return { site: row.site, brand: row.brand, orgId: row.brand.orgId, rootHost, rootDomain: rootDomainOf(rootHost) };
}
