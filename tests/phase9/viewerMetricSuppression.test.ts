import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { ACTIVE_ORG_COOKIE, SESSION_COOKIE } from "@/lib/auth";
import { resetDatabase, cookieFor } from "../helpers";
import { addDraw, newScan, seed } from "../metrics/dbFixtures";
import { startNextDev, stopNextDev, type NextDevServer } from "./nextDevServer";

function parseCookieValue(cookieHeader: string, name: string): string {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookieHeader);
  return m ? m[1].trim() : "";
}

describe("viewer metric suppression (Wave 4 0A)", () => {
  let server: NextDevServer;
  let browser: Browser;
  let fixtureOrgId: string;
  let fixtureCampaignId: string;

  beforeAll(async () => {
    server = await startNextDev();
    browser = await chromium.launch();
  }, 180_000);

  afterAll(async () => {
    await browser.close();
    await stopNextDev(server);
  });

  beforeEach(async () => {
    await resetDatabase();
    const c = await seed(5);
    const scan = await newScan(c);
    for (const p of c.promptIds) {
      await addDraw(c, scan, p, { brand: true });
    }
    fixtureOrgId = c.orgId;
    fixtureCampaignId = c.campaignId;
  });

  it("viewer sees no raw toggle; suppressed table cells have no bare percentages", async () => {
    const orgId = fixtureOrgId;
    const campaignId = fixtureCampaignId;
    const viewerCookie = await cookieFor("viewer-suppression@charlotte.edu", "viewer");
    const token = parseCookieValue(viewerCookie, SESSION_COOKIE);

    const context = await browser.newContext({ baseURL: server.baseUrl });
    await context.addCookies([
      { name: SESSION_COOKIE, value: token, url: server.baseUrl },
      { name: ACTIVE_ORG_COOKIE, value: orgId, url: server.baseUrl },
    ]);
    const page = await context.newPage();
    await page.goto(`/campaigns/${campaignId}/dashboard`, { waitUntil: "networkidle", timeout: 60_000 });

    expect(await page.getByTestId("show-raw-values").count()).toBe(0);

    const suppressed = page.locator('[data-testid="dashboard-metrics-table"] [data-testid="metric-suppressed"]');
    const n = await suppressed.count();
    expect(n).toBeGreaterThan(0);

    const pctRe = /\d{1,3}(?:\.\d)?%/;
    for (let i = 0; i < n; i++) {
      const loc = suppressed.nth(i);
      const text = (await loc.innerText()).replace(/\s+/g, " ").trim();
      expect(text).toMatch(/Too few (prompts|answers)/i);
      expect(text).not.toMatch(pctRe);
    }

    await context.close();
  });

  it("editor sees Show raw toggle on visibility dashboard", async () => {
    const orgId = fixtureOrgId;
    const campaignId = fixtureCampaignId;
    const editorCookie = await cookieFor("editor-suppression@charlotte.edu", "editor");
    const token = parseCookieValue(editorCookie, SESSION_COOKIE);

    const context = await browser.newContext({ baseURL: server.baseUrl });
    await context.addCookies([
      { name: SESSION_COOKIE, value: token, url: server.baseUrl },
      { name: ACTIVE_ORG_COOKIE, value: orgId, url: server.baseUrl },
    ]);
    const page = await context.newPage();
    await page.goto(`/campaigns/${campaignId}/dashboard`, { waitUntil: "networkidle", timeout: 60_000 });

    await page.getByTestId("show-raw-values").waitFor({ state: "visible", timeout: 15_000 });
    expect(await page.getByTestId("show-raw-values").count()).toBeGreaterThan(0);

    await context.close();
  });
});
