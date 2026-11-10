import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { cookieFor, resetDatabase } from "../helpers";
import { startNextDev, stopNextDev, type NextDevServer } from "./nextDevServer";

// `/demand` redirects to campaign Demand (P2 B1) and is allowed for viewers.
const LEGACY_PATHS = ["/capture", "/serpapi", "/config", "/analyze", "/recommend", "/bots", "/legacy"];

describe("viewer cannot reach legacy operator pages", () => {
  let browser: Browser;
  let server: NextDevServer;
  let cookie: string;

  beforeAll(async () => {
    await resetDatabase();
    cookie = await cookieFor("viewer-rbac@charlotte.edu", "viewer");
    server = await startNextDev();
    browser = await chromium.launch({ headless: true });
  }, 120_000);

  afterAll(async () => {
    await browser.close();
    await stopNextDev(server);
  });

  it("redirects viewer away from legacy operator routes", async () => {
    const ctx = await browser.newContext({ baseURL: server.baseUrl });
    const token = /geo_session=([^;]+)/.exec(cookie)?.[1] ?? "";
    await ctx.addCookies([{ name: "geo_session", value: token, url: server.baseUrl }]);

    for (const path of LEGACY_PATHS) {
      const page = await ctx.newPage();
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/overview", { timeout: 15_000 });
      expect(new URL(page.url()).pathname).toMatch(/^\/(overview)?$/);
      await page.close();
    }
    await ctx.close();
  }, 120_000);
});
