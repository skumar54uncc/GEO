import crypto from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { auditFindings, auditRules, auditRuns, crawlPages, crawlRuns, entityChecks, pagespeedResults, siteHosts } from "@/lib/db/pg/schema";
import { getRawText } from "@/lib/rawstore";
import { siteContext } from "../context";
import type { FaqItem } from "../extract";
import { stableStringify } from "../providerCall";
import { evaluateRules, RULES, RULES_VERSION, type AuditInput, type Finding } from "./rules";

export async function seedAuditRules(db: Db): Promise<void> {
  for (const r of RULES) {
    await db
      .insert(auditRules)
      .values({ id: r.id, title: r.title, why: r.why, evidenceStrength: r.evidence_strength })
      .onConflictDoUpdate({ target: auditRules.id, set: { title: r.title, why: r.why, evidenceStrength: r.evidence_strength } });
  }
}

/** Latest check per (source, field) for the brand. */
export async function latestEntityChecks(db: Db, brandId: string) {
  const rows = await db.select().from(entityChecks).where(eq(entityChecks.brandId, brandId)).orderBy(desc(entityChecks.checkedAt));
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.source}:${r.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function loadAuditInput(db: Db, crawlRunId: string): Promise<AuditInput> {
  const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, crawlRunId));
  if (!run) throw new Error("crawl run not found");
  const ctx = await siteContext(db, run.siteId);
  const hostRows = run.hostIds.length ? await db.select().from(siteHosts).where(inArray(siteHosts.id, run.hostIds)) : [];
  const allHosts = await db
    .select({ host: siteHosts.host, rootFinalUrl: siteHosts.rootFinalUrl })
    .from(siteHosts)
    .where(eq(siteHosts.siteId, run.siteId));
  // The primary host is where the root URL lands (charlotte.edu redirects to www.charlotte.edu).
  const rootFinal = allHosts.find((h) => h.host === ctx.rootHost)?.rootFinalUrl;
  const primaryHost = rootFinal ? new URL(rootFinal).hostname.toLowerCase() : ctx.rootHost;
  const hosts: AuditInput["hosts"] = [];
  for (const h of hostRows.sort((a, b) => a.host.localeCompare(b.host))) {
    hosts.push({
      id: h.id,
      host: h.host,
      isPrimary: h.host === primaryHost,
      robotsStatus: h.robotsStatus,
      robotsText: h.robotsRef ? await getRawText(db, h.robotsRef) : null,
      llmsTxtStatus: h.llmsTxtStatus,
    });
  }
  const pages = (await db.select().from(crawlPages).where(eq(crawlPages.crawlRunId, crawlRunId))).sort((a, b) => a.url.localeCompare(b.url));
  const psi = await db.select().from(pagespeedResults).where(eq(pagespeedResults.crawlRunId, crawlRunId));
  const hostOfPage = new Map(pages.map((p) => [p.id, p.hostId]));
  return {
    asOf: run.finishedAt ?? run.createdAt,
    siteHosts: allHosts.map((h) => h.host),
    hosts,
    pages: pages.map((p) => ({
      id: p.id,
      hostId: p.hostId,
      url: p.url,
      canonical: p.canonical,
      statusCode: p.statusCode,
      title: p.title,
      h1: p.h1,
      metaDescription: p.metaDescription,
      wordCount: p.wordCount,
      rawWordCount: p.rawWordCount,
      lastmod: p.lastmod,
      schemaTypes: p.schemaTypes,
      schemaRaw: p.schemaRaw,
      faq: (p.faq as FaqItem[] | null) ?? null,
      renderMode: p.renderMode,
      visibleDates: p.visibleDates,
      robotsMeta: p.robotsMeta,
      contentType: p.contentType,
      fetchError: p.fetchError,
    })),
    pagespeed: psi
      .map((r) => ({
        pageId: r.pageId,
        hostId: (r.pageId && hostOfPage.get(r.pageId)) || hosts[0]?.id || "",
        url: r.url,
        strategy: r.strategy,
        ok: r.ok,
        score: r.performanceScore === null ? null : Number(r.performanceScore),
        error: r.error,
      }))
      .sort((a, b) => a.url.localeCompare(b.url)),
    entityChecks: (await latestEntityChecks(db, ctx.brand.id))
      .map((c) => ({ source: c.source, field: c.field, status: c.status, observed: c.observed, expected: c.expected }))
      .sort((a, b) => `${a.source}:${a.field}`.localeCompare(`${b.source}:${b.field}`)),
  };
}

export function sortFindings(findings: Finding[]): Finding[] {
  const key = (f: Finding) => `${f.ruleId}|${f.hostId ?? ""}|${f.pageId ?? ""}|${stableStringify(f.detail)}`;
  return [...findings].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

export function findingsFingerprint(findings: Finding[]): string {
  const canonical = stableStringify({ rules_version: RULES_VERSION, findings: sortFindings(findings) });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/** audit.run: evaluates every rule on one crawl and stores a new audit run. Never edits an old one. */
export async function runAudit(db: Db, crawlRunId: string, opts: { userId?: string | null } = {}) {
  await seedAuditRules(db);
  const input = await loadAuditInput(db, crawlRunId);
  const findings = sortFindings(evaluateRules(input));
  const sha = findingsFingerprint(findings);
  const auditRunId = await db.transaction(async (tx) => {
    const [ar] = await tx
      .insert(auditRuns)
      .values({ crawlRunId, rulesVersion: RULES_VERSION, findingCount: findings.length, findingsSha256: sha, createdBy: opts.userId ?? null })
      .returning({ id: auditRuns.id });
    for (let i = 0; i < findings.length; i += 500) {
      const chunk = findings.slice(i, i + 500);
      await tx.insert(auditFindings).values(
        chunk.map((f) => ({ auditRunId: ar.id, crawlRunId, ruleId: f.ruleId, severity: f.severity, hostId: f.hostId, pageId: f.pageId, detail: f.detail })),
      );
    }
    return ar.id;
  });
  return { auditRunId, findingCount: findings.length, findingsSha256: sha };
}

export async function latestAuditRun(db: Db, crawlRunId: string) {
  const [row] = await db.select().from(auditRuns).where(and(eq(auditRuns.crawlRunId, crawlRunId))).orderBy(desc(auditRuns.createdAt)).limit(1);
  return row ?? null;
}
