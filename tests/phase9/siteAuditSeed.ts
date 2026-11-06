/**
 * Minimal site → crawl → audit seed for browser e2e (reuses patterns from tests/site/e2e.test.ts).
 */
import { eq } from "drizzle-orm";
import { GET as auditGET } from "@/app/api/sites/[id]/audit/route";
import { PATCH as hostsPATCH } from "@/app/api/sites/[id]/hosts/route";
import { POST as crawlPOST } from "@/app/api/sites/[id]/crawl/route";
import { POST as sitesPOST } from "@/app/api/sites/route";
import { getDb } from "@/lib/db/pg/client";
import { crawlRuns, siteHosts } from "@/lib/db/pg/schema";
import { runAudit } from "@/lib/site/audit/run";
import { crawlHost, type CrawlDeps } from "@/lib/site/crawl";
import { defaultFetcher, discoverSite, type DiscoveryDeps } from "@/lib/site/discovery";
import { extractEntityCandidates, loadEntityPages, saveCandidates } from "@/lib/site/entities";
import { crawlerUserAgent } from "@/lib/site/net/userAgent";
import { jobClient } from "@/lib/jobs";
import { fixturePolicy, startFixtureSite, type FixtureSite } from "../fixtures/site/server";
import { req } from "../helpers";

export type SiteAuditSeed = { fx: FixtureSite; siteId: string; cookie: string; crawlRunId: string };

export async function seedSiteAudit(cookie: string): Promise<SiteAuditSeed> {
  process.env.CRAWLER_CONTACT_URL = "mailto:geo-phase9@example.test";
  const fx = await startFixtureSite();
  const ua = crawlerUserAgent("mailto:geo-phase9@example.test");

  const res = await sitesPOST(req("/api/sites", { method: "POST", cookie, body: { root_url: fx.rootUrl } }));
  if (res.status !== 201) throw new Error(`sites POST ${res.status}`);
  const body = (await res.json()) as { site: { id: string } };
  const siteId = body.site.id;

  const deps: DiscoveryDeps = {
    fetch: defaultFetcher(ua, fixturePolicy),
    ctLookup: async () => ({
      ok: true,
      error: null,
      hosts: ["nowhere.fixture.test", "dev.fixture.test", "athletics.fixture.test", "broken.fixture.test", "login.fixture.test"],
    }),
    maxHostChecks: 50,
    maxSitemapFiles: 10,
    maxSitemapUrls: 1000,
    sitemapPagesToScan: 5,
    concurrency: 4,
  };
  await discoverSite(getDb(), siteId, deps);

  const db = getDb();
  const [athletics] = await db.select().from(siteHosts).where(eq(siteHosts.host, "athletics.fixture.test"));
  await hostsPATCH(req(`/api/sites/${siteId}/hosts`, { method: "PATCH", cookie, body: { host_id: athletics.id, included: false } }), { params: { id: siteId } });

  const crawlRes = await crawlPOST(req(`/api/sites/${siteId}/crawl`, { method: "POST", cookie, body: { page_cap_per_host: 25 } }), { params: { id: siteId } });
  if (crawlRes.status !== 202) throw new Error(`crawl ${crawlRes.status}`);
  const run = (await crawlRes.json()) as { crawl_run: { id: string } };
  const crawlRunId = run.crawl_run.id;

  const crawlDeps: CrawlDeps = {
    userAgent: ua,
    policy: fixturePolicy,
    browserArgs: [],
    maxConcurrency: 4,
    maxRequestsPerMinute: 600,
    navigationTimeoutSecs: 20,
  };
  const [runRow] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, crawlRunId));
  for (const hostId of runRow.hostIds) await crawlHost(db, crawlRunId, hostId, crawlDeps);

  await saveCandidates(db, siteId, crawlRunId, extractEntityCandidates(await loadEntityPages(db, crawlRunId)));
  await runAudit(db, crawlRunId);

  const auditRes = await auditGET(req(`/api/sites/${siteId}/audit`, { cookie }), { params: { id: siteId } });
  const auditJson = (await auditRes.json()) as { report: { findings: unknown[] } };
  if (!auditJson.report?.findings?.length) throw new Error("expected audit findings after seed");

  return { fx, siteId, cookie, crawlRunId };
}

export async function stopSiteFixture(fx: FixtureSite | undefined): Promise<void> {
  await fx?.close();
  await (await jobClient()).stop({ graceful: false });
}
