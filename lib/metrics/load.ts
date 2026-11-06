/**
 * Loads the valid draws of one scan for the metrics layer (docs/METRICS.md section 2). Read only.
 *
 * A draw is counted when it is the latest attempt of its cell, status ok, not experimental, and (for api_search)
 * search_used = true; and it has a judge run. Everything excluded is counted so the dashboard can say so.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { brandDomains, campaigns, citations, claims, draws, judgeRuns, mentions, prompts, scans } from "@/lib/db/pg/schema";
import type { Engine, Runner } from "@/lib/capture/types";

export type RegionHonored = "yes" | "no" | "unknown";
export type Verdict = "supported" | "contradicted" | "unverifiable";

export type DrawMention = {
  entityType: "brand" | "competitor";
  entityId: string;
  spanStart: number | null;
  listPosition: number | null;
};

/** One valid, judged draw with everything a cell needs. Pure data: no database handles. */
export type MetricDraw = {
  drawId: string;
  promptId: string;
  engine: Engine;
  runner: Runner;
  provider: string;
  regionId: string;
  regionHonored: RegionHonored;
  personaId: string | null;
  branded: boolean;
  mentions: DrawMention[];
  citations: Array<{ domain: string; sourceClass: string }>;
  claims: Array<{ verdict: Verdict }>;
};

export type ExcludedCounts = {
  /** Draws whose latest attempt is not status ok (error, empty, blocked). */
  notOk: number;
  /** api_search draws where search did not run (or is unknown). Never relabeled. */
  searchNotUsed: number;
  experimental: number;
  /** Valid draws without a judge run yet. They are not scored. */
  unjudged: number;
};

export type LoadedScan = {
  scanId: string;
  orgId: string;
  campaignId: string;
  brandId: string;
  promptSetId: string | null;
  kind: string;
  createdAt: Date;
  ownedDomains: string[];
  draws: MetricDraw[];
  excluded: ExcludedCounts;
};

export class ScanOrgError extends Error {
  constructor(message = "Scan not found in this organization") {
    super(message);
    this.name = "ScanOrgError";
  }
}

const CHUNK = 5000;
async function inChunks<T>(ids: string[], fn: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await fn(ids.slice(i, i + CHUNK))));
  return out;
}

/**
 * With `orgId` the scan must belong to that org. Internal callers that have already checked the org (compareScans,
 * which asserts both scans share one org) may omit it.
 */
export async function loadScanDraws(db: Db, opts: { orgId?: string; scanId: string }): Promise<LoadedScan> {
  const [scan] = await db
    .select({
      id: scans.id,
      kind: scans.kind,
      createdAt: scans.createdAt,
      promptSetId: scans.promptSetId,
      campaignId: campaigns.id,
      orgId: campaigns.orgId,
      brandId: campaigns.brandId,
    })
    .from(scans)
    .innerJoin(campaigns, eq(campaigns.id, scans.campaignId))
    .where(eq(scans.id, opts.scanId));
  // Same message for "missing" and "other org": the caller learns nothing about other orgs' scans.
  if (!scan || (opts.orgId !== undefined && scan.orgId !== opts.orgId)) throw new ScanOrgError();

  const owned = await db
    .select({ domain: brandDomains.domain })
    .from(brandDomains)
    .where(and(eq(brandDomains.brandId, scan.brandId), eq(brandDomains.isOwned, true)));
  const ownedDomains = [...new Set(owned.map((o) => o.domain))].sort();

  // Every attempt, then the latest per cell: a later failed attempt hides an earlier ok one only if it is later.
  const all = await db.select().from(draws).where(eq(draws.scanId, opts.scanId));
  const latest = new Map<string, (typeof all)[number]>();
  for (const r of all) {
    const k = `${r.promptId}|${r.engine}|${r.runner}|${r.regionId}|${r.drawIndex}`;
    const cur = latest.get(k);
    if (!cur || r.attempt > cur.attempt) latest.set(k, r);
  }
  const excluded: ExcludedCounts = { notOk: 0, searchNotUsed: 0, experimental: 0, unjudged: 0 };
  const valid: Array<(typeof all)[number]> = [];
  for (const r of [...latest.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (r.status !== "ok") excluded.notOk++;
    else if (r.experimental) excluded.experimental++;
    else if (r.runner === "api_search" && r.searchUsed !== true) excluded.searchNotUsed++;
    else valid.push(r);
  }

  const drawIds = valid.map((r) => r.id);
  const runs = await inChunks(drawIds, (chunk) =>
    db.select({ id: judgeRuns.id, drawId: judgeRuns.drawId, seq: judgeRuns.seq }).from(judgeRuns).where(inArray(judgeRuns.drawId, chunk)),
  );
  const bestRun = new Map<string, { id: string; seq: number }>();
  for (const r of runs) {
    const cur = bestRun.get(r.drawId);
    if (!cur || r.seq > cur.seq) bestRun.set(r.drawId, { id: r.id, seq: r.seq });
  }
  const runIds = [...bestRun.values()].map((r) => r.id);

  const [mentionRows, claimRows, citationRows] = await Promise.all([
    inChunks(runIds, (chunk) => db.select().from(mentions).where(inArray(mentions.judgeRunId, chunk))),
    inChunks(runIds, (chunk) => db.select().from(claims).where(inArray(claims.judgeRunId, chunk))),
    inChunks(drawIds, (chunk) => db.select().from(citations).where(inArray(citations.drawId, chunk))),
  ]);

  const promptIds = [...new Set(valid.map((r) => r.promptId))];
  const promptRows = await inChunks(promptIds, (chunk) =>
    db.select({ id: prompts.id, branded: prompts.branded, personaId: prompts.personaId }).from(prompts).where(inArray(prompts.id, chunk)),
  );
  const promptById = new Map(promptRows.map((p) => [p.id, p]));

  const mentionsByRun = new Map<string, DrawMention[]>();
  for (const m of mentionRows) {
    // Only this campaign's brand counts as the brand; other brand rows are not tracked entities here.
    if (m.entityType === "brand" && m.entityId !== scan.brandId) continue;
    const list = mentionsByRun.get(m.judgeRunId) ?? [];
    list.push({ entityType: m.entityType, entityId: m.entityId, spanStart: m.spanStart, listPosition: m.listPosition });
    mentionsByRun.set(m.judgeRunId, list);
  }
  const claimsByRun = new Map<string, Array<{ verdict: Verdict }>>();
  for (const c of claimRows) {
    const list = claimsByRun.get(c.judgeRunId) ?? [];
    list.push({ verdict: c.verdict });
    claimsByRun.set(c.judgeRunId, list);
  }
  const citationsByDraw = new Map<string, Array<{ domain: string; sourceClass: string }>>();
  for (const c of citationRows) {
    const list = citationsByDraw.get(c.drawId) ?? [];
    list.push({ domain: c.domain, sourceClass: c.sourceClass });
    citationsByDraw.set(c.drawId, list);
  }

  const out: MetricDraw[] = [];
  for (const r of valid) {
    const run = bestRun.get(r.id);
    if (!run) {
      excluded.unjudged++;
      continue;
    }
    const prompt = promptById.get(r.promptId);
    out.push({
      drawId: r.id,
      promptId: r.promptId,
      engine: r.engine as Engine,
      runner: r.runner as Runner,
      provider: r.provider,
      regionId: r.regionId,
      regionHonored: r.regionHonored as RegionHonored,
      personaId: prompt?.personaId ?? null,
      branded: prompt?.branded ?? false,
      mentions: mentionsByRun.get(run.id) ?? [],
      citations: citationsByDraw.get(r.id) ?? [],
      claims: claimsByRun.get(run.id) ?? [],
    });
  }

  return {
    scanId: scan.id,
    orgId: scan.orgId,
    campaignId: scan.campaignId,
    brandId: scan.brandId,
    promptSetId: scan.promptSetId,
    kind: scan.kind,
    createdAt: scan.createdAt,
    ownedDomains,
    draws: out,
    excluded,
  };
}
