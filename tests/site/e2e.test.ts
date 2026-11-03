import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as auditGET } from "@/app/api/sites/[id]/audit/route";
import { PATCH as hostsPATCH } from "@/app/api/sites/[id]/hosts/route";
import { POST as crawlPOST } from "@/app/api/sites/[id]/crawl/route";
import { GET as siteGET } from "@/app/api/sites/[id]/route";
import { POST as sitesPOST } from "@/app/api/sites/route";
import { GET as pageGET } from "@/app/api/audit/pages/[id]/route";
import { getDb } from "@/lib/db/pg/client";
import { crawlPages, crawlRuns, entityCandidates, siteHosts } from "@/lib/db/pg/schema";
import { jobClient } from "@/lib/jobs";
import { runAudit } from "@/lib/site/audit/run";
import { crawlHost, ExcludedHostError, type CrawlDeps } from "@/lib/site/crawl";
import { defaultFetcher, discoverSite, type DiscoveryDeps } from "@/lib/site/discovery";
import { extractEntityCandidates, loadEntityPages, saveCandidates } from "@/lib/site/entities";
import { CRAWLER_TOKEN, crawlerUserAgent } from "@/lib/site/net/userAgent";
import { fixturePolicy, startFixtureSite, type FixtureSite } from "../fixtures/site/server";
import { cookieFor, req, resetDatabase } from "../helpers";

describe("end to end: onboard, discover, crawl, audit, report", () => {
  let fx: FixtureSite;
  let cookie: string;
  let siteId: string;
  let crawlRunId: string;
  const ua = crawlerUserAgent("mailto:geo-test@example.test");

  beforeAll(async () => {
    process.env.CRAWLER_CONTACT_URL = "mailto:geo-test@example.test";
    await resetDatabase();
    fx = await startFixtureSite();
    cookie = await cookieFor("e2e-editor@example.test", "editor");
  });

  afterAll(async () => {
    await fx?.close();
    await (await jobClient()).stop({ graceful: false });
  });

  it("onboards the root URL and discovers hosts", async () => {
    const res = await sitesPOST(req("/api/sites", { method: "POST", cookie, body: { root_url: fx.rootUrl } }));
    expect(res.status).toBe(201);
    const body = await res.json();
    siteId = body.site.id;
    expect(body.job_id).toBeTruthy();

    // The worker would run this job; here it runs in process against the fixture hosts.
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
    const summary = await discoverSite(getDb(), siteId, deps);
    expect(summary.sitemap_files_fetched).toBe(3);
    expect(summary.sitemap_urls).toBe(10);

    const view = await (await siteGET(req(`/api/sites/${siteId}`, { cookie }), { params: { id: siteId } })).json();
    const h = Object.fromEntries(view.hosts.map((x: { host: string }) => [x.host, x]));
    expect(h["www.fixture.test"]).toMatchObject({ included: true, robots_status: 200, llms_txt_status: 404 });
    expect(h["admissions.fixture.test"]).toMatchObject({ included: true, llms_txt_status: 200 });
    expect(h["admissions.fixture.test"].discovered_via).toContain("sitemap");
    expect(h["research.fixture.test"].included).toBe(true);
    expect(h["athletics.fixture.test"].included).toBe(true);
    expect(h["fixture.test"]).toMatchObject({ included: false, exclude_reason: "redirects to www.fixture.test" });
    expect(h["login.fixture.test"]).toMatchObject({ included: false, login_portal: true });
    expect(h["login.fixture.test"].discovered_via).toEqual(expect.arrayContaining(["link", "ct_log"]));
    expect(h["dev.fixture.test"].exclude_reason).toMatch(/dev, test or staging/);
    expect(h["broken.fixture.test"].exclude_reason).toBe("root returns HTTP 500");
    expect(h["cci.fixture.test"].exclude_reason).toBe("root returns HTTP 404");
    expect(h["nowhere.fixture.test"]).toMatchObject({ included: false, resolves: false, exclude_reason: "does not resolve", discovered_via: ["ct_log"] });
  });

  it("the user excludes a host and starts a crawl of included hosts only", async () => {
    const db = getDb();
    const [athletics] = await db.select().from(siteHosts).where(eq(siteHosts.host, "athletics.fixture.test"));
    const patch = await hostsPATCH(req(`/api/sites/${siteId}/hosts`, { method: "PATCH", cookie, body: { host_id: athletics.id, included: false } }), { params: { id: siteId } });
    expect(patch.status).toBe(200);

    const res = await crawlPOST(req(`/api/sites/${siteId}/crawl`, { method: "POST", cookie, body: { page_cap_per_host: 25 } }), { params: { id: siteId } });
    expect(res.status).toBe(202);
    const run = (await res.json()).crawl_run;
    crawlRunId = run.id;
    const included = await db.select().from(siteHosts).where(eq(siteHosts.included, true));
    expect(run.hostIds.sort()).toEqual(included.map((x) => x.id).sort());
    expect(run.hostIds).not.toContain(athletics.id);
  });

  it(
    "crawls with Playwright, respects robots.txt, never touches excluded hosts",
    async () => {
      const db = getDb();
      const deps: CrawlDeps = {
        userAgent: ua,
        policy: fixturePolicy,
        browserArgs: ["--host-resolver-rules=MAP *.fixture.test 127.0.0.1, MAP fixture.test 127.0.0.1"],
        maxConcurrency: 4,
        maxRequestsPerMinute: 600,
        navigationTimeoutSecs: 20,
      };
      const startedAt = fx.requests.length;
      const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, crawlRunId));
      let last = { runComplete: false };
      for (const hostId of run.hostIds) last = await crawlHost(db, crawlRunId, hostId, deps);
      expect(last.runComplete).toBe(true);

      const [athletics] = await db.select().from(siteHosts).where(eq(siteHosts.host, "athletics.fixture.test"));
      await expect(crawlHost(db, crawlRunId, athletics.id, deps)).rejects.toBeInstanceOf(ExcludedHostError);

      const during = fx.requests.slice(startedAt);
      expect(during.length).toBeGreaterThan(10);
      expect(during.every((r) => r.ua.includes(CRAWLER_TOKEN))).toBe(true);
      expect(during.some((r) => r.host === "athletics.fixture.test")).toBe(false);
      expect(during.some((r) => r.url.startsWith("/admin/"))).toBe(false);
      expect(during.some((r) => r.url.endsWith(".pdf"))).toBe(false);

      const pages = await db.select().from(crawlPages).where(eq(crawlPages.crawlRunId, crawlRunId));
      const byPath = Object.fromEntries(pages.map((p) => [new URL(p.url).host.split(":")[0] + new URL(p.url).pathname, p]));
      expect(byPath["www.fixture.test/news/js-app/"].renderMode).toBe("js");
      expect(byPath["www.fixture.test/programs/computer-science/"]).toMatchObject({ renderMode: "static", title: "Computer Science, B.S. | UNC Charlotte" });
      expect(byPath["www.fixture.test/programs/computer-science/"].lastmod?.toISOString().slice(0, 10)).toBe("2021-01-15");
      expect(byPath["www.fixture.test/gone/"].statusCode).toBe(404);
      expect(byPath["admissions.fixture.test/apply/"]).toBeTruthy();
      expect(byPath["www.fixture.test/admin/secret/"]).toBeUndefined();
      expect(byPath["www.fixture.test/"].textRef).toBeTruthy();
      const [done] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, crawlRunId));
      expect(done.status).toBe("complete");
      expect(done.pageCount).toBe(pages.length);
    },
    180_000,
  );

  it("extracts entities with source URLs, Charlotte alone needing context", async () => {
    const db = getDb();
    await saveCandidates(db, siteId, crawlRunId, extractEntityCandidates(await loadEntityPages(db, crawlRunId)));
    const rows = await db.select().from(entityCandidates).where(eq(entityCandidates.siteId, siteId));
    expect(rows.find((r) => r.kind === "name")?.value).toBe("University of North Carolina at Charlotte");
    expect(rows.find((r) => r.kind === "alias" && r.value === "Charlotte")?.requiresContext).toBe(true);
    expect(rows.every((r) => r.sourceUrl.startsWith("http://"))).toBe(true);
  });

  it("audits, and a rerun on the same crawl gives identical findings", async () => {
    const db = getDb();
    const a = await runAudit(db, crawlRunId);
    const b = await runAudit(db, crawlRunId);
    expect(a.auditRunId).not.toBe(b.auditRunId);
    expect(b.findingsSha256).toBe(a.findingsSha256);
    expect(b.findingCount).toBe(a.findingCount);
  });

  it("the report filters by host and severity, and every finding has why and evidence strength", async () => {
    const res = await auditGET(req(`/api/sites/${siteId}/audit`, { cookie }), { params: { id: siteId } });
    const { report } = await res.json();
    expect(report.findings.length).toBe(report.total);
    for (const f of report.findings) {
      expect(f.why.length).toBeGreaterThan(20);
      expect(["strong", "moderate", "weak", "speculative"]).toContain(f.evidence_strength);
    }
    const rules = new Set(report.findings.map((f: { rule_id: string }) => f.rule_id));
    for (const r of [
      "ai_crawler_blocked",
      "ai_crawler_partially_blocked",
      "js_only_content",
      "thin_page",
      "canonical_broken",
      "duplicate_title",
      "duplicate_h1",
      "content_stale",
      "schema_program_missing",
      "schema_faqpage_missing",
      "schema_event_missing",
      "schema_org_sameas_missing",
      "meta_description_missing",
      "faq_absent",
      "llms_txt_missing",
      "robots_txt_unavailable",
    ]) {
      expect(rules.has(r), r).toBe(true);
    }
    const gpt = report.findings.find((f: { rule_id: string; detail: { bot?: string } }) => f.rule_id === "ai_crawler_blocked" && f.detail.bot === "GPTBot");
    expect(gpt).toMatchObject({ host: "www.fixture.test", severity: "info" });
    const llms = report.findings.filter((f: { rule_id: string }) => f.rule_id === "llms_txt_missing").map((f: { host: string }) => f.host);
    expect(llms).toContain("www.fixture.test");
    expect(llms).not.toContain("admissions.fixture.test");
    expect(report.counts_by_host.length).toBeGreaterThan(0);

    const www = report.hosts.find((h: { host: string }) => h.host === "www.fixture.test");
    const high = await (await auditGET(req(`/api/sites/${siteId}/audit?host_id=${www.id}&severity=high`, { cookie }), { params: { id: siteId } })).json();
    expect(high.report.findings.length).toBeGreaterThan(0);
    expect(high.report.findings.every((f: { severity: string; host: string }) => f.severity === "high" && f.host === "www.fixture.test")).toBe(true);

    const js = report.findings.find((f: { rule_id: string }) => f.rule_id === "js_only_content");
    const detail = await (await pageGET(req(`/api/audit/pages/${js.page_id}`, { cookie }), { params: { id: js.page_id } })).json();
    expect(detail.page.render_mode).toBe("js");
    expect(detail.findings.map((f: { rule_id: string }) => f.rule_id)).toContain("js_only_content");
  });
});
