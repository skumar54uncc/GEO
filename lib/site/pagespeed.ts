import { eq } from "drizzle-orm";
import { checkBudget } from "@/lib/cost/guard";
import type { Db } from "@/lib/db/pg/client";
import { crawlPages, crawlRuns, pagespeedResults, siteHosts } from "@/lib/db/pg/schema";
import { siteContext } from "./context";
import { guardedFetch } from "./net/ssrf";
import { sleep } from "./pool";
import { providerCall } from "./providerCall";

const PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
export const PSI_STRATEGY = "mobile";

export type PageSpeedDeps = {
  apiKey: string | null;
  pagesPerHost: number;
  delayMs: number;
  fetchPsi: (url: string, apiKey: string) => Promise<{ ok: boolean; body: string; error: string | null }>;
};

export function livePageSpeedDeps(overrides: Partial<PageSpeedDeps> = {}): PageSpeedDeps {
  return {
    apiKey: process.env.PAGESPEED_API_KEY || null,
    pagesPerHost: Number(process.env.PAGESPEED_PAGES_PER_HOST || 3),
    delayMs: 1500,
    fetchPsi: async (url, apiKey) => {
      const q = new URLSearchParams({ url, strategy: PSI_STRATEGY, category: "performance", key: apiKey });
      const r = await guardedFetch(`${PSI_URL}?${q}`, { userAgent: "UNCCGEOAudit", timeoutMs: 120_000, accept: "application/json" });
      const body = r.body.toString("utf8");
      if (!r.ok) {
        let msg = r.error ?? r.blocked ?? `HTTP ${r.status}`;
        try {
          msg = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? msg;
        } catch {
          /* not JSON */
        }
        return { ok: false, body, error: msg };
      }
      return { ok: true, body, error: null };
    },
    ...overrides,
  };
}

/** Home page first, then the pages most linked from other crawled pages. Ties break by URL. */
export function topPagesPerHost(
  pages: Array<{ id: string; hostId: string; url: string; statusCode: number | null; outboundLinks: unknown }>,
  perHost: number,
): Array<{ id: string; hostId: string; url: string }> {
  const ok = pages.filter((p) => p.statusCode !== null && p.statusCode >= 200 && p.statusCode < 300);
  const inbound = new Map<string, number>();
  for (const p of ok) {
    for (const l of (p.outboundLinks as Array<{ url: string; internal: boolean }> | null) ?? []) {
      if (l.internal && l.url !== p.url) inbound.set(l.url, (inbound.get(l.url) ?? 0) + 1);
    }
  }
  const byHost = new Map<string, typeof ok>();
  for (const p of ok) {
    if (!byHost.has(p.hostId)) byHost.set(p.hostId, []);
    byHost.get(p.hostId)!.push(p);
  }
  const out: Array<{ id: string; hostId: string; url: string }> = [];
  for (const list of Array.from(byHost.values())) {
    const sorted = [...list].sort((a, b) => {
      const ha = new URL(a.url).pathname === "/" ? 1 : 0;
      const hb = new URL(b.url).pathname === "/" ? 1 : 0;
      return hb - ha || (inbound.get(b.url) ?? 0) - (inbound.get(a.url) ?? 0) || a.url.localeCompare(b.url);
    });
    out.push(...sorted.slice(0, perHost).map((p) => ({ id: p.id, hostId: p.hostId, url: p.url })));
  }
  return out;
}

export type PageSpeedSummary = { status: "skipped" | "refused" | "ran" | "already_ran"; reason: string | null; tested: number; failed: number };

/**
 * Runs PageSpeed once per crawl. Later audit runs reuse the stored rows, which keeps reruns identical.
 * The batch is checked against the cost guard before the first call.
 */
export async function ensurePageSpeed(db: Db, crawlRunId: string, deps: PageSpeedDeps): Promise<PageSpeedSummary> {
  const existing = await db.select({ id: pagespeedResults.id }).from(pagespeedResults).where(eq(pagespeedResults.crawlRunId, crawlRunId)).limit(1);
  if (existing.length) return { status: "already_ran", reason: null, tested: 0, failed: 0 };
  if (!deps.apiKey) return { status: "skipped", reason: "PAGESPEED_API_KEY is not set", tested: 0, failed: 0 };
  const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, crawlRunId));
  const ctx = await siteContext(db, run.siteId);
  const pages = await db
    .select({ id: crawlPages.id, hostId: crawlPages.hostId, url: crawlPages.url, statusCode: crawlPages.statusCode, outboundLinks: crawlPages.outboundLinks })
    .from(crawlPages)
    .innerJoin(siteHosts, eq(siteHosts.id, crawlPages.hostId))
    .where(eq(crawlPages.crawlRunId, crawlRunId));
  const targets = topPagesPerHost(pages, deps.pagesPerHost);
  const budget = await checkBudget(db, ctx.orgId, "pagespeed", { units: targets.length });
  if (!budget.allowed) return { status: "refused", reason: budget.reason, tested: 0, failed: 0 };

  let failed = 0;
  for (const [i, t] of targets.entries()) {
    if (i > 0) await sleep(deps.delayMs);
    const res = await providerCall(db, {
      orgId: ctx.orgId,
      provider: "pagespeed",
      engine: "psi_v5",
      params: { url: t.url, strategy: PSI_STRATEGY, category: "performance", crawl_run_id: crawlRunId },
      units: 1,
      call: () => deps.fetchPsi(t.url, deps.apiKey!),
    });
    let score: number | null = null;
    let metrics: Record<string, unknown> | null = null;
    let error: string | null = res.ok ? null : res.error;
    if (res.ok) {
      try {
        const j = JSON.parse(res.body) as {
          lighthouseResult?: { categories?: { performance?: { score?: number | null } }; audits?: Record<string, { numericValue?: number }> };
        };
        score = j.lighthouseResult?.categories?.performance?.score ?? null;
        const a = j.lighthouseResult?.audits ?? {};
        metrics = {
          lcp_ms: a["largest-contentful-paint"]?.numericValue ?? null,
          cls: a["cumulative-layout-shift"]?.numericValue ?? null,
          tbt_ms: a["total-blocking-time"]?.numericValue ?? null,
          fcp_ms: a["first-contentful-paint"]?.numericValue ?? null,
        };
        if (score === null) error = "response had no performance score";
      } catch {
        error = "response was not JSON";
      }
    }
    if (error) failed++;
    await db
      .insert(pagespeedResults)
      .values({
        crawlRunId,
        pageId: t.id,
        url: t.url,
        strategy: PSI_STRATEGY,
        ok: !error,
        performanceScore: score === null ? null : String(score),
        metrics,
        rawPayloadId: res.ok ? res.rawPayloadId : null,
        error,
      })
      .onConflictDoNothing();
  }
  return { status: "ran", reason: null, tested: targets.length, failed };
}
