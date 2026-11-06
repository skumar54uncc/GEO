/**
 * Phase 9 gate: Lighthouse accessibility + performance (CLI), and FCP/TTFB load times
 * for Overview, Campaign dashboard, and Budget — UNC Charlotte and Demo University.
 *
 *   npx tsx scripts/phase9-lighthouse.ts
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { chromium } from "playwright";
import { ACTIVE_ORG_COOKIE, createSession, SESSION_COOKIE } from "@/lib/auth";
import { DEMO_SEED_MARKER } from "@/lib/contracts/demoSeed";
import { DEMO_ORG_NAME } from "@/lib/contracts/exports";
import { seedMarkedDemoOrg } from "@/lib/demo/seedMarked";
import { getDb } from "@/lib/db/pg/client";
import { memberships, organizations } from "@/lib/db/pg/schema";
import { addDraw, newScan, seed } from "../tests/metrics/dbFixtures";
import { cookieFor, resetDatabase, userIdFor } from "../tests/helpers";
import { startNextStart, stopNextDev, type NextDevServer } from "../tests/phase9/nextDevServer";
import { loadEnv } from "./env";

loadEnv();
process.env.APP_BIND_HOST = "127.0.0.1";
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.RAW_STORE_DIR = process.env.TEST_RAW_STORE_DIR || "./data/raw-test";

type PageKey = "overview" | "dashboard" | "budget";

async function measurePage(
  baseUrl: string,
  cookieHeader: string,
  pagePath: string,
): Promise<{ ttfbMs: number; fcpMs: number; loadMs: number }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1280, height: 800 } });
  const token = /geo_session=([^;]+)/.exec(cookieHeader)?.[1] ?? "";
  const org = /geo_active_org=([^;]+)/.exec(cookieHeader)?.[1];
  const cookies: Array<{ name: string; value: string; url: string }> = [
    { name: SESSION_COOKIE, value: token, url: baseUrl },
  ];
  if (org) cookies.push({ name: ACTIVE_ORG_COOKIE, value: org, url: baseUrl });
  await context.addCookies(cookies);
  const page = await context.newPage();
  const started = Date.now();
  await page.goto(pagePath, { waitUntil: "domcontentloaded" });
  const ttfbMs = Date.now() - started;
  await page.waitForSelector("h1", { timeout: 30_000 });
  const fcpMs = await page.evaluate(() => {
    const entry = performance.getEntriesByName("first-contentful-paint")[0] as PerformanceEntry | undefined;
    if (entry) return entry.startTime;
    const paint = performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint");
    return paint?.startTime ?? -1;
  });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const loadMs = Date.now() - started;
  await browser.close();
  return { ttfbMs, fcpMs, loadMs };
}

function runLighthouseCli(url: string, cookieHeader: string, outJson: string) {
  const args = [
    "lighthouse",
    url,
    "--only-categories=accessibility,performance",
    "--preset=desktop",
    "--chrome-flags=--headless --no-sandbox --disable-gpu",
    "--output=json",
    `--output-path=${outJson}`,
    "--quiet",
    `--extra-headers=${JSON.stringify({ Cookie: cookieHeader })}`,
  ];
  const res = spawnSync("npx", args, { encoding: "utf8", cwd: process.cwd(), timeout: 180_000 });
  if (res.status !== 0) {
    throw new Error(`lighthouse failed for ${url}: ${res.stderr || res.stdout}`);
  }
  const raw = JSON.parse(fs.readFileSync(outJson, "utf8")) as {
    categories: { accessibility?: { score: number | null }; performance?: { score: number | null } };
    audits: Record<string, { id?: string; title?: string; score: number | null; scoreDisplayMode?: string }>;
  };
  const a11y = Math.round((raw.categories.accessibility?.score ?? 0) * 100);
  const perf = Math.round((raw.categories.performance?.score ?? 0) * 100);
  const issues = Object.values(raw.audits)
    .filter((a) => a.score !== null && (a.score as number) < 1 && a.scoreDisplayMode !== "informative")
    .filter((a) =>
      (a.id ?? "").match(/color-contrast|button-name|link-name|label|focus|aria|document-title|html-has-lang|image-alt|heading/),
    )
    .map((a) => `${a.id}: ${a.title} (score=${a.score})`)
    .slice(0, 15);
  return { accessibility: a11y, performance: perf, audits: issues };
}

async function main() {
  await resetDatabase();
  await cookieFor("lh-editor@charlotte.edu", "editor");
  const viewer = await cookieFor("lh-viewer@charlotte.edu", "viewer");
  const c = await seed(6);
  const scanId = await newScan(c);
  for (const pid of c.promptIds) await addDraw(c, scanId, pid, { brand: true });

  const db = getDb();
  const demo = await seedMarkedDemoOrg(db);
  const viewerId = await userIdFor("lh-viewer@charlotte.edu");
  await db.insert(memberships).values({ orgId: demo.orgId, userId: viewerId, role: "viewer" }).onConflictDoNothing();
  await db.update(organizations).set({ name: DEMO_ORG_NAME }).where(eq(organizations.id, demo.orgId));

  const { token: demoToken } = await createSession("lh-viewer@charlotte.edu");
  const uncCookie = viewer;
  const demoCookie = `${SESSION_COOKIE}=${demoToken}; ${ACTIVE_ORG_COOKIE}=${demo.orgId}`;

  console.log("Building Next.js production bundle for realistic load times…");
  const build = spawnSync("npx", ["next", "build"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    timeout: 600_000,
  });
  if (build.status !== 0) {
    console.error(build.stdout);
    console.error(build.stderr);
    throw new Error("next build failed");
  }

  const server: NextDevServer = await startNextStart();
  const tmpDir = path.join(process.cwd(), "docs", "phase9-screenshots", "lh-tmp");
  fs.mkdirSync(tmpDir, { recursive: true });

  const out: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    demoSeedMarker: DEMO_SEED_MARKER,
    campaignId: c.campaignId,
    pages: {} as Record<string, unknown>,
  };

  const targets: Array<{ org: string; cookie: string; key: PageKey; path: string }> = [
    { org: "unc", cookie: uncCookie, key: "overview", path: "/" },
    { org: "unc", cookie: uncCookie, key: "dashboard", path: `/campaigns/${c.campaignId}/dashboard` },
    { org: "unc", cookie: uncCookie, key: "budget", path: "/budget" },
    { org: "demo", cookie: demoCookie, key: "overview", path: "/" },
    { org: "demo", cookie: demoCookie, key: "dashboard", path: `/campaigns/${demo.campaignId}/dashboard` },
    { org: "demo", cookie: demoCookie, key: "budget", path: "/budget" },
  ];

  try {
    for (const t of targets) {
      const url = `${server.baseUrl}${t.path}`;
      const load = await measurePage(server.baseUrl, t.cookie, t.path);
      const lhFile = path.join(tmpDir, `${t.org}-${t.key}.json`);
      const lh = runLighthouseCli(url, t.cookie, lhFile);
      const row = { url, ...load, lighthouse: lh };
      (out.pages as Record<string, unknown>)[`${t.org}:${t.key}`] = row;
      console.log(
        `${t.org}/${t.key}: a11y=${lh.accessibility} perf=${lh.performance} ttfb=${load.ttfbMs}ms fcp=${Math.round(load.fcpMs)}ms load=${load.loadMs}ms`,
      );
      if (lh.audits.length) console.log("  issues:", lh.audits.join(" | "));
    }
  } finally {
    await stopNextDev(server);
  }

  const dest = path.join(process.cwd(), "docs", "phase9-screenshots", "lighthouse-report.json");
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log("wrote", dest);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
