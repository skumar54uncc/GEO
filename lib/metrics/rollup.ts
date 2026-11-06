/**
 * Metrics rollup (docs/METRICS.md). Computed on demand from stored draws, judge runs, mentions, citations and
 * claims; nothing is written. Deterministic: every bootstrap builds a fresh mulberry32(seed), so the same data gives
 * identical cells.
 *
 * A cell is engine x runner x region x persona x branded. Runners are never averaged and indexes are never pooled
 * (the engine is in the key; assertSameIndex guards the share of voice). regionId null means no region filter (all
 * valid draws); a region cell only counts draws whose region_honored is yes or unknown. personaId null means no
 * persona filter.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getCampaign } from "@/lib/campaigns";
import type { Db } from "@/lib/db/pg/client";
import { modelEvents, personas, promptSets, scans } from "@/lib/db/pg/schema";
import { listOpenAlerts } from "@/lib/alerts/service";
import type { Engine, Runner } from "@/lib/capture/types";
import { PERSONA_GROUP_LABELS } from "@/lib/contracts/personas";
import { selectableDbKeyForCanonical, canonicalKeyForDbKey } from "@/lib/personas/library";
import { compareScans, previousComparableScan, type SeriesComparison } from "./compare";
import { assertSameIndex, ENGINE_INDEX } from "./indexes";
import { loadScanDraws, type ExcludedCounts, type LoadedScan, type MetricDraw, type Verdict } from "./load";
import { buildPersonaCellMeta, type PersonaCellMeta } from "./personaCells";
import { BOOTSTRAP_ITERS, BOOTSTRAP_SEED, clusterBootstrap, clusterRate, median, promptsWon, TOO_FEW_DRAWS, wilsonRate } from "./stats";
import type { CellKey, PromptsWon, RateWithCi } from "./types";

// ---------- small pure helpers ----------

const normDomain = (d: string) => d.trim().toLowerCase().replace(/^www\./, "");

/** A cited domain is owned when it is an owned brand domain or a subdomain of one. */
export function domainIsOwned(domain: string, ownedDomains: readonly string[]): boolean {
  const d = normDomain(domain);
  return ownedDomains.some((o) => {
    const od = normDomain(o);
    return d === od || d.endsWith(`.${od}`);
  });
}

/** Row 5: source_class owned OR a domain matching an owned brand_domains row. A draw counts once. */
export function hasOwnedCitation(draw: Pick<MetricDraw, "citations">, ownedDomains: readonly string[]): boolean {
  return draw.citations.some((c) => c.sourceClass === "owned" || domainIsOwned(c.domain, ownedDomains));
}

export const brandMentioned = (draw: Pick<MetricDraw, "mentions">): boolean => draw.mentions.some((m) => m.entityType === "brand");

/**
 * Row 6: brand has the minimum span_start among tracked mentions (brand and competitors). "unknown" when any tracked
 * mention lacks a span (legacy rows); an unknown draw stays in the denominator and is not counted as first.
 */
export function firstMentionStatus(draw: Pick<MetricDraw, "mentions">): "first" | "not_first" | "none" | "unknown" {
  if (draw.mentions.length === 0) return "none";
  if (!draw.mentions.some((m) => m.entityType === "brand")) return "not_first";
  if (draw.mentions.some((m) => m.spanStart === null)) return "unknown";
  const brandMin = Math.min(...draw.mentions.filter((m) => m.entityType === "brand").map((m) => m.spanStart as number));
  const anyMin = Math.min(...draw.mentions.map((m) => m.spanStart as number));
  return brandMin <= anyMin ? "first" : "not_first";
}

/** Row 8: lowest list position among the brand's mentions in this draw, or null (no list position). */
export function brandListPosition(draw: Pick<MetricDraw, "mentions">): number | null {
  const positions = draw.mentions.filter((m) => m.entityType === "brand" && m.listPosition !== null).map((m) => m.listPosition as number);
  return positions.length ? Math.min(...positions) : null;
}

function groupByPrompt(drawsIn: readonly MetricDraw[]): Array<{ promptId: string; draws: MetricDraw[] }> {
  const map = new Map<string, MetricDraw[]>();
  for (const d of drawsIn) {
    const list = map.get(d.promptId) ?? [];
    list.push(d);
    map.set(d.promptId, list);
  }
  return [...map.keys()].sort().map((promptId) => ({ promptId, draws: map.get(promptId)! }));
}

// ---------- cell rollup ----------

export type Consistency = { value: number | null; prompts: number };
export type Position = { median: number | null; n: number };
export type Accuracy = {
  /** 1 - contradicted / claims, with a Wilson interval on the claim counts. Null when there are no claims. */
  rate: RateWithCi | null;
  claims: number;
  supported: number;
  contradicted: number;
  unverifiable: number;
};

export type CellRollup = {
  key: CellKey;
  /** Valid, judged draws in the cell. */
  draws: number;
  prompts: number;
  /** Fewer than 30 valid draws: render greyed with "too few draws". */
  tooFewDraws: boolean;
  /** Draws dropped from a region cell because region_honored = no. Always 0 when regionId is null. */
  regionExcluded: number;
  /** Prompts won (row 2). Null for branded cells: branded prompts are a separate series, never a headline. */
  promptsWon: PromptsWon | null;
  mentionRate: RateWithCi;
  citationRate: RateWithCi;
  firstMentionRate: RateWithCi;
  /** Draws where the first-mention order could not be decided (a tracked mention has no span). */
  firstMentionUnknownSpan: number;
  /** Row 7. Null rate when no entity was named in any draw. n is brand plus competitor distinct-entity draws. */
  shareOfVoice: RateWithCi;
  position: Position;
  consistency: Consistency;
  accuracy: Accuracy;
};

export type CellOptions = { iterations?: number; seed?: number };

export function cellKey(
  engine: Engine,
  runner: Runner,
  regionId: string | null,
  personaId: string | null,
  branded: boolean,
  personaGroup: string | null = null,
): CellKey {
  return { engine, runner, index: ENGINE_INDEX[engine], regionId, personaId, personaGroup, branded };
}

function shareOfVoiceRate(clusters: Array<Array<{ brand: number; others: number }>>, validDraws: number, opts: CellOptions): RateWithCi {
  const ratio = (cs: Array<Array<{ brand: number; others: number }>>) => {
    let brand = 0;
    let others = 0;
    for (const c of cs) for (const d of c) {
      brand += d.brand;
      others += d.others;
    }
    return brand / (brand + others);
  };
  let brand = 0;
  let others = 0;
  for (const c of clusters) for (const d of c) {
    brand += d.brand;
    others += d.others;
  }
  const n = brand + others;
  const tooFew = validDraws < TOO_FEW_DRAWS;
  if (n === 0) return { rate: null, ciLow: null, ciHigh: null, numerator: 0, n: 0, method: "cluster_bootstrap", tooFewDraws: tooFew };
  const { estimate, ciLow, ciHigh } = clusterBootstrap({ clusters, statistic: ratio, iterations: opts.iterations, seed: opts.seed });
  return {
    rate: estimate,
    ciLow: Number.isFinite(ciLow) ? ciLow : null,
    ciHigh: Number.isFinite(ciHigh) ? ciHigh : null,
    numerator: brand,
    n,
    method: "cluster_bootstrap",
    tooFewDraws: tooFew,
  };
}

/** Row 9: per prompt, share of draws agreeing with the majority outcome (a tie counts as mentioned); mean over prompts. */
export function consistencyOf(perPrompt: ReadonlyArray<{ mentions: number; validDraws: number }>): Consistency {
  const scored = perPrompt.filter((p) => p.validDraws >= 1);
  if (scored.length === 0) return { value: null, prompts: 0 };
  const shares = scored.map((p) => {
    const majorityMentioned = p.mentions * 2 >= p.validDraws;
    return (majorityMentioned ? p.mentions : p.validDraws - p.mentions) / p.validDraws;
  });
  return { value: shares.reduce((a, b) => a + b, 0) / shares.length, prompts: scored.length };
}

/**
 * Pure: every metric of one cell from hand-buildable draws. The draws must already be the valid, judged draws that
 * belong to the cell (the caller applies the region filter).
 */
export function rollupCell(input: { key: CellKey; draws: readonly MetricDraw[]; ownedDomains: readonly string[]; regionExcluded?: number } & CellOptions): CellRollup {
  const { key, draws: cellDraws, ownedDomains } = input;
  const opts: CellOptions = { iterations: input.iterations, seed: input.seed };
  // One engine per cell, so this passes; it makes a mixed index a thrown error rather than a silent pool.
  assertSameIndex([key.engine, ...cellDraws.map((d) => d.engine)]);
  if (cellDraws.some((d) => d.engine !== key.engine || d.runner !== key.runner)) {
    throw new RangeError("rollupCell: draws from another engine or runner passed to a cell; runners are never averaged");
  }

  const byPrompt = groupByPrompt(cellDraws);
  const mentionClusters = byPrompt.map((p) => p.draws.map(brandMentioned));
  const citationClusters = byPrompt.map((p) => p.draws.map((d) => hasOwnedCitation(d, ownedDomains)));
  let unknownSpan = 0;
  const firstClusters = byPrompt.map((p) =>
    p.draws.map((d) => {
      const status = firstMentionStatus(d);
      if (status === "unknown") unknownSpan++;
      return status === "first";
    }),
  );
  const sovClusters = byPrompt.map((p) =>
    p.draws.map((d) => ({
      brand: brandMentioned(d) ? 1 : 0,
      // Distinct competitor entities per draw: naming a competitor twice counts once.
      others: new Set(d.mentions.filter((m) => m.entityType === "competitor").map((m) => m.entityId)).size,
    })),
  );
  const perPrompt = byPrompt.map((p) => ({ mentions: p.draws.filter(brandMentioned).length, validDraws: p.draws.length }));

  const positions = cellDraws.map(brandListPosition).filter((p): p is number => p !== null);
  const verdicts = cellDraws.flatMap((d) => d.claims.map((c) => c.verdict as Verdict));
  const count = (v: Verdict) => verdicts.filter((x) => x === v).length;
  const contradicted = count("contradicted");
  const accuracy: Accuracy = {
    rate: verdicts.length ? wilsonRate(verdicts.length - contradicted, verdicts.length, cellDraws.length) : null,
    claims: verdicts.length,
    supported: count("supported"),
    contradicted,
    unverifiable: count("unverifiable"),
  };

  return {
    key,
    draws: cellDraws.length,
    prompts: byPrompt.length,
    tooFewDraws: cellDraws.length < TOO_FEW_DRAWS,
    regionExcluded: input.regionExcluded ?? 0,
    promptsWon: key.branded ? null : promptsWon(perPrompt),
    mentionRate: clusterRate({ clusters: mentionClusters, ...opts }),
    citationRate: clusterRate({ clusters: citationClusters, ...opts }),
    firstMentionRate: clusterRate({ clusters: firstClusters, ...opts }),
    firstMentionUnknownSpan: unknownSpan,
    shareOfVoice: shareOfVoiceRate(sovClusters, cellDraws.length, opts),
    position: { median: median(positions), n: positions.length },
    consistency: consistencyOf(perPrompt),
    accuracy,
  };
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const cellSortKey = (k: CellKey) =>
  [k.engine, k.runner, k.regionId ?? "", k.personaId ?? "", k.personaGroup ?? "", k.branded ? "1" : "0"].join("|");

export type BuildCellsOptions = CellOptions & {
  /** When set, remaps alias persona ids and also builds persona_group cells. */
  personaMeta?: Map<string, import("./personaCells").PersonaCellMeta>;
};

/**
 * Groups valid draws into cells and rolls each up. Per draw: the overall cell (no region, no persona filter), its
 * region cell (unless region_honored = no), its persona cell, optional persona_group cell, and combinations.
 * Branded and unbranded prompts never share a cell. Alias personas (business_leader) roll into the
 * report persona id when personaMeta is provided.
 */
export function buildCells(drawsIn: readonly MetricDraw[], ownedDomains: readonly string[], opts: BuildCellsOptions = {}): CellRollup[] {
  const { personaMeta, ...cellOpts } = opts;
  const groups = new Map<string, { key: CellKey; draws: MetricDraw[]; regionExcluded: number }>();
  const add = (key: CellKey, draw: MetricDraw, excluded: boolean) => {
    const id = cellSortKey(key);
    const g = groups.get(id) ?? { key, draws: [], regionExcluded: 0 };
    if (excluded) g.regionExcluded++;
    else g.draws.push(draw);
    groups.set(id, g);
  };
  for (const d of drawsIn) {
    const meta = d.personaId && personaMeta ? personaMeta.get(d.personaId) : undefined;
    const reportPersonaId = meta?.reportPersonaId ?? d.personaId;
    const personaGroup = meta?.group ?? null;
    for (const regionId of [null, d.regionId]) {
      const excluded = regionId !== null && d.regionHonored === "no";
      // Overall / region-only (no persona filter).
      add(cellKey(d.engine, d.runner, regionId, null, d.branded, null), d, excluded);
      if (reportPersonaId) {
        add(cellKey(d.engine, d.runner, regionId, reportPersonaId, d.branded, null), d, excluded);
      }
      if (personaGroup) {
        add(cellKey(d.engine, d.runner, regionId, null, d.branded, personaGroup), d, excluded);
      }
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => cmp(a, b))
    .map(([, g]) => rollupCell({ key: g.key, draws: g.draws, ownedDomains, regionExcluded: g.regionExcluded, ...cellOpts }));
}

/**
 * Cells that may be shown as the headline: unbranded, with the given region and persona filter (default: none).
 * Branded cells are always left out. Defaults to no persona and no persona group filter.
 */
export function headlineCells(
  cells: readonly CellRollup[],
  filter: { regionId?: string | null; personaId?: string | null; personaGroup?: string | null } = {},
): CellRollup[] {
  const regionId = filter.regionId ?? null;
  const personaId = filter.personaId ?? null;
  const personaGroup = filter.personaGroup ?? null;
  return cells.filter(
    (c) =>
      !c.key.branded &&
      c.promptsWon !== null &&
      c.key.regionId === regionId &&
      c.key.personaId === personaId &&
      c.key.personaGroup === personaGroup,
  );
}

/** Overall unbranded prompts won per engine x runner, with no bootstrap (cheap enough for a trend over scans). */
export function headlinePromptsWon(drawsIn: readonly MetricDraw[]): Array<{ engine: Engine; runner: Runner; promptsWon: PromptsWon }> {
  const groups = new Map<string, { engine: Engine; runner: Runner; draws: MetricDraw[] }>();
  for (const d of drawsIn) {
    if (d.branded) continue;
    const id = `${d.engine}|${d.runner}`;
    const g = groups.get(id) ?? { engine: d.engine, runner: d.runner, draws: [] };
    g.draws.push(d);
    groups.set(id, g);
  }
  return [...groups.keys()].sort().map((id) => {
    const g = groups.get(id)!;
    const per = groupByPrompt(g.draws).map((p) => ({ mentions: p.draws.filter(brandMentioned).length, validDraws: p.draws.length }));
    return { engine: g.engine, runner: g.runner, promptsWon: promptsWon(per) };
  });
}

// ---------- scan rollup ----------

export type ScanRollup = {
  scanId: string;
  promptSetId: string | null;
  /** When this rollup was computed. The only field that differs between two runs on the same data. */
  rolledAt: string;
  seed: number;
  iterations: number;
  /** Draws left out of every cell, by reason. Unjudged draws are not scored until judging finishes. */
  excluded: ExcludedCounts;
  ownedDomains: string[];
  cells: CellRollup[];
};

export async function loadPersonaMetaForDraws(db: Db, draws: readonly MetricDraw[]): Promise<Map<string, PersonaCellMeta>> {
  const ids = [...new Set(draws.map((d) => d.personaId).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const rows = await db.select({ id: personas.id, key: personas.key }).from(personas).where(inArray(personas.id, ids));
  const reportKeys = new Set<string>();
  for (const row of rows) {
    if (!row.key) continue;
    const canonical = canonicalKeyForDbKey(row.key);
    if (canonical) reportKeys.add(selectableDbKeyForCanonical(canonical));
  }
  const extras =
    reportKeys.size > 0
      ? await db.select({ id: personas.id, key: personas.key }).from(personas).where(inArray(personas.key, [...reportKeys]))
      : [];
  const byId = new Map<string, { id: string; key: string | null }>();
  for (const row of [...rows, ...extras]) byId.set(row.id, row);
  return buildPersonaCellMeta([...byId.values()]);
}

export function rollupLoaded(
  loaded: LoadedScan,
  opts: CellOptions & { now?: Date; personaMeta?: Map<string, PersonaCellMeta> } = {},
): ScanRollup {
  const iterations = opts.iterations ?? BOOTSTRAP_ITERS;
  const seed = opts.seed ?? BOOTSTRAP_SEED;
  return {
    scanId: loaded.scanId,
    promptSetId: loaded.promptSetId,
    rolledAt: (opts.now ?? new Date()).toISOString(),
    seed,
    iterations,
    excluded: loaded.excluded,
    ownedDomains: loaded.ownedDomains,
    cells: buildCells(loaded.draws, loaded.ownedDomains, { iterations, seed, personaMeta: opts.personaMeta }),
  };
}

/** Rolls up one scan. Fails if the scan does not belong to `orgId`. Read only. */
export async function rollupScan(db: Db, opts: { orgId: string; scanId: string; now?: Date } & CellOptions): Promise<ScanRollup> {
  const loaded = await loadScanDraws(db, { orgId: opts.orgId, scanId: opts.scanId });
  const personaMeta = await loadPersonaMetaForDraws(db, loaded.draws);
  return rollupLoaded(loaded, { ...opts, personaMeta });
}

// ---------- campaign dashboard ----------

export type TrendPoint = {
  scanId: string;
  createdAt: string;
  series: Array<{ engine: Engine; runner: Runner; promptsWon: PromptsWon }>;
};

export type DashboardPromptSet = {
  promptSetId: string;
  version: number;
  sha256: string | null;
  scanCount: number;
  latestScan: { id: string; createdAt: string; status: string };
  rollup: ScanRollup;
  previousScan: { id: string; createdAt: string } | null;
  /** McNemar label per series against the previous scan of the same prompt set. Empty without a previous scan. */
  comparisons: SeriesComparison[];
  /** Oldest first, same prompt set only. Different prompt set versions are never joined into one trend. */
  trend: TrendPoint[];
};

export const TREND_MAX_SCANS = 12;

export async function rollupCampaignDashboard(db: Db, opts: { orgId: string; campaignId: string; now?: Date } & CellOptions) {
  const campaign = await getCampaign(db, opts.orgId, opts.campaignId); // throws NotFoundError for another org's campaign

  // Legacy Energy keeps a long-running unfrozen scan; include it. Measured campaigns stay complete/partial + frozen sets only.
  const statuses = campaign.legacy
    ? (["complete", "partial", "running"] as const)
    : (["complete", "partial"] as const);
  const scanRows = await db
    .select({ id: scans.id, promptSetId: scans.promptSetId, status: scans.status, createdAt: scans.createdAt })
    .from(scans)
    .where(and(eq(scans.campaignId, opts.campaignId), eq(scans.kind, "scan"), inArray(scans.status, [...statuses])))
    .orderBy(asc(scans.createdAt), asc(scans.id));
  const LEGACY_SET_KEY = "__legacy_unfrozen__";
  const bySet = new Map<string, typeof scanRows>();
  for (const s of scanRows) {
    if (!s.promptSetId && !campaign.legacy) continue;
    const key = s.promptSetId ?? LEGACY_SET_KEY;
    const list = bySet.get(key) ?? [];
    list.push(s);
    bySet.set(key, list);
  }

  let realSetIds = [...bySet.keys()].filter((k) => k !== LEGACY_SET_KEY);
  // Prefer frozen prompt-set series when present; only surface the unfrozen legacy bucket alone.
  if (realSetIds.length > 0) bySet.delete(LEGACY_SET_KEY);
  realSetIds = [...bySet.keys()].filter((k) => k !== LEGACY_SET_KEY);
  const setRows = realSetIds.length
    ? await db.select().from(promptSets).where(and(eq(promptSets.campaignId, opts.campaignId), inArray(promptSets.id, realSetIds))).orderBy(desc(promptSets.version))
    : [];

  const promptSetViews: DashboardPromptSet[] = [];
  const setsToRender: Array<{ id: string; sha256: string | null; version: number | null; frozenAt: string | null }> = [
    ...setRows.map((s) => ({ id: s.id, sha256: s.sha256, version: s.version, frozenAt: s.frozenAt?.toISOString() ?? null })),
  ];
  if (bySet.has(LEGACY_SET_KEY)) {
    setsToRender.push({ id: LEGACY_SET_KEY, sha256: null, version: null, frozenAt: null });
  }

  for (const set of setsToRender) {
    const list = bySet.get(set.id)!;
    const latest = list[list.length - 1];
    const trendScans = list.slice(-TREND_MAX_SCANS);
    const trend: TrendPoint[] = [];
    let latestRollup: ScanRollup | null = null;
    for (const s of trendScans) {
      const loaded = await loadScanDraws(db, { orgId: opts.orgId, scanId: s.id });
      trend.push({ scanId: s.id, createdAt: s.createdAt.toISOString(), series: headlinePromptsWon(loaded.draws) });
      if (s.id === latest.id) {
        const personaMeta = await loadPersonaMetaForDraws(db, loaded.draws);
        latestRollup = rollupLoaded(loaded, { ...opts, personaMeta });
      }
    }
    const prev = await previousComparableScan(db, latest.id);
    promptSetViews.push({
      promptSetId: set.id === LEGACY_SET_KEY ? latest.id : set.id,
      version: set.version ?? 0,
      sha256: set.sha256,
      scanCount: list.length,
      latestScan: { id: latest.id, createdAt: latest.createdAt.toISOString(), status: latest.status },
      rollup: latestRollup!,
      previousScan: prev ? { id: prev.id, createdAt: prev.createdAt.toISOString() } : null,
      comparisons: prev ? await compareScans(db, prev.id, latest.id, { orgId: opts.orgId }) : [],
      trend,
    });
  }

  const alertRows = await listOpenAlerts(db, opts.orgId, opts.campaignId);
  const engines = [...new Set(campaign.engines.map((e) => e.engine))] as Engine[];
  const events = engines.length
    ? await db.select().from(modelEvents).where(inArray(modelEvents.engine, engines)).orderBy(desc(modelEvents.occurredOn), asc(modelEvents.engine))
    : [];

  return {
    campaign: { id: campaign.id, name: campaign.name, topic: campaign.topic, status: campaign.status },
    engines: campaign.engines,
    regions: campaign.regions,
    personas: campaign.personas,
    persona_groups: Object.entries(PERSONA_GROUP_LABELS).map(([key, label]) => ({ key, label })),
    promptSets: promptSetViews,
    alerts: alertRows,
    modelEvents: events,
  };
}

export type CampaignDashboard = Awaited<ReturnType<typeof rollupCampaignDashboard>>;
