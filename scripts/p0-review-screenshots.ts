/**
 * P0 review screenshots — demo org @ 1440px.
 *   npx tsx scripts/p0-review-screenshots.ts
 *
 * Writes (gitignored):
 *   docs/phase9-screenshots/p0-overview-intents-1440.png
 *   docs/phase9-screenshots/p0-answers-highlights-1440.png
 *
 * Does not UPDATE draws (immutable).
 */
import fs from "fs";
import path from "path";
import { and, eq, sql } from "drizzle-orm";
import { chromium } from "playwright";
import { ACTIVE_ORG_COOKIE, createSession, SESSION_COOKIE } from "@/lib/auth";
import { DEMO_ORG_NAME } from "@/lib/contracts/exports";
import { seedFullDemoOrg } from "@/lib/demo/seedMarked";
import { closeDb, getDb } from "@/lib/db/pg/client";
import {
  campaigns,
  citations,
  memberships,
  organizations,
  prompts,
  users,
} from "@/lib/db/pg/schema";
import { startNextDev, stopNextDev } from "../tests/phase9/nextDevServer";
import { loadEnv } from "./env";

loadEnv();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  if (testUrl && databaseUrl === testUrl) {
    throw new Error("Refusing: DATABASE_URL equals TEST_DATABASE_URL");
  }
  // nextDevServer prefers TEST_DATABASE_URL — force the real local DB for screenshots.
  process.env.DATABASE_URL = databaseUrl;
  delete process.env.TEST_DATABASE_URL;
  process.env.APP_BIND_HOST = "127.0.0.1";

  const db = getDb();
  let [demo] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.name, DEMO_ORG_NAME), eq(organizations.isDemo, true)));
  if (!demo) {
    const seeded = await seedFullDemoOrg(db);
    [demo] = await db.select().from(organizations).where(eq(organizations.id, seeded.orgId));
  }
  if (!demo) throw new Error("Demo org missing");

  const allCamps = await db.select().from(campaigns).where(eq(campaigns.orgId, demo.id));
  const energy = allCamps.find((c) => c.name === "Energy") ?? allCamps[0];
  if (!energy) throw new Error("Demo campaign missing");

  // Tag intents on every demo campaign so Overview's auto-pick still shows real intents + untagged.
  for (const camp of allCamps) {
    const promptRows = await db
      .select({ id: prompts.id })
      .from(prompts)
      .where(eq(prompts.campaignId, camp.id))
      .limit(6);
    if (promptRows.length >= 4) {
      await db.update(prompts).set({ intent: "discovery" }).where(eq(prompts.id, promptRows[0]!.id));
      await db.update(prompts).set({ intent: "comparison" }).where(eq(prompts.id, promptRows[1]!.id));
      await db.update(prompts).set({ intent: "evaluation" }).where(eq(prompts.id, promptRows[2]!.id));
      await db.update(prompts).set({ intent: null }).where(eq(prompts.id, promptRows[3]!.id));
    }
  }

  // Backfill citation spans from answer text domains (citations are mutable; draws are not).
  const citeCandidates = await db.execute(sql`
    SELECT d.id AS draw_id, d.answer_text, c.id AS citation_id, c.domain
    FROM draws d
    JOIN scans s ON s.id = d.scan_id AND s.campaign_id = ${energy.id}
    JOIN citations c ON c.draw_id = d.id AND c.span_start IS NULL
    WHERE position(c.domain in d.answer_text) > 0
    LIMIT 200
  `);
  for (const row of citeCandidates.rows as Array<{ draw_id: string; answer_text: string; citation_id: string; domain: string }>) {
    const start = row.answer_text.indexOf(row.domain);
    if (start < 0) continue;
    await db
      .update(citations)
      .set({ spanStart: start, spanEnd: start + row.domain.length })
      .where(eq(citations.id, row.citation_id));
  }

  // Pick a draw whose rendered HTML already contains brand + competitor + citation marks.
  const { getAnswerExplorerDraw } = await import("@/lib/analysis/answerExplorer");
  const candidates = await db.execute(sql`
    SELECT d.id AS draw_id, d.engine, d.draw_index, p.text AS prompt_text
    FROM draws d
    JOIN scans s ON s.id = d.scan_id AND s.campaign_id = ${energy.id}
    JOIN prompts p ON p.id = d.prompt_id
    JOIN judge_runs jr ON jr.draw_id = d.id AND jr.error IS NULL
    WHERE EXISTS (SELECT 1 FROM mentions m WHERE m.judge_run_id = jr.id AND m.entity_type = 'brand' AND m.span_start IS NOT NULL)
      AND EXISTS (SELECT 1 FROM mentions m WHERE m.judge_run_id = jr.id AND m.entity_type = 'competitor' AND m.span_start IS NOT NULL)
      AND EXISTS (SELECT 1 FROM citations c WHERE c.draw_id = d.id AND c.span_start IS NOT NULL)
    ORDER BY d.created_at DESC
    LIMIT 40
  `);
  let target: { draw_id: string; engine: string; draw_index: number; prompt_text: string } | null = null;
  for (const row of candidates.rows as Array<{ draw_id: string; engine: string; draw_index: number; prompt_text: string }>) {
    const detail = await getAnswerExplorerDraw(db, { orgId: demo.id, drawId: row.draw_id });
    const html = detail.answer.escapedText;
    if (html.includes("mention-brand") && html.includes("mention-competitor") && html.includes("mention-citation")) {
      target = row;
      break;
    }
  }
  if (!target) throw new Error("No Energy draw with brand+competitor+citation highlights");
  console.log("target draw", target.draw_id, target.engine, "draw", target.draw_index);

  const email = "p0-review@charlotte.edu";
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    [user] = await db.insert(users).values({ email, name: "P0 Reviewer" }).returning();
  }
  await db
    .insert(memberships)
    .values({ orgId: demo.id, userId: user.id, role: "editor" })
    .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: "editor" } });
  const { token } = await createSession(email);

  const outDir = path.join(process.cwd(), "docs", "phase9-screenshots");
  fs.mkdirSync(outDir, { recursive: true });

  const server = await startNextDev();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      baseURL: server.baseUrl,
      viewport: { width: 1440, height: 900 },
    });
    await context.addCookies([
      { name: SESSION_COOKIE, value: token, url: server.baseUrl },
      { name: ACTIVE_ORG_COOKIE, value: demo.id, url: server.baseUrl },
    ]);
    const page = await context.newPage();

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector("h1", { timeout: 60_000 });
    // Prefer Energy in the shell switcher so Overview reload stays on a tagged campaign.
    const switcher = page.getByTestId("campaign-switcher");
    if ((await switcher.count()) > 0) {
      await switcher.selectOption({ label: "Energy" }).catch(async () => {
        await switcher.selectOption({ value: energy.id }).catch(() => undefined);
      });
      await page.waitForTimeout(1200);
    }
    await page.getByTestId("overview-questions").waitFor({ timeout: 90_000 });
    await page.getByTestId("overview-questions").scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const overviewPath = path.join(outDir, "p0-overview-intents-1440.png");
    await page.screenshot({ path: overviewPath, fullPage: true });
    console.log("wrote", overviewPath);

    await page.goto(`/campaigns/${energy.id}/answers`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByTestId("answer-filters").waitFor({ timeout: 90_000 });
    await page.waitForTimeout(800);

    const promptSnippet = target.prompt_text.slice(0, 40);
    const promptBtn = page.getByTestId("answer-list").locator("button").filter({ hasText: promptSnippet }).first();
    await promptBtn.waitFor({ timeout: 30_000 });
    await promptBtn.click();
    await page.waitForTimeout(600);
    const { enginePlain } = await import("@/lib/ui/labels");
    const engineLabel = enginePlain(target.engine);
    await page.getByRole("tab", { name: engineLabel }).click({ timeout: 15_000 });
    await page.waitForTimeout(600);
    const drawTabs = page.getByTestId("draw-tabs").locator("button");
    await drawTabs.first().waitFor({ timeout: 15_000 });
    const drawCount = await drawTabs.count();
    let clicked = false;
    for (let i = 0; i < drawCount; i++) {
      const label = (await drawTabs.nth(i).innerText()).replace(/\s+/g, " ");
      if (label.includes(`Draw ${target.draw_index}`)) {
        await drawTabs.nth(i).click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      throw new Error(`Draw ${target.draw_index} not in tabs: ${(await Promise.all([...Array(drawCount)].map((_, i) => drawTabs.nth(i).innerText()))).join(" | ")}`);
    }
    await page.waitForFunction(
      () =>
        document.querySelectorAll("mark.mention-brand").length > 0 &&
        document.querySelectorAll("mark.mention-competitor").length > 0 &&
        document.querySelectorAll("mark.mention-citation").length > 0,
      { timeout: 30_000 },
    );
    await page.locator("mark.mention-citation").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const answersPath = path.join(outDir, "p0-answers-highlights-1440.png");
    await page.screenshot({ path: answersPath, fullPage: true });
    console.log("wrote", answersPath);

    const brands = await page.locator("mark.mention-brand").count();
    const peers = await page.locator("mark.mention-competitor").count();
    const cites = await page.locator("mark.mention-citation").count();
    const tags = await page.locator(".answer-hl-tag").count();
    console.log(JSON.stringify({ found: true, brands, peers, cites, tags, engine: target.engine, drawIndex: target.draw_index }));

    await context.close();
  } finally {
    await browser.close();
    await stopNextDev(server);
    await closeDb();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
