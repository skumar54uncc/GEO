import { eq } from "drizzle-orm";
import type { CanonicalPersonaKey } from "@/lib/contracts/personas";
import type { EvidenceGrade } from "@/lib/contracts/recommendations";
import {
  strategyReportOutputSchema,
  strategyReportSchema,
  type OffsiteOpportunity,
  type StrategyEvidenceRow,
  type StrategyItem,
  type StrategyReport,
  type StrategyReportInputs,
} from "@/lib/contracts/strategy";
import type { GapLeverType } from "@/lib/contracts/gaps";
import type { Db } from "@/lib/db/pg/client";
import { strategyReports } from "@/lib/db/pg/schema";
import { ensureSeasonalEvents, nextSeasonalEvent } from "@/lib/demand/seasonal";
import type { DemandCollector, StrategyDemandResult } from "./demand";
import { collectStrategyDemand } from "./demand";
import { summarizeStrategyGaps, type StrategyGapInput } from "./gaps";
import { sha256Hex, uuidFromSeed } from "./hash";
import type { LandscapeReuse, LandscapeSampleResult } from "./landscape";
import { findExistingLandscapeScan } from "./landscape";
import { buildOffsiteOpportunities, type CitationDomainRow } from "./offsite";
import { buildStrategyItem, evidenceRowsFromNotes, partitionPlanItems } from "./plan";
import { scoredFactor } from "./score";
import { collectStrategySupply, type StrategySupplyResult } from "./supply";

export const STRATEGY_PIPELINE = ["demand", "landscape", "supply", "gaps", "plan"] as const;

export type StrategyPipelineFixture = {
  topic: string;
  campaignId: string;
  orgId: string;
  createdBy?: string | null;
  persona: CanonicalPersonaKey;
  leverType: GapLeverType;
  evidenceGrade: EvidenceGrade;
  promptCluster: string;
  format: string;
  faqs?: string[];
  targetUrl?: string | null;
  thirdPartySources?: string[];
  /** Effort ease factor 0..1 with source + n. */
  effort: { value: number; source: string; n: number };
  collectDemand: DemandCollector;
  gap: StrategyGapInput;
  citations?: CitationDomainRow[];
  /** When set, forces a fixture landscape sample instead of DB reuse. */
  landscapeSample?: LandscapeSampleResult;
  fromDate?: string;
  now?: Date;
};

export type StrategyPipelineResult = {
  report: StrategyReport;
  demand: StrategyDemandResult;
  landscape: LandscapeReuse | LandscapeSampleResult | { mode: "none"; note: string };
  supply: StrategySupplyResult;
  offsite: OffsiteOpportunity[];
};

function sortItemsForHash(items: StrategyItem[]): StrategyItem[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Runs demand → landscape → supply → gaps → plan in order.
 * Persists a strategy_reports row with hashed inputs. Same inputs → same report (test).
 */
export async function runStrategyPipeline(db: Db, fixture: StrategyPipelineFixture): Promise<StrategyPipelineResult> {
  // 1. Demand
  const demand = await collectStrategyDemand({ topic: fixture.topic, collect: fixture.collectDemand });

  // 2. Landscape
  let landscape: LandscapeReuse | LandscapeSampleResult | { mode: "none"; note: string };
  if (fixture.landscapeSample) {
    landscape = fixture.landscapeSample;
  } else {
    const reused = await findExistingLandscapeScan(db, {
      orgId: fixture.orgId,
      campaignId: fixture.campaignId,
      topic: fixture.topic,
    });
    landscape = reused ?? { mode: "none", note: "No existing scan; sample requires estimate and approval" };
  }

  // 3. Supply
  const supply = await collectStrategySupply(db, { orgId: fixture.orgId, topic: fixture.topic });

  // 4. Gaps
  const gaps = summarizeStrategyGaps(fixture.gap);

  // 5. Plan + calendar
  await ensureSeasonalEvents(db, fixture.orgId);
  const fromDate = fixture.fromDate ?? (fixture.now ?? new Date()).toISOString().slice(0, 10);
  const seasonal = await nextSeasonalEvent(db, fixture.orgId, fromDate);
  if (!seasonal) throw new Error("No seasonal_events seeded for publish-by dates.");

  const evidence: StrategyEvidenceRow[] = evidenceRowsFromNotes([
    {
      id: uuidFromSeed(`demand|${fixture.topic}|${demand.demandFactor.source}`),
      kind: "demand",
      note: demand.demandKnown
        ? `demand n=${demand.demandFactor.n}`
        : `demand unknown (${demand.demandFactor.note ?? "not connected"})`,
      refIds: Object.keys(demand.bySource).sort(),
    },
    {
      id: uuidFromSeed(`landscape|${"scanId" in landscape ? landscape.scanId : landscape.mode}`),
      kind: "landscape",
      note: "mode" in landscape ? `landscape: ${landscape.mode}` : "landscape",
      refIds: "scanId" in landscape ? [landscape.scanId] : [],
    },
    {
      id: uuidFromSeed(`supply|${fixture.topic}|${supply.pages.length}`),
      kind: "supply",
      note: supply.evidenceNotes[0] ?? "supply",
      refIds: supply.pages.map((p) => p.crawlPageId).sort(),
    },
    {
      id: uuidFromSeed(`gap|${gaps.leverType}|${gaps.evidenceIds.join(",")}`),
      kind: "gap",
      note: gaps.notes.join("; "),
      refIds: gaps.evidenceIds,
    },
    {
      id: uuidFromSeed(`seasonal|${seasonal.id}`),
      kind: "seasonal",
      note: `publish-by from ${seasonal.name} (${seasonal.startsOn})`,
      refIds: [seasonal.id],
    },
    ...fixture.gap.evidenceIds.map((id) => ({
      id,
      kind: "gap" as const,
      note: "phase7 evidence",
      refIds: [id],
    })),
  ]);

  // Deduplicate evidence by id (gap evidence ids may already appear).
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const evidenceList = [...evidenceById.values()].sort((a, b) => a.id.localeCompare(b.id));

  const gapFactor =
    gaps.gapFactor.value !== null && supply.gapFromSupply.value !== null
      ? scoredFactor(
          Math.min(1, (gaps.gapFactor.value + supply.gapFromSupply.value) / 2),
          "gap+supply",
          gaps.gapFactor.n + supply.gapFromSupply.n,
        )
      : gaps.gapFactor;

  const itemEvidenceIds = [...new Set([...fixture.gap.evidenceIds, ...evidenceList.slice(0, 4).map((e) => e.id)])];

  const draftItem = buildStrategyItem({
    topic: fixture.topic,
    persona: fixture.persona,
    promptCluster: fixture.promptCluster,
    format: fixture.format,
    headlineTerms: gaps.headlineTerms.length ? gaps.headlineTerms : [fixture.promptCluster],
    faqs: fixture.faqs ?? [],
    targetUrl: fixture.targetUrl ?? null,
    thirdPartySources: fixture.thirdPartySources ?? [],
    leverType: fixture.leverType,
    evidenceGrade: fixture.evidenceGrade,
    evidenceIds: itemEvidenceIds,
    factors: {
      demand: demand.demandFactor,
      gapSize: gapFactor,
      effort: scoredFactor(fixture.effort.value, fixture.effort.source, fixture.effort.n),
    },
    publishBy: seasonal.startsOn,
    seasonalEventId: seasonal.id,
  });

  const { scoredItems, unscoredItems } = partitionPlanItems([draftItem]);
  const offsite = buildOffsiteOpportunities(fixture.citations ?? []);

  const output = strategyReportOutputSchema.parse({
    pipeline: STRATEGY_PIPELINE,
    scoredItems: sortItemsForHash(scoredItems),
    unscoredItems: sortItemsForHash(unscoredItems),
    offsite,
    evidence: evidenceList,
  });

  const inputsBody = {
    topic: fixture.topic.trim(),
    campaignId: fixture.campaignId,
    demand: {
      demandKnown: demand.demandKnown,
      factor: demand.demandFactor,
      risingQueries: demand.risingQueries,
      bySource: Object.fromEntries(
        Object.entries(demand.bySource).map(([k, v]) => [
          k,
          v.connected ? { connected: true, n: v.signals.length } : { connected: false, missing: v.missing },
        ]),
      ),
    },
    landscape:
      landscape.mode === "reuse_existing"
        ? { mode: landscape.mode, scanId: landscape.scanId }
        : landscape.mode === "fixture_sample"
          ? { mode: landscape.mode, scanId: landscape.scanId, paramsHash: landscape.paramsHash }
          : { mode: landscape.mode, note: "note" in landscape ? landscape.note : "" },
    supply: {
      pageIds: supply.pages.map((p) => p.crawlPageId).sort(),
      n: supply.pages.length,
      gapFromSupply: supply.gapFromSupply,
    },
    gaps: {
      leverType: gaps.leverType,
      gapFactor: gaps.gapFactor,
      evidenceIds: [...gaps.evidenceIds].sort(),
      headlineTerms: gaps.headlineTerms,
    },
    calendar: { seasonalEventId: seasonal.id, publishBy: seasonal.startsOn, fromDate },
  };
  const inputsHash = sha256Hex(inputsBody);
  const inputs: StrategyReportInputs = {
    ...inputsBody,
    inputsHash,
  };

  const reportId = uuidFromSeed(`strategy_report|${inputsHash}`);
  const createdAt = (fixture.now ?? new Date()).toISOString();
  const report = strategyReportSchema.parse({
    id: reportId,
    campaignId: fixture.campaignId,
    topic: fixture.topic.trim(),
    inputs,
    output,
    createdBy: fixture.createdBy ?? null,
    createdAt,
  });

  // Idempotent upsert by deterministic id.
  const [existing] = await db.select({ id: strategyReports.id }).from(strategyReports).where(eq(strategyReports.id, reportId));
  if (!existing) {
    await db.insert(strategyReports).values({
      id: report.id,
      campaignId: report.campaignId,
      topic: report.topic,
      inputs: report.inputs,
      output: report.output,
      createdBy: report.createdBy,
      createdAt: new Date(report.createdAt),
    });
  }

  return { report, demand, landscape, supply, offsite };
}

export async function getStrategyReport(db: Db, id: string): Promise<StrategyReport | null> {
  const [row] = await db.select().from(strategyReports).where(eq(strategyReports.id, id));
  if (!row) return null;
  return strategyReportSchema.parse({
    id: row.id,
    campaignId: row.campaignId,
    topic: row.topic,
    inputs: row.inputs,
    output: row.output,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  });
}
