/**
 * Save a real demo leadership PDF without starting Next/Playwright.
 *   npx tsx scripts/p1d-save-leadership-pdf.ts
 */
import fs from "fs";
import path from "path";
import { and, desc, eq } from "drizzle-orm";
import { DEMO_ORG_NAME } from "@/lib/contracts/exports";
import { seedFullDemoOrg } from "@/lib/demo/seedMarked";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { campaigns, memberships, organizations, scans, users } from "@/lib/db/pg/schema";
import { extractPdfStrings } from "@/lib/exports/simplePdf";
import { leadershipPdfBytes } from "@/lib/exports/leadershipPdf";
import { rollupCampaignDashboard } from "@/lib/metrics/rollup";
import { setAnalystNote } from "@/lib/scans/analystNote";
import { loadEnv } from "./env";

loadEnv();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  if (testUrl && databaseUrl === testUrl) throw new Error("Refusing: DATABASE_URL equals TEST_DATABASE_URL");
  process.env.DATABASE_URL = databaseUrl;
  delete process.env.TEST_DATABASE_URL;

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

  const [energy] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.orgId, demo.id), eq(campaigns.name, "Energy")))
    .limit(1);
  if (!energy) throw new Error("Energy campaign missing");

  await db
    .update(campaigns)
    .set({
      target: { metric: "prompts_won", engine: "chatgpt", value: 0.55, date: "2026-12-01" },
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, energy.id));

  const email = "p1d-pdf-sample@charlotte.edu";
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ email, name: "Editor" }).returning();
  await db
    .insert(memberships)
    .values({ orgId: demo.id, userId: user.id, role: "editor" })
    .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: "editor" } });

  const [latestScan] = await db
    .select({ id: scans.id })
    .from(scans)
    .where(and(eq(scans.campaignId, energy.id), eq(scans.kind, "scan")))
    .orderBy(desc(scans.createdAt))
    .limit(1);
  if (latestScan) {
    await setAnalystNote(db, {
      orgId: demo.id,
      scanId: latestScan.id,
      authorId: user.id,
      text: "Chat engines held steady this cycle for Energy. Citation coverage on owned domains remains the clearest gap. Leadership should treat the first frozen-set scan as Baseline when reading the trend.",
      status: "published",
    });
  }

  const dash = await rollupCampaignDashboard(db, { orgId: demo.id, campaignId: energy.id });
  const view = dash.promptSets[0] ?? null;
  const cells =
    view?.rollup.cells.filter(
      (c) => !c.key.branded && c.key.personaId == null && c.key.personaGroup == null && c.key.regionId == null,
    ) ?? [];
  const primary = cells[0] ?? null;
  const comparison = primary
    ? view?.comparisons.find(
        (c) => c.series.engine === primary.key.engine && c.series.runner === primary.key.runner && !c.series.branded,
      )
    : null;
  const baselineTrend = (view?.trend ?? []).find((t) => t.isBaseline);
  const latestTrend = view?.trend[view.trend.length - 1];
  const bytes = leadershipPdfBytes({
    organization: { name: dash.organization.name, isDemo: true },
    campaign: { name: dash.campaign.name, topic: dash.campaign.topic },
    headline: primary
      ? {
          engine: primary.key.engine,
          runner: primary.key.runner,
          won: primary.promptsWon?.won ?? null,
          prompts: primary.promptsWon?.prompts ?? null,
          rate: primary.promptsWon?.rate ?? null,
          ciLow: primary.promptsWon?.ciLow ?? null,
          ciHigh: primary.promptsWon?.ciHigh ?? null,
          draws: primary.draws,
        }
      : null,
    trendLabel: comparison?.label ?? null,
    engines: cells.map((c) => ({
      engine: c.key.engine,
      runner: c.key.runner,
      won: c.promptsWon?.won ?? null,
      prompts: c.promptsWon?.prompts ?? null,
      rate: c.promptsWon?.rate ?? null,
      ciLow: c.promptsWon?.ciLow ?? null,
      ciHigh: c.promptsWon?.ciHigh ?? null,
      draws: c.draws,
    })),
    analystNote:
      dash.analystNote?.status === "published"
        ? {
            text: dash.analystNote.text,
            authorName: dash.analystNote.authorName,
            at: dash.analystNote.at,
            status: "published",
          }
        : null,
    baselineDate: baselineTrend ? baselineTrend.createdAt.slice(0, 10) : null,
    target: dash.target,
    latestScan: view
      ? {
          createdAt: view.latestScan.createdAt,
          isBaseline: Boolean(latestTrend?.isBaseline && latestTrend.scanId === view.latestScan.id),
        }
      : null,
    includeAccuracy: false,
  });

  const outDir = path.join(process.cwd(), "docs", "phase9-screenshots");
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, "p1d-leadership-demo.pdf");
  fs.writeFileSync(out, Buffer.from(bytes));
  const extracted = extractPdfStrings(bytes);
  fs.writeFileSync(path.join(outDir, "p1d-leadership-demo.txt"), extracted);
  console.log("wrote", out, "bytes", bytes.length);
  console.log("checks", {
    pdfHeader: Buffer.from(bytes).subarray(0, 5).toString() === "%PDF-",
    demo: extracted.includes("DEMO DATA"),
    banner: extracted.includes("Demo data. Fictional university"),
    baseline: extracted.includes("Baseline"),
    target: extracted.includes("Target"),
    analyst: extracted.includes("Analyst note"),
    ciTo: /to \d+%/.test(extracted) || extracted.includes("% to %") || /\d+% to \d+%/.test(extracted),
    noLocalhost: !extracted.includes("127.0.0.1") && !extracted.includes("localhost"),
  });
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
