import { inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { prompts, scans } from "@/lib/db/pg/schema";
import { eq } from "drizzle-orm";
import { loadScanDraws, type MetricDraw } from "@/lib/metrics/load";
import { brandMentioned } from "@/lib/metrics/rollup";
import { isPromptWon } from "@/lib/metrics/stats";

export type OverviewQuestionRow = {
  promptId: string;
  text: string;
  audience: string | null;
  intent: "comparison" | "discovery" | "evaluation" | "decision";
  namedByEngines: number;
  enginesTotal: number;
  /** Won on the selected engine (majority brand mentions among that engine's draws). */
  wonOnEngine: boolean;
  lastScanAt: string;
  branded: boolean;
};

const INTENTS = ["comparison", "discovery", "evaluation", "decision"] as const;

function intentForPrompt(index: number): (typeof INTENTS)[number] {
  return INTENTS[index % INTENTS.length];
}

/**
 * Location-neutral (unbranded) prompts from a scan, with k-of-N engines that named us.
 */
export async function listOverviewQuestions(
  db: Db,
  opts: {
    orgId: string;
    scanId: string;
    /** Engine used for Lost/Won tabs. */
    engine?: string;
    enginesTotal?: number;
    includeBranded?: boolean;
    tab?: "all" | "lost" | "won";
    offset?: number;
    limit?: number;
  },
): Promise<{
  rows: OverviewQuestionRow[];
  total: number;
  tabCounts: { all: number; lost: number; won: number };
  hiddenBrandedCount: number;
}> {
  const loaded = await loadScanDraws(db, { orgId: opts.orgId, scanId: opts.scanId });
  const includeBranded = opts.includeBranded === true;

  const scanPromptIds = new Set<string>();
  for (const d of loaded.draws) {
    if (d.personaId) continue;
    scanPromptIds.add(d.promptId);
  }

  const promptMetaRows =
    scanPromptIds.size === 0
      ? []
      : await db
          .select({ id: prompts.id, text: prompts.text, branded: prompts.branded })
          .from(prompts)
          .where(inArray(prompts.id, [...scanPromptIds]));

  const metaById = new Map(promptMetaRows.map((p) => [p.id, p]));

  let hiddenBrandedCount = 0;
  for (const pid of scanPromptIds) {
    const m = metaById.get(pid);
    if (m?.branded && !includeBranded) hiddenBrandedCount += 1;
  }

  const byPrompt = new Map<string, MetricDraw[]>();
  for (const d of loaded.draws) {
    if (!includeBranded && d.branded) continue;
    if (d.personaId) continue;
    const list = byPrompt.get(d.promptId) ?? [];
    list.push(d);
    byPrompt.set(d.promptId, list);
  }

  if (byPrompt.size === 0) {
    return {
      rows: [],
      total: 0,
      tabCounts: { all: 0, lost: 0, won: 0 },
      hiddenBrandedCount,
    };
  }

  const enginesTotal = opts.enginesTotal ?? 6;
  const [scan] = await db.select({ createdAt: scans.createdAt }).from(scans).where(eq(scans.id, opts.scanId)).limit(1);
  const lastScanAt = scan?.createdAt.toISOString() ?? new Date().toISOString();
  const engine = opts.engine;

  const rows: OverviewQuestionRow[] = [];
  let i = 0;
  for (const [promptId, cellDraws] of byPrompt) {
    const meta = metaById.get(promptId);
    if (!meta) continue;
    const byEngine = new Map<string, MetricDraw[]>();
    for (const d of cellDraws) {
      const list = byEngine.get(d.engine) ?? [];
      list.push(d);
      byEngine.set(d.engine, list);
    }
    let named = 0;
    for (const [, eds] of byEngine) {
      const mentionCount = eds.filter(brandMentioned).length;
      if (isPromptWon(mentionCount, eds.length)) named += 1;
    }
    let wonOnEngine = false;
    if (engine) {
      const eds = byEngine.get(engine) ?? [];
      wonOnEngine = isPromptWon(eds.filter(brandMentioned).length, eds.length);
    } else {
      wonOnEngine = named > 0;
    }
    rows.push({
      promptId,
      text: meta.text,
      audience: null,
      intent: intentForPrompt(i),
      namedByEngines: named,
      enginesTotal,
      wonOnEngine,
      lastScanAt,
      branded: meta.branded,
    });
    i += 1;
  }

  rows.sort((a, b) => b.namedByEngines - a.namedByEngines || a.text.localeCompare(b.text));

  const tabCounts = {
    all: rows.length,
    won: rows.filter((r) => r.wonOnEngine).length,
    lost: rows.filter((r) => !r.wonOnEngine).length,
  };

  let filtered = rows;
  const tab = opts.tab ?? "all";
  if (tab === "won") filtered = rows.filter((r) => r.wonOnEngine);
  if (tab === "lost") filtered = rows.filter((r) => !r.wonOnEngine);

  const total = filtered.length;
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 20;
  return { rows: filtered.slice(offset, offset + limit), total, tabCounts, hiddenBrandedCount };
}
