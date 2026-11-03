import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import {
  auditFindings,
  auditRules,
  auditRuns,
  botHits,
  botLogImports,
  brands,
  crawlPages,
  crawlRuns,
  entityCandidates,
  pagespeedResults,
  siteHosts,
  sites,
} from "@/lib/db/pg/schema";
import { getRawText } from "@/lib/rawstore";
import { botInfo } from "./aiBots";
import { latestEntityChecks } from "./audit/run";
import { isUnderDomain, normalizeRootUrl, rootDomainOf, SiteInputError, siteContext } from "./context";
import { PROFILE_FIELDS, type Profile } from "./entityCheck";

export async function listSites(db: Db, orgId: string) {
  return db
    .select({ id: sites.id, rootUrl: sites.rootUrl, status: sites.status, discoveredAt: sites.discoveredAt, brandName: brands.name })
    .from(sites)
    .innerJoin(brands, eq(brands.id, sites.brandId))
    .where(eq(brands.orgId, orgId))
    .orderBy(desc(sites.createdAt));
}

/** One site per root URL. A new root domain gets its own brand in the org. */
export async function createSite(db: Db, orgId: string, input: string) {
  const rootUrl = normalizeRootUrl(input);
  const domain = rootDomainOf(new URL(rootUrl).hostname);
  let [brand] = await db.select().from(brands).where(and(eq(brands.orgId, orgId), eq(brands.rootDomain, domain)));
  if (!brand) [brand] = await db.insert(brands).values({ orgId, name: domain, rootDomain: domain }).returning();
  const [existing] = await db.select().from(sites).where(and(eq(sites.brandId, brand.id), eq(sites.rootUrl, rootUrl)));
  if (existing) return { site: existing, created: false };
  const [site] = await db.insert(sites).values({ brandId: brand.id, rootUrl }).returning();
  await db.insert(siteHosts).values({ siteId: site.id, host: new URL(rootUrl).hostname, discoveredVia: "manual", discoveredViaAll: ["manual"] }).onConflictDoNothing();
  return { site, created: true };
}

export async function getSiteView(db: Db, orgId: string, siteId: string) {
  const ctx = await siteContext(db, siteId, orgId);
  const hosts = await db.select().from(siteHosts).where(eq(siteHosts.siteId, siteId));
  hosts.sort((a, b) => Number(b.included) - Number(a.included) || a.host.localeCompare(b.host));
  const runs = await db.select().from(crawlRuns).where(eq(crawlRuns.siteId, siteId)).orderBy(desc(crawlRuns.createdAt)).limit(10);
  const runIds = runs.map((r) => r.id);
  const audits = runIds.length ? await db.select().from(auditRuns).where(inArray(auditRuns.crawlRunId, runIds)).orderBy(desc(auditRuns.createdAt)) : [];
  return {
    site: ctx.site,
    brand: { id: ctx.brand.id, name: ctx.brand.name, root_domain: ctx.brand.rootDomain, ipeds_unitid: ctx.brand.ipedsUnitid, profile: ctx.brand.profile as Profile },
    root_domain: ctx.rootDomain,
    hosts: hosts.map((h) => ({
      id: h.id,
      host: h.host,
      included: h.included,
      included_by_user: h.includedByUser,
      discovered_via: h.discoveredViaAll.length ? h.discoveredViaAll : [h.discoveredVia],
      resolves: h.resolves,
      root_status: h.rootStatus,
      root_final_url: h.rootFinalUrl,
      login_portal: h.loginPortal,
      exclude_reason: h.excludeReason,
      robots_status: h.robotsStatus,
      sitemap_url_count: h.sitemapUrlCount,
      llms_txt_status: h.llmsTxtStatus,
      checked_at: h.checkedAt,
    })),
    crawl_runs: runs.map((r) => ({
      id: r.id,
      status: r.status,
      page_count: r.pageCount,
      page_cap_per_host: r.pageCapPerHost,
      hosts: r.hostIds.length,
      hosts_done: r.hostsDone.length,
      error: r.error,
      created_at: r.createdAt,
      finished_at: r.finishedAt,
      audits: audits.filter((a) => a.crawlRunId === r.id).map((a) => ({ id: a.id, finding_count: a.findingCount, findings_sha256: a.findingsSha256, created_at: a.createdAt })),
    })),
  };
}

export async function setHostIncluded(db: Db, siteId: string, hostId: string, included: boolean) {
  const [before] = await db.select().from(siteHosts).where(and(eq(siteHosts.id, hostId), eq(siteHosts.siteId, siteId)));
  if (!before) throw new SiteInputError("Host not found.");
  const [after] = await db.update(siteHosts).set({ included, includedByUser: true, updatedAt: new Date() }).where(eq(siteHosts.id, hostId)).returning();
  return { before, after };
}

export async function addManualHost(db: Db, siteId: string, rawHost: string) {
  const ctx = await siteContext(db, siteId);
  const host = rawHost.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/:]/)[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) throw new SiteInputError(`"${rawHost}" is not a host name.`);
  if (!isUnderDomain(host, ctx.rootDomain)) throw new SiteInputError(`${host} is not under ${ctx.rootDomain}.`);
  const [row] = await db
    .insert(siteHosts)
    .values({ siteId, host, discoveredVia: "manual", discoveredViaAll: ["manual"], included: true, includedByUser: true })
    .onConflictDoUpdate({ target: [siteHosts.siteId, siteHosts.host], set: { included: true, includedByUser: true, updatedAt: new Date() } })
    .returning();
  return row;
}

export const MAX_PAGE_CAP = 2000;

export async function startCrawl(db: Db, opts: { siteId: string; userId: string; pageCapPerHost: number }) {
  const cap = Math.floor(opts.pageCapPerHost);
  if (!Number.isFinite(cap) || cap < 1 || cap > MAX_PAGE_CAP) throw new SiteInputError(`Page cap per host must be between 1 and ${MAX_PAGE_CAP}.`);
  const included = await db.select().from(siteHosts).where(and(eq(siteHosts.siteId, opts.siteId), eq(siteHosts.included, true)));
  if (!included.length) throw new SiteInputError("Include at least one host before crawling.");
  const [running] = await db
    .select({ id: crawlRuns.id })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.siteId, opts.siteId), inArray(crawlRuns.status, ["queued", "running"])));
  if (running) throw new SiteInputError("A crawl is already queued or running for this site.");
  const hostIds = included.sort((a, b) => a.host.localeCompare(b.host)).map((h) => h.id);
  const [run] = await db.insert(crawlRuns).values({ siteId: opts.siteId, pageCapPerHost: cap, hostIds, createdBy: opts.userId }).returning();
  return run;
}

export async function listCandidates(db: Db, siteId: string) {
  return db.select().from(entityCandidates).where(eq(entityCandidates.siteId, siteId)).orderBy(asc(entityCandidates.kind), asc(entityCandidates.normalized));
}

export async function saveProfile(db: Db, opts: { siteId: string; orgId: string; userId: string; profile: Record<string, unknown> }) {
  const ctx = await siteContext(db, opts.siteId, opts.orgId);
  const next: Profile = {};
  for (const f of PROFILE_FIELDS) {
    const v = opts.profile[f];
    if (v === undefined || v === null || String(v).trim() === "") continue;
    if (f === "founding_year" || f === "enrollment_total" || f === "enrollment_undergrad") {
      const n = Number(String(v).replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 0) throw new SiteInputError(`${f} must be a number.`);
      next[f] = n;
    } else {
      next[f] = String(v).trim();
    }
  }
  if (!next.name) throw new SiteInputError("The institution name is required.");
  next.confirmed_by = opts.userId;
  next.confirmed_at = new Date().toISOString();
  const before = ctx.brand.profile;
  const unitid = typeof opts.profile.ipeds_unitid === "string" && /^\d{6}$/.test(opts.profile.ipeds_unitid.trim()) ? opts.profile.ipeds_unitid.trim() : undefined;
  await db.update(brands).set({ profile: next, name: String(next.name), ...(unitid ? { ipedsUnitid: unitid } : {}) }).where(eq(brands.id, ctx.brand.id));
  return { before, after: next };
}

export async function entityCheckView(db: Db, siteId: string, orgId: string) {
  const ctx = await siteContext(db, siteId, orgId);
  return latestEntityChecks(db, ctx.brand.id);
}

export type ReportFilter = { crawlRunId?: string | null; auditRunId?: string | null; hostId?: string | null; severity?: string | null; ruleId?: string | null; limit?: number; offset?: number };

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

export async function auditReport(db: Db, orgId: string, siteId: string, filter: ReportFilter) {
  await siteContext(db, siteId, orgId);
  let auditRunId = filter.auditRunId ?? null;
  if (!auditRunId) {
    const runs = filter.crawlRunId
      ? await db.select().from(auditRuns).where(eq(auditRuns.crawlRunId, filter.crawlRunId)).orderBy(desc(auditRuns.createdAt)).limit(1)
      : await db
          .select({ ar: auditRuns })
          .from(auditRuns)
          .innerJoin(crawlRuns, eq(crawlRuns.id, auditRuns.crawlRunId))
          .where(eq(crawlRuns.siteId, siteId))
          .orderBy(desc(auditRuns.createdAt))
          .limit(1)
          .then((r) => r.map((x) => x.ar));
    auditRunId = runs[0]?.id ?? null;
  }
  if (!auditRunId) return null;
  const [ar] = await db.select().from(auditRuns).where(eq(auditRuns.id, auditRunId));
  const [crawl] = await db.select().from(crawlRuns).where(and(eq(crawlRuns.id, ar.crawlRunId), eq(crawlRuns.siteId, siteId)));
  if (!crawl) return null;
  const hostRows = crawl.hostIds.length ? await db.select({ id: siteHosts.id, host: siteHosts.host }).from(siteHosts).where(inArray(siteHosts.id, crawl.hostIds)) : [];
  const hostName = new Map(hostRows.map((h) => [h.id, h.host]));

  const counts = await db
    .select({ hostId: auditFindings.hostId, severity: auditFindings.severity, n: count() })
    .from(auditFindings)
    .where(eq(auditFindings.auditRunId, auditRunId))
    .groupBy(auditFindings.hostId, auditFindings.severity);
  const byRule = await db
    .select({ ruleId: auditFindings.ruleId, severity: auditFindings.severity, n: count() })
    .from(auditFindings)
    .where(eq(auditFindings.auditRunId, auditRunId))
    .groupBy(auditFindings.ruleId, auditFindings.severity);

  const conds = [eq(auditFindings.auditRunId, auditRunId)];
  if (filter.hostId === "none") conds.push(sql`${auditFindings.hostId} IS NULL`);
  else if (filter.hostId) conds.push(eq(auditFindings.hostId, filter.hostId));
  if (filter.severity) conds.push(sql`${auditFindings.severity}::text = ${filter.severity}`);
  if (filter.ruleId) conds.push(eq(auditFindings.ruleId, filter.ruleId));
  const where = and(...conds);
  const [{ total }] = await db.select({ total: count() }).from(auditFindings).where(where);
  const rows = await db
    .select({ f: auditFindings, rule: auditRules, pageUrl: crawlPages.url })
    .from(auditFindings)
    .innerJoin(auditRules, eq(auditRules.id, auditFindings.ruleId))
    .leftJoin(crawlPages, eq(crawlPages.id, auditFindings.pageId))
    .where(where)
    .orderBy(sql`array_position(ARRAY['critical','high','medium','low','info']::text[], ${auditFindings.severity}::text)`, asc(auditFindings.ruleId), asc(crawlPages.url))
    .limit(Math.min(filter.limit ?? 200, 1000))
    .offset(filter.offset ?? 0);
  const rules = await db.select().from(auditRules).orderBy(asc(auditRules.id));
  const psi = await db.select().from(pagespeedResults).where(eq(pagespeedResults.crawlRunId, crawl.id));
  return {
    audit_run: { id: ar.id, crawl_run_id: ar.crawlRunId, rules_version: ar.rulesVersion, finding_count: ar.findingCount, findings_sha256: ar.findingsSha256, created_at: ar.createdAt },
    crawl: { id: crawl.id, status: crawl.status, page_count: crawl.pageCount, page_cap_per_host: crawl.pageCapPerHost, finished_at: crawl.finishedAt },
    hosts: hostRows.sort((a, b) => a.host.localeCompare(b.host)),
    severities: SEVERITY_ORDER,
    counts_by_host: counts.map((c) => ({ host_id: c.hostId, host: c.hostId ? (hostName.get(c.hostId) ?? "?") : "site wide", severity: c.severity, n: c.n })),
    counts_by_rule: byRule,
    rules: rules.map((r) => ({ id: r.id, title: r.title, why: r.why, evidence_strength: r.evidenceStrength })),
    pagespeed: { tested: psi.length, failed: psi.filter((p) => !p.ok).length },
    total,
    findings: rows.map(({ f, rule, pageUrl }) => ({
      id: f.id,
      rule_id: f.ruleId,
      title: rule.title,
      why: rule.why,
      evidence_strength: rule.evidenceStrength,
      severity: f.severity,
      host_id: f.hostId,
      host: f.hostId ? (hostName.get(f.hostId) ?? null) : null,
      page_id: f.pageId,
      page_url: pageUrl,
      detail: f.detail,
    })),
  };
}

export async function pageDetail(db: Db, orgId: string, pageId: string, auditRunId: string | null) {
  const [page] = await db.select().from(crawlPages).where(eq(crawlPages.id, pageId));
  if (!page) return null;
  const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, page.crawlRunId));
  await siteContext(db, run.siteId, orgId);
  const ar = auditRunId ?? (await db.select().from(auditRuns).where(eq(auditRuns.crawlRunId, run.id)).orderBy(desc(auditRuns.createdAt)).limit(1))[0]?.id;
  const findings = ar
    ? await db
        .select({ f: auditFindings, rule: auditRules })
        .from(auditFindings)
        .innerJoin(auditRules, eq(auditRules.id, auditFindings.ruleId))
        .where(and(eq(auditFindings.auditRunId, ar), eq(auditFindings.pageId, pageId)))
    : [];
  const text = page.textRef ? await getRawText(db, page.textRef) : null;
  return {
    page: {
      id: page.id,
      url: page.url,
      canonical: page.canonical,
      status_code: page.statusCode,
      title: page.title,
      h1: page.h1,
      headings: page.headings,
      meta_description: page.metaDescription,
      word_count: page.wordCount,
      raw_word_count: page.rawWordCount,
      render_mode: page.renderMode,
      lastmod: page.lastmod,
      visible_dates: page.visibleDates,
      schema_types: page.schemaTypes,
      faq: page.faq,
      robots_meta: page.robotsMeta,
      fetch_error: page.fetchError,
      content_hash: page.contentHash,
      outbound_link_count: Array.isArray(page.outboundLinks) ? page.outboundLinks.length : 0,
      text_excerpt: text ? text.slice(0, 2000) : null,
    },
    findings: findings.map(({ f, rule }) => ({ id: f.id, rule_id: f.ruleId, title: rule.title, why: rule.why, evidence_strength: rule.evidenceStrength, severity: f.severity, detail: f.detail })),
  };
}

export async function botHitsView(db: Db, orgId: string, siteId: string) {
  await siteContext(db, siteId, orgId);
  const byBot = await db
    .select({ bot: botHits.botName, n: count(), paths: sql<number>`count(distinct ${botHits.path})::int`, first: sql<string>`min(${botHits.hitAt})`, last: sql<string>`max(${botHits.hitAt})` })
    .from(botHits)
    .where(eq(botHits.siteId, siteId))
    .groupBy(botHits.botName)
    .orderBy(desc(count()));
  const byPath = await db
    .select({ bot: botHits.botName, host: botHits.host, path: botHits.path, n: count(), ok: sql<number>`count(*) filter (where ${botHits.statusCode} between 200 and 299)::int` })
    .from(botHits)
    .where(eq(botHits.siteId, siteId))
    .groupBy(botHits.botName, botHits.host, botHits.path)
    .orderBy(desc(count()))
    .limit(300);
  const imports = await db.select().from(botLogImports).where(eq(botLogImports.siteId, siteId)).orderBy(desc(botLogImports.createdAt));
  return {
    by_bot: byBot.map((b) => ({ ...b, ...botInfo(b.bot) })),
    by_path: byPath,
    imports: imports.map((i) => ({ id: i.id, file_name: i.fileName, file_sha256: i.fileSha256, format: i.format, lines_total: i.linesTotal, lines_unparsed: i.linesUnparsed, bot_lines: i.botLines, created_at: i.createdAt })),
  };
}
