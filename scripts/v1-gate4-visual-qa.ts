/**
 * V1 Gate 4: Scout contact sheet @ 390/1024/1440 for demo + UNC orgs,
 * automated overflow/overlap checks, Lighthouse a11y on 5 main screens.
 *
 *   npx tsx scripts/v1-gate4-visual-qa.ts
 */
import fs from "fs";
import path from "path";
import { and, eq, sql } from "drizzle-orm";
import { spawnSync } from "child_process";
import { chromium, type Page } from "playwright";
import { ACTIVE_ORG_COOKIE, createSession, SESSION_COOKIE } from "@/lib/auth";
import { DEMO_ORG_NAME } from "@/lib/contracts/exports";
import { seedFullDemoOrg } from "@/lib/demo/seedMarked";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { campaigns, memberships, organizations, users } from "@/lib/db/pg/schema";
import { startNextDev, startNextStart, stopNextDev, type NextDevServer } from "../tests/phase9/nextDevServer";
import { loadEnv } from "./env";

loadEnv();

const WIDTHS = [390, 1024, 1440] as const;

type LayoutIssue = {
  org: string;
  path: string;
  width: number;
  kind: "overflow" | "overlap";
  detail: string;
};

async function checkLayout(page: Page): Promise<Array<{ kind: "overflow" | "overlap"; detail: string }>> {
  // String source avoids tsx injecting `__name` helpers into the browser evaluate payload.
  return page.evaluate(`(() => {
    const issues = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) {
      issues.push({
        kind: "overflow",
        detail: "horizontal scrollWidth=" + doc.scrollWidth + " clientWidth=" + doc.clientWidth,
      });
    }
    const main = document.querySelector("main") || document.body;
    const isSkippable = (el) => {
      if (el.closest(".sr-only")) return true;
      const st = window.getComputedStyle(el);
      if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) return true;
      return false;
    };
    const clippedRect = (el) => {
      let r = el.getBoundingClientRect();
      let p = el.parentElement;
      while (p && p !== document.body) {
        const st = window.getComputedStyle(p);
        const ox = st.overflowX;
        const oy = st.overflowY;
        if (ox !== "visible" || oy !== "visible") {
          const pr = p.getBoundingClientRect();
          const left = Math.max(r.left, pr.left);
          const top = Math.max(r.top, pr.top);
          const right = Math.min(r.right, pr.right);
          const bottom = Math.min(r.bottom, pr.bottom);
          r = { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top };
        }
        p = p.parentElement;
      }
      return r;
    };
    const nodes = Array.from(main.querySelectorAll("h1,h2,button,a,table,nav,[data-testid]")).slice(0, 80);
    const rects = nodes
      .filter((el) => !isSkippable(el))
      .map((el) => ({ el: el, r: clippedRect(el) }))
      .filter((x) => x.r.width > 8 && x.r.height > 8);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const overlapW = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const overlapH = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (overlapW > 12 && overlapH > 12) {
          const tag = (el) =>
            el.tagName.toLowerCase() + (el.getAttribute("data-testid") ? "[" + el.getAttribute("data-testid") + "]" : "");
          issues.push({
            kind: "overlap",
            detail: tag(a.el) + " ∩ " + tag(b.el) + " (" + Math.round(overlapW) + "×" + Math.round(overlapH) + ")",
          });
          if (issues.filter((x) => x.kind === "overlap").length >= 8) return issues;
        }
      }
    }
    return issues;
  })()`) as Promise<Array<{ kind: "overflow" | "overlap"; detail: string }>>;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  if (testUrl && databaseUrl === testUrl) {
    throw new Error("Refusing: DATABASE_URL equals TEST_DATABASE_URL");
  }
  process.env.DATABASE_URL = databaseUrl;
  delete process.env.TEST_DATABASE_URL;
  process.env.APP_BIND_HOST = "127.0.0.1";

  const db = getDb();
  const [unc] = await db.select().from(organizations).where(eq(organizations.name, "UNC Charlotte"));
  if (!unc) throw new Error("UNC Charlotte org missing");

  let [demo] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.name, DEMO_ORG_NAME), eq(organizations.isDemo, true)));
  if (!demo) {
    const seeded = await seedFullDemoOrg(db);
    [demo] = await db.select().from(organizations).where(eq(organizations.id, seeded.orgId));
  }
  if (!demo) throw new Error("Demo org missing");

  const uncWithDraws = await db.execute(sql`
    SELECT c.id, c.name
    FROM campaigns c
    JOIN scans s ON s.campaign_id = c.id AND s.kind = 'scan'
    JOIN draws d ON d.scan_id = s.id
    WHERE c.org_id = ${unc.id}
    GROUP BY c.id, c.name
    ORDER BY count(d.id) DESC
    LIMIT 1
  `);
  const uncCampaignId =
    (uncWithDraws.rows as Array<{ id: string }>)[0]?.id ??
    (
      await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.orgId, unc.id))
        .limit(1)
    )[0]?.id;
  if (!uncCampaignId) throw new Error("No UNC campaign");

  const demoCamps = await db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.orgId, demo.id));
  const demoCampaignId = (demoCamps.find((c) => c.name === "Energy") ?? demoCamps[0])?.id;
  if (!demoCampaignId) throw new Error("No demo campaign");

  const email = "v1-gate4@charlotte.edu";
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ email, name: "V1 Gate4" }).returning();
  for (const orgId of [unc.id, demo.id]) {
    await db
      .insert(memberships)
      .values({ orgId, userId: user.id, role: "viewer" })
      .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: "viewer" } });
  }
  const { token } = await createSession(email);

  const screenPaths = (cid: string) =>
    [
      { name: "overview", path: "/" },
      { name: "visibility", path: `/campaigns/${cid}/dashboard` },
      { name: "answers", path: `/campaigns/${cid}/answers` },
      { name: "prompts", path: `/campaigns/${cid}/prompts` },
      { name: "competitors", path: `/campaigns/${cid}/competitors` },
      { name: "demand", path: `/campaigns/${cid}/demand` },
      { name: "citations", path: `/campaigns/${cid}/citations` },
      { name: "gaps", path: `/campaigns/${cid}/gaps` },
      { name: "strategy", path: `/campaigns/${cid}/strategy` },
      { name: "sites", path: "/sites" },
      { name: "budget", path: "/budget" },
      { name: "settings", path: "/settings" },
      { name: "how-we-measure", path: "/how-we-measure" },
    ] as const;

  const outDir = path.join(process.cwd(), "docs", "phase9-screenshots");
  fs.mkdirSync(outDir, { recursive: true });
  const issues: LayoutIssue[] = [];
  const index: string[] = [
    "<!doctype html><html><head><meta charset=utf-8><title>V1 Gate 4 contact sheet</title>",
    "<style>body{font-family:system-ui;margin:24px} img{max-width:100%;border:1px solid #ccc} .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px} h2{margin-top:32px}</style></head><body>",
    "<h1>V1 Gate 4 contact sheet</h1>",
  ];

  if (process.env.SKIP_BUILD !== "1") {
    console.log("building next for stable visual QA…");
    const build = spawnSync("npx", ["next", "build"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl, APP_BIND_HOST: "127.0.0.1" },
      stdio: "inherit",
    });
    if (build.status !== 0) throw new Error("next build failed");
  }

  let server: NextDevServer;
  try {
    server = await startNextStart();
  } catch (err) {
    console.warn("next start failed, falling back to next dev", err);
    server = await startNextDev();
  }
  const browser = await chromium.launch({ headless: true });
  const lhRows: Array<{ name: string; a11y: number | null; url: string }> = [];

  try {
    if (process.env.SKIP_SHOTS !== "1") {
      for (const org of [
        { key: "demo", id: demo.id, cid: demoCampaignId },
        { key: "unc", id: unc.id, cid: uncCampaignId },
      ]) {
        index.push(`<h2>${org.key}</h2>`);
        for (const screen of screenPaths(org.cid)) {
          index.push(`<h3>${screen.name}</h3><div class="grid">`);
          for (const width of WIDTHS) {
            const file = `v1g4-${org.key}-${screen.name}-${width}.png`;
            const context = await browser.newContext({
              baseURL: server.baseUrl,
              viewport: { width, height: width === 390 ? 844 : 900 },
            });
            await context.addCookies([
              { name: SESSION_COOKIE, value: token, url: server.baseUrl },
              { name: ACTIVE_ORG_COOKIE, value: org.id, url: server.baseUrl },
            ]);
            const page = await context.newPage();
            let found: Array<{ kind: "overflow" | "overlap"; detail: string }> = [];
            try {
              await page.goto(screen.path, { waitUntil: "domcontentloaded", timeout: 60_000 });
              await page.waitForSelector("h1", { timeout: 30_000 }).catch(() => null);
              await page.waitForTimeout(300);
              found = await checkLayout(page);
              for (const f of found) {
                issues.push({ org: org.key, path: screen.path, width, kind: f.kind, detail: f.detail });
              }
              await page.screenshot({ path: path.join(outDir, file), fullPage: true });
              index.push(`<figure><img src="${file}" alt="${file}"/><figcaption>${width}px</figcaption></figure>`);
              console.log("wrote", file, found.length ? `issues=${found.length}` : "ok");
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              issues.push({
                org: org.key,
                path: screen.path,
                width,
                kind: "overflow",
                detail: `nav_error: ${msg.slice(0, 200)}`,
              });
              await page.screenshot({ path: path.join(outDir, file), fullPage: true }).catch(() => undefined);
              index.push(`<figure><img src="${file}" alt="${file}"/><figcaption>${width}px (error)</figcaption></figure>`);
              console.log("error", file, msg.slice(0, 160));
            }
            await context.close();
          }
          index.push("</div>");
        }
      }
    } else {
      index.push("<p>SKIP_SHOTS=1 — reusing existing PNGs; layout issues from prior run if present.</p>");
      const prior = path.join(outDir, "v1g4-report.json");
      if (fs.existsSync(prior)) {
        const prev = JSON.parse(fs.readFileSync(prior, "utf8")) as { issues?: LayoutIssue[] };
        if (Array.isArray(prev.issues)) issues.push(...prev.issues.filter((i) => !String(i.detail).startsWith("nav_error")));
      }
      for (const org of ["demo", "unc"]) {
        index.push(`<h2>${org}</h2>`);
        for (const screen of screenPaths(demoCampaignId)) {
          index.push(`<h3>${screen.name}</h3><div class="grid">`);
          for (const width of WIDTHS) {
            const file = `v1g4-${org}-${screen.name}-${width}.png`;
            index.push(`<figure><img src="${file}" alt="${file}"/><figcaption>${width}px</figcaption></figure>`);
          }
          index.push("</div>");
        }
      }
    }

    // Lighthouse a11y on 5 main screens (demo org) via CLI — avoids tsx/__name injection into LH.
    const mainFive = [
      { name: "overview", path: "/" },
      { name: "visibility", path: `/campaigns/${demoCampaignId}/dashboard` },
      { name: "answers", path: `/campaigns/${demoCampaignId}/answers` },
      { name: "gaps", path: `/campaigns/${demoCampaignId}/gaps` },
      { name: "budget", path: "/budget" },
    ];
    const cookieHeader = `${SESSION_COOKIE}=${token}; ${ACTIVE_ORG_COOKIE}=${demo.id}`;
    for (const s of mainFive) {
      const url = `${server.baseUrl}${s.path}`;
      const outJson = path.join(outDir, `v1g4-lighthouse-${s.name}.json`);
      try {
        const args = [
          "lighthouse",
          url,
          "--only-categories=accessibility",
          "--preset=desktop",
          "--chrome-flags=--headless --no-sandbox --disable-gpu",
          "--output=json",
          `--output-path=${outJson}`,
          "--quiet",
          `--extra-headers=${JSON.stringify({ Cookie: cookieHeader })}`,
        ];
        const res = spawnSync("npx", args, { encoding: "utf8", cwd: process.cwd(), timeout: 180_000 });
        if (res.status !== 0) throw new Error(res.stderr || res.stdout || `status ${res.status}`);
        const raw = JSON.parse(fs.readFileSync(outJson, "utf8")) as {
          categories: { accessibility?: { score: number | null } };
        };
        const a11y = raw.categories.accessibility?.score ?? null;
        lhRows.push({ name: s.name, a11y: a11y == null ? null : Math.round(a11y * 100), url });
        console.log("lighthouse", s.name, a11y);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lhRows.push({ name: s.name, a11y: null, url });
        console.log("lighthouse error", s.name, msg.slice(0, 160));
      }
    }
  } finally {
    const pngCount = fs.readdirSync(outDir).filter((f) => f.startsWith("v1g4-") && f.endsWith(".png")).length;
    const report = {
      generatedAt: new Date().toISOString(),
      issues,
      lighthouse: lhRows,
      screenshotCount: pngCount,
    };
    fs.writeFileSync(path.join(outDir, "v1g4-report.json"), JSON.stringify(report, null, 2));
    index.push("<h2>Layout issues</h2><pre>" + JSON.stringify(issues, null, 2) + "</pre>");
    index.push("<h2>Lighthouse accessibility</h2><pre>" + JSON.stringify(lhRows, null, 2) + "</pre>");
    index.push("</body></html>");
    fs.writeFileSync(path.join(outDir, "v1g4-contact-sheet.html"), index.join("\n"));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    await stopNextDev(server);
    await closeDb().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
