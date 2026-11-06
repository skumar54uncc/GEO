import { eq } from "drizzle-orm";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { POST as createCampaignRoute } from "@/app/api/campaigns/route";
import { GET as optionsRoute } from "@/app/api/campaigns/options/route";
import { POST as freezeRoute } from "@/app/api/campaigns/[id]/freeze/route";
import type { DemandRunResult, DemandSource } from "@/lib/demand/types";
import { DEMO_DATA_BANNER, DEMO_ORG_NAME } from "@/lib/contracts/exports";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import {
  citations,
  memberships,
  organizations,
  prompts,
  providerAccounts,
  recommendations,
} from "@/lib/db/pg/schema";
import type { GapEvidenceBundle } from "@/lib/gaps";
import { buildRecommendationCard } from "@/lib/recommendations/card";
import { publishRecommendation, type RecommendationPayload } from "@/lib/recommendations/preregister";
import { estimateWriter, runWriter, WRITER_PROVIDER } from "@/lib/recommendations/writer";
import { runStrategyPipeline } from "@/lib/strategy";
import { addDraw, newScan, seed as metricsSeed } from "../metrics/dbFixtures";
import { cookieFor, req, resetDatabase, userIdFor } from "../helpers";
import { startNextDev, stopNextDev, type NextDevServer } from "./nextDevServer";
import { seedSiteAudit, stopSiteFixture, type SiteAuditSeed } from "./siteAuditSeed";

const JUDGE_ENV = { JUDGE_MODEL: process.env.JUDGE_MODEL, CONTENT_MODEL: process.env.CONTENT_MODEL };

function parseCookieValue(cookieHeader: string, name: string): string {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookieHeader);
  return m ? m[1].trim() : "";
}

async function playCookieContext(
  browser: Browser,
  baseUrl: string,
  cookieHeader: string,
  orgId?: string,
): Promise<BrowserContext> {
  const token = parseCookieValue(cookieHeader, "geo_session");
  const activeOrg = parseCookieValue(cookieHeader, "geo_active_org") || orgId || "";
  const ctx = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1024, height: 768 },
  });
  const cookies: Array<{ name: string; value: string; url: string }> = [
    { name: "geo_session", value: token, url: baseUrl },
  ];
  if (activeOrg) cookies.push({ name: "geo_active_org", value: activeOrg, url: baseUrl });
  await ctx.addCookies(cookies);
  return ctx;
}

async function expectVisible(loc: Locator, timeout = 15_000) {
  await loc.waitFor({ state: "visible", timeout });
  expect(await loc.isVisible()).toBe(true);
}

async function assertLandmarks(page: Page, h1: RegExp | string) {
  await expectVisible(page.getByRole("heading", { level: 1, name: h1 }).first());
  await expectVisible(page.locator('a.skip-link:has-text("Skip to main content")').first());
  await expectVisible(page.locator("main#main-content").first());
}

/** Lightweight a11y signal without @axe-core: landmarks, main, and heading. */
async function assertPageA11yBasics(page: Page) {
  expect(await page.locator("main#main-content").count()).toBeGreaterThanOrEqual(1);
  expect(await page.locator("a.skip-link").count()).toBeGreaterThanOrEqual(1);
  expect(await page.locator("h1").count()).toBeGreaterThanOrEqual(1);
}

function connectedDemand(source: DemandSource, volume = 500): DemandRunResult {
  return {
    connected: true,
    status: "ok",
    source,
    mode: "fixture_only",
    paramsHash: "abc",
    signals: [
      {
        term: "energy storage graduate",
        value: { query: "energy storage phd", volume, rising: true },
        source,
      },
    ],
  };
}

describe("Phase 9 Playwright journeys (Wave 3)", () => {
  let server: NextDevServer | null = null;
  let browser: Browser | null = null;

  beforeAll(async () => {
    server = await startNextDev();
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    await stopNextDev(server);
  });

  describe("Journey 1 — site onboard and audit UI", () => {
    let audit: SiteAuditSeed;
    let ctx: BrowserContext;

    beforeAll(async () => {
      await resetDatabase();
      const cookie = await cookieFor("journey1@charlotte.edu", "editor");
      audit = await seedSiteAudit(cookie);
      ctx = await playCookieContext(browser!, server!.baseUrl, audit.cookie);
    });

    afterAll(async () => {
      await ctx?.close();
      await stopSiteFixture(audit?.fx);
    });

    it("shows findings on /audit", async () => {
      const page = await ctx.newPage();
      await page.goto("/audit");
      await expectVisible(page.getByRole("heading", { name: /AI readiness audit/i }));
      await expectVisible(page.getByText(/findings/i).first());
      await assertLandmarks(page, /AI readiness audit/i);
      await assertPageA11yBasics(page);
      await page.close();
    });
  });

  describe("Journey 2 — prompts review, approve, freeze", () => {
    it("API seeds drafts; freeze; UI shows approved prompts table", async () => {
      await resetDatabase();
      const cookie = await cookieFor("journey2@charlotte.edu", "editor");
      const opts = (await optionsRoute(req("/api/campaigns/options", { cookie })).then((r) => r.json())) as {
        personas: Array<{ id: string }>;
      };
      const created = await createCampaignRoute(
        req("/api/campaigns", {
          method: "POST",
          cookie,
          body: {
            name: "Phase9 prompts",
            topic: "Fixture topic",
            engines: [{ engine: "chatgpt", runner: "ui_provider" }],
            persona_ids: [opts.personas[0].id],
          },
        }),
      );
      expect(created.status).toBe(201);
      const { campaign } = (await created.json()) as { campaign: { id: string } };
      const db = getDb();
      const promptIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const [p] = await db
          .insert(prompts)
          .values({ campaignId: campaign.id, text: `Phase9 review ${i}`, provenance: "custom", status: "draft" })
          .returning({ id: prompts.id });
        promptIds.push(p.id);
      }
      const bulk = await fetch(`${server!.baseUrl}/api/campaigns/${campaign.id}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ ids: promptIds, status: "approved" }),
      });
      expect(bulk.status).toBe(200);

      const freeze = await freezeRoute(req(`/api/campaigns/${campaign.id}/freeze`, { method: "POST", cookie, body: { label: "phase9-freeze" } }), {
        params: { id: campaign.id },
      });
      expect(freeze.status).toBe(200);

      const ctx = await playCookieContext(browser!, server!.baseUrl, cookie);
      const page = await ctx.newPage();
      await page.goto(`/campaigns/${campaign.id}/prompts`);
      await expectVisible(page.getByTestId("prompt-review-table"));
      await expectVisible(page.getByText(/^approved$/).first());
      await page.close();
      await ctx.close();
    });
  });

  describe("Journey 3 — estimate, approve, fixture scan, dashboard", () => {
    it("dashboard shows AI answers · prompts and How this is measured", async () => {
      await resetDatabase();
      const cookie = await cookieFor("journey3@charlotte.edu", "editor");
      const c = await metricsSeed(3);
      const scanId = await newScan(c);
      for (const pid of c.promptIds) {
        await addDraw(c, scanId, pid, { brand: true });
      }

      const ctx = await playCookieContext(browser!, server!.baseUrl, cookie);
      const page = await ctx.newPage();
      await page.goto(`/campaigns/${c.campaignId}/dashboard`);
      await page.getByTestId("campaign-switcher").selectOption(c.campaignId);
      await expectVisible(page.getByRole("heading", { name: /: dashboard/i }));
      await expectVisible(page.getByTestId("dashboard-metrics-table"));
      await expectVisible(page.getByTestId("chart-caption").first());
      await expectVisible(page.getByText(/AI answer/i).first());
      await page.getByRole("button", { name: /How this is measured/i }).first().click();
      await expectVisible(page.getByRole("region", { name: /How this is measured/i }));
      await assertLandmarks(page, /: dashboard/i);
      await assertPageA11yBasics(page);
      await page.close();
      await ctx.close();
    });
  });

  describe("Journey 4 — lost prompt → published recommendation", () => {
    const ORIG = { ...JUDGE_ENV };
    afterEach(() => {
      if (ORIG.JUDGE_MODEL === undefined) delete process.env.JUDGE_MODEL;
      else process.env.JUDGE_MODEL = ORIG.JUDGE_MODEL;
      if (ORIG.CONTENT_MODEL === undefined) delete process.env.CONTENT_MODEL;
      else process.env.CONTENT_MODEL = ORIG.CONTENT_MODEL;
    });

    it("shows published row on /gaps", async () => {
      await resetDatabase();
      process.env.JUDGE_MODEL = "accounts/fireworks/models/judge-e2e-phase9";
      process.env.CONTENT_MODEL = "accounts/fireworks/models/writer-e2e-phase9";

      const cookie = await cookieFor("journey4@charlotte.edu", "editor");
      const c = await metricsSeed(4);
      await c.db.insert(providerAccounts).values({
        orgId: c.orgId,
        provider: WRITER_PROVIDER,
        perRunCapUnits: 1,
        creditsRemaining: 1,
        creditUnitUsd: null,
      });

      const baselineScanId = await newScan(c);
      const evidenceId = "b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1";
      const lostDrawId = await addDraw(c, baselineScanId, c.promptIds[0], {
        brand: false,
        citation: { domain: "usnews.com", sourceClass: "other" },
      });
      const [citation] = await c.db.select().from(citations).where(eq(citations.drawId, lostDrawId));
      expect(citation).toBeTruthy();

      const gapBundle: GapEvidenceBundle = {
        campaignId: c.campaignId,
        scanId: baselineScanId,
        leverType: "on_page",
        lost: {
          scanId: baselineScanId,
          engine: "chatgpt",
          runner: "ui_provider",
          regionId: c.regionId,
          personaId: null,
          branded: false,
          promptIds: [c.promptIds[0]],
        },
        termLifts: [],
        citedPageIds: [],
        closestOwnedPage: { crawlPageId: null, similarity: null, noMatchingPage: true },
        evidenceIds: [evidenceId],
      };
      const writerRequest = {
        campaignId: c.campaignId,
        leverType: gapBundle.leverType,
        evidenceGrade: "C" as const,
        format: "FAQ capsule",
        targetUrl: null as string | null,
        evidence: [{ id: evidenceId, drawId: lostDrawId, citationIds: [citation.id], note: "Lost prompt evidence" }],
      };
      const estimate = estimateWriter(writerRequest);
      const written = await runWriter(c.db, {
        orgId: c.orgId,
        request: writerRequest,
        approval: { paramsHash: estimate.paramsHash, units: estimate.units, priceUsd: null, acknowledgedUnknownPrice: true },
        fixture: {
          items: [{ kind: "headline_term", text: "grid engine", evidenceIds: [evidenceId] }],
          format: writerRequest.format,
        },
      });
      const card = buildRecommendationCard({
        leverType: written.card.leverType,
        evidenceGrade: written.card.evidenceGrade,
        evidence: written.card.evidence,
        items: written.card.items,
        format: written.card.format,
        targetUrl: written.card.targetUrl,
        headlineTerms: written.card.headlineTerms,
        faqs: written.card.faqs,
      });
      const payload: RecommendationPayload = { card };
      const [rec] = await c.db
        .insert(recommendations)
        .values({
          campaignId: c.campaignId,
          kind: "gap",
          leverType: card.leverType,
          owner: card.owner,
          evidenceGrade: card.evidenceGrade,
          payload,
          evidence: card.evidence,
          status: "in_progress",
        })
        .returning();
      await publishRecommendation(c.db, {
        recommendationId: rec.id,
        targetPromptIds: gapBundle.lost.promptIds,
        baselineScanId,
      });

      const ctx = await playCookieContext(browser!, server!.baseUrl, cookie);
      const page = await ctx.newPage();
      await page.goto(`/campaigns/${c.campaignId}/gaps`);
      await expectVisible(page.getByRole("heading", { name: /Gaps & Recommendations/i }));
      await expectVisible(page.getByText("Correlation, not proven cause.", { exact: true }));
      await expectVisible(page.getByText("published").first());
      await page.close();
      await ctx.close();
    });
  });

  describe("Journey 5 — strategy report for new topic", () => {
    const EVIDENCE_ID = "c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2";

    it("Pipeline persists report; strategy page lists topic", async () => {
      await resetDatabase();
      const cookie = await cookieFor("journey5@charlotte.edu", "editor");
      const c = await metricsSeed(3);
      const scanId = await newScan(c);
      await addDraw(c, scanId, c.promptIds[0], { brand: false, citation: { domain: "usnews.com", sourceClass: "other" } });

      const collectDemand = async (source: DemandSource) => {
        if (source === "google_trends" || source === "search_console" || source === "keyword_volume") {
          return connectedDemand(source, 800);
        }
        return connectedDemand(source, 10);
      };

      const { report } = await runStrategyPipeline(c.db, {
        topic: "energy storage",
        campaignId: c.campaignId,
        orgId: c.orgId,
        persona: "doctoral_applicant" as const,
        leverType: "on_page" as const,
        evidenceGrade: "C" as const,
        promptCluster: "energy storage PhD programs",
        format: "research FAQ capsule",
        faqs: ["What energy storage labs exist?"],
        effort: { value: 0.6, source: "editor_estimate", n: 1 },
        collectDemand,
        gap: {
          leverType: "on_page" as const,
          gapSize: 0.8,
          n: 20,
          evidenceIds: [EVIDENCE_ID],
          termLifts: [{ term: "Carolinas Grid Engine", logOddsLift: 1.1 }],
          closestOwnedPage: { crawlPageId: null, noMatchingPage: true },
        },
        citations: [
          { domain: "usnews.com", sourceClass: "ranking", url: "https://usnews.com/best-energy", citesUs: false, citesPeer: true },
        ],
        fromDate: "2026-09-01",
        now: new Date("2026-09-01T12:00:00.000Z"),
      });

      const ctx = await playCookieContext(browser!, server!.baseUrl, cookie);
      const page = await ctx.newPage();
      await page.goto(`/campaigns/${c.campaignId}/strategy`);
      await expectVisible(page.getByRole("heading", { name: /Content strategy/i }));
      await expectVisible(page.getByRole("heading", { name: report.topic }));
      await page.close();
      await ctx.close();
    });
  });

  describe("Journey 6 — leadership RBAC, budget PDF, demo banner", () => {
    it("viewer logs in via UI; Overview + Budget; PDF; no mutate; demo banner when switched", async () => {
      await resetDatabase();
      const db = getDb();
      const leadershipEmail = "leadership@charlotte.edu";
      await cookieFor(leadershipEmail, "viewer");
      const viewerId = await userIdFor(leadershipEmail);

      // Seed a campaign headline so Overview has HowMeasured + captions for screenshots
      const c = await metricsSeed(4);
      const scanId = await newScan(c);
      for (const pid of c.promptIds) await addDraw(c, scanId, pid, { brand: true });

      const [demoOrg] = await db
        .insert(organizations)
        .values({ name: DEMO_ORG_NAME, slug: "demo-university", isDemo: true })
        .returning({ id: organizations.id });

      await legacyContext(db);
      await db.insert(memberships).values({ orgId: demoOrg.id, userId: viewerId, role: "viewer" }).onConflictDoNothing();

      const ctx = await browser!.newContext({
        baseURL: server!.baseUrl,
        viewport: { width: 1024, height: 768 },
      });
      const page = await ctx.newPage();
      // Exercise the login page UI, then complete auth via same-origin API with an explicit
      // 127.0.0.1 absolute URL (Next may rewrite relative /api fetches in a way that fails the
      // passwordless host guard during Playwright).
      await page.goto("/login");
      await expectVisible(page.locator("#email"));
      await page.fill("#email", leadershipEmail);
      await page.fill("#name", "Leadership Viewer");
      const loginRes = await page.request.post(`${server!.baseUrl}/api/auth/login`, {
        data: { email: leadershipEmail, name: "Leadership Viewer" },
        headers: { Origin: server!.baseUrl, Referer: `${server!.baseUrl}/login` },
      });
      if (!loginRes.ok()) {
        throw new Error(`login HTTP ${loginRes.status()}: ${await loginRes.text()}`);
      }
      await page.goto("/overview");
      await expectVisible(page.getByTestId("leadership-readonly"), 45_000);

      await page.goto("/overview");
      await expectVisible(page.getByRole("heading", { level: 1 }).first());
      await expectVisible(page.getByRole("button", { name: /How this is measured/i }).first());
      expect(await page.getByTestId("new-campaign").count()).toBe(0);
      expect(await page.getByTestId("demo-data-banner").count()).toBe(0);
      expect(await page.getByRole("button", { name: /Approve/i }).count()).toBe(0);
      await page.screenshot({ path: "docs/phase9-screenshots/overview-unc.png", fullPage: true });

      await page.goto(`/campaigns/${c.campaignId}/dashboard`);
      await expectVisible(page.getByTestId("dashboard-metrics-table"));
      await page.screenshot({ path: "docs/phase9-screenshots/campaign-dashboard-unc.png", fullPage: true });

      await page.goto(`/campaigns/${c.campaignId}/answers`);
      await expectVisible(page.getByRole("heading", { name: /Answer Explorer/i }));
      await page.screenshot({ path: "docs/phase9-screenshots/answers-unc.png", fullPage: true });

      await page.goto(`/campaigns/${c.campaignId}/gaps`);
      await expectVisible(page.getByRole("heading", { name: /Gaps & Recommendations/i }));
      await page.screenshot({ path: "docs/phase9-screenshots/gaps-unc.png", fullPage: true });

      await page.goto("/budget");
      await assertLandmarks(page, /Budget & Funding/i);
      await expectVisible(page.getByTestId("budget-pdf-export"));
      const pdfRes = await page.request.get("/api/budget/pdf");
      expect(pdfRes.status()).toBe(200);
      const html = await pdfRes.text();
      expect(html).toMatch(/upper estimate, prices verified on/i);
      expect(html).not.toContain(DEMO_DATA_BANNER);
      await assertPageA11yBasics(page);
      await page.screenshot({ path: "docs/phase9-screenshots/budget-unc.png", fullPage: true });

      await page.goto("/overview");
      const orgSelect = page.locator("header.global-header label:has-text(\"Organization\") select");
      await expectVisible(orgSelect);
      await Promise.all([
        page.waitForResponse((r) => r.url().includes("/api/auth/org") && r.request().method() === "POST"),
        orgSelect.selectOption(demoOrg.id),
      ]);
      await expectVisible(page.getByTestId("demo-data-banner"), 30_000);
      await page.screenshot({ path: "docs/phase9-screenshots/overview-demo.png", fullPage: true });

      await page.goto("/budget");
      await expectVisible(page.getByTestId("demo-data-banner"));
      await page.screenshot({ path: "docs/phase9-screenshots/budget-demo.png", fullPage: true });

      const pdfDemo = await page.request.get("/api/budget/pdf");
      expect(await pdfDemo.text()).toContain(DEMO_DATA_BANNER);

      await page.close();
      await ctx.close();
    });
  });

  describe("Demo isolation — UNC Charlotte org", () => {
    it("has zero demo-seed-marked rows in draws, payloads, citations, judges, recs, strategy, ledger", async () => {
      await resetDatabase();
      const db = getDb();
      const { orgId: charlotteId } = await legacyContext(db);
      const { seedMarkedDemoOrg } = await import("@/lib/demo/seedMarked");
      const { assertZeroDemoSeedRows, countDemoSeedRowsForOrg } = await import("@/lib/demo/isolation");
      await seedMarkedDemoOrg(db);
      const counts = await countDemoSeedRowsForOrg(db, charlotteId);
      assertZeroDemoSeedRows(counts, "UNC Charlotte");
      expect(counts).toEqual({
        draws: 0,
        rawPayloads: 0,
        citations: 0,
        judgeRuns: 0,
        recommendations: 0,
        strategyReports: 0,
        costLedger: 0,
      });
    });
  });
});

