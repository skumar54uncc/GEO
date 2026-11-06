import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, promptSets, recommendations, scans } from "@/lib/db/pg/schema";
import { fidelityFor } from "@/lib/capture/types";
import { LEGACY_SCAN_NAME } from "@/lib/db/pg/bootstrap";
import { loadScanDraws } from "@/lib/metrics/load";
import { headlineCells, loadPersonaMetaForDraws, rollupLoaded } from "@/lib/metrics/rollup";

export type OverviewCampaignCard = {
  campaignId: string;
  name: string;
  topic: string;
  status: string;
  legacy: boolean;
  latestScan: {
    id: string;
    createdAt: string;
    legacyMethod: boolean;
  } | null;
  promptSetHash: string | null;
  headlines: Array<{
    engine: string;
    runner: string;
    fidelity: string;
    won: number;
    prompts: number;
    ciLow: number | null;
    ciHigh: number | null;
    draws: number;
    tooFewDraws: boolean;
  }>;
  openRecommendations: number;
  partial: boolean;
  emptyReason: string | null;
};

export async function buildOverview(db: Db, orgId: string): Promise<{ campaigns: OverviewCampaignCard[] }> {
  const rows = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), sql`${campaigns.status} <> 'archived'`))
    .orderBy(asc(campaigns.createdAt));

  const out: OverviewCampaignCard[] = [];
  for (const c of rows) {
    const legacy = Boolean((c.settings as { legacy?: boolean } | null)?.legacy);
    // Legacy Energy keeps a long-running "Legacy and manual captures" scan; include it so
    // leadership still sees original scan dates and figures. Measured campaigns stay complete/partial only.
    const statuses = legacy ? (["complete", "partial", "running"] as const) : (["complete", "partial"] as const);
    const [latest] = await db
      .select()
      .from(scans)
      .where(and(eq(scans.campaignId, c.id), inArray(scans.status, [...statuses]), eq(scans.kind, "scan")))
      .orderBy(desc(scans.createdAt))
      .limit(1);

    if (!latest) {
      out.push({
        campaignId: c.id,
        name: c.name,
        topic: c.topic,
        status: c.status,
        legacy,
        latestScan: null,
        promptSetHash: null,
        headlines: [],
        openRecommendations: 0,
        partial: false,
        emptyReason: "No completed scan yet. Numbers will appear after the first measured scan.",
      });
      continue;
    }

    const [set] = latest.promptSetId
      ? await db.select({ sha256: promptSets.sha256 }).from(promptSets).where(eq(promptSets.id, latest.promptSetId))
      : [null];

    let headlines: OverviewCampaignCard["headlines"] = [];
    let partial = latest.status === "partial";
    try {
      const loaded = await loadScanDraws(db, { orgId, scanId: latest.id });
      const personaMeta = await loadPersonaMetaForDraws(db, loaded.draws);
      const rollup = rollupLoaded(loaded, { personaMeta, iterations: 200 });
      headlines = headlineCells(rollup.cells).map((cell) => ({
        engine: cell.key.engine,
        runner: cell.key.runner,
        fidelity: fidelityFor(cell.key.runner),
        won: cell.promptsWon?.won ?? 0,
        prompts: cell.promptsWon?.prompts ?? 0,
        ciLow: cell.promptsWon?.ciLow ?? null,
        ciHigh: cell.promptsWon?.ciHigh ?? null,
        draws: cell.draws,
        tooFewDraws: cell.tooFewDraws,
      }));
      if (loaded.excluded.unjudged > 0) partial = true;
    } catch {
      partial = true;
      headlines = [];
    }

    const [{ open }] = await db
      .select({ open: sql<number>`count(*)::int` })
      .from(recommendations)
      .where(and(eq(recommendations.campaignId, c.id), inArray(recommendations.status, ["open", "in_progress"])));

    const legacyMethod = latest.name === LEGACY_SCAN_NAME || legacy;

    out.push({
      campaignId: c.id,
      name: c.name,
      topic: c.topic,
      status: c.status,
      legacy,
      latestScan: {
        id: latest.id,
        createdAt: latest.createdAt.toISOString(),
        legacyMethod,
      },
      promptSetHash: set?.sha256 ?? null,
      headlines,
      openRecommendations: Number(open),
      partial,
      emptyReason: headlines.length ? null : "Scan exists but no judged unbranded answers yet.",
    });
  }
  return { campaigns: out };
}
