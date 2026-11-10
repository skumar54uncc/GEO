import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, draws, prompts, scans } from "@/lib/db/pg/schema";
import { ROUTES } from "@/lib/capture/registry";
import type { Engine } from "@/lib/capture/types";
import { loadAliases, matchAliases } from "@/lib/judge/aliases";

export const SAMPLE_LABEL_HEADER =
  "draw_id,engine,prompt,answer,sentiment,missed_mention,named_sources";

export type SampleDrawRow = {
  drawId: string;
  engine: string;
  prompt: string;
  answer: string;
};

const PRIMARY_ENGINES: Engine[] = Object.keys(ROUTES) as Engine[];

/**
 * Pick up to `limit` ok draws where a brand alias matched, spread across primary engines.
 * No paid calls.
 */
export async function selectBrandMatchedSample(
  db: Db,
  opts: { orgId: string; scanId: string; limit?: number },
): Promise<SampleDrawRow[]> {
  const limit = opts.limit ?? 20;
  const [scan] = await db
    .select({ id: scans.id, campaignId: scans.campaignId, orgId: campaigns.orgId, brandId: campaigns.brandId })
    .from(scans)
    .innerJoin(campaigns, eq(campaigns.id, scans.campaignId))
    .where(and(eq(scans.id, opts.scanId), eq(campaigns.orgId, opts.orgId)));
  if (!scan) throw new Error(`Scan ${opts.scanId} not found in org`);

  const aliases = await loadAliases(db, opts.orgId, scan.brandId);
  const brandAliases = aliases.filter((a) => a.entityType === "brand");
  const rows = await db
    .select({
      id: draws.id,
      engine: draws.engine,
      answerText: draws.answerText,
      promptText: prompts.text,
    })
    .from(draws)
    .innerJoin(prompts, eq(prompts.id, draws.promptId))
    .where(and(eq(draws.scanId, opts.scanId), eq(draws.status, "ok")));

  const byEngine = new Map<string, SampleDrawRow[]>();
  for (const eng of PRIMARY_ENGINES) byEngine.set(eng, []);

  for (const r of rows) {
    const hits = matchAliases(r.answerText, brandAliases);
    if (!hits.length) continue;
    const list = byEngine.get(r.engine) ?? [];
    list.push({
      drawId: r.id,
      engine: r.engine,
      prompt: r.promptText,
      answer: r.answerText,
    });
    byEngine.set(r.engine, list);
  }

  // Round-robin across engines that have brand-matched draws.
  const engines = PRIMARY_ENGINES.filter((e) => (byEngine.get(e) ?? []).length > 0);
  const indexes = Object.fromEntries(engines.map((e) => [e, 0])) as Record<string, number>;
  const picked: SampleDrawRow[] = [];
  while (picked.length < limit) {
    let added = false;
    for (const eng of engines) {
      if (picked.length >= limit) break;
      const list = byEngine.get(eng) ?? [];
      const i = indexes[eng] ?? 0;
      if (i >= list.length) continue;
      picked.push(list[i]);
      indexes[eng] = i + 1;
      added = true;
    }
    if (!added) break;
  }
  return picked;
}

/** Escape a CSV field (quotes when needed). */
export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Blank label columns for hand labeling. */
export function sampleRowsToCsv(rows: SampleDrawRow[]): string {
  const lines = [SAMPLE_LABEL_HEADER];
  for (const r of rows) {
    lines.push(
      [r.drawId, r.engine, csvEscape(r.prompt), csvEscape(r.answer), "", "", ""].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
