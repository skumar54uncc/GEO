import { and, eq, inArray, sql } from "drizzle-orm";
import { sourceClassifier, type SourceClass } from "@/lib/citations/sourceClass";
import { registrableDomain } from "@/lib/domain";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, citations, draws, prompts, providerCache, scans } from "@/lib/db/pg/schema";
import { getRawText } from "@/lib/rawstore";

export type ExtractedRef = { url: string; title: string | null; position: number };

/**
 * Pull reference URLs from stored SerpAPI or DataForSEO AI Overview payloads.
 * Supports shapes seen in legacy and Phase 3 captures.
 */
export function extractAioReferencesFromRaw(raw: unknown): ExtractedRef[] {
  if (!raw || typeof raw !== "object") return [];
  const root = raw as Record<string, unknown>;

  const candidates: unknown[] = [];

  const aioTop = root.ai_overview;
  if (aioTop && typeof aioTop === "object") {
    const aio = aioTop as Record<string, unknown>;
    if (Array.isArray(aio.references)) candidates.push(...aio.references);
  }
  if (Array.isArray(root.references)) candidates.push(...root.references);

  // DataForSEO: tasks[0].result[0].items[] type=ai_overview → references
  const tasks = Array.isArray(root.tasks) ? root.tasks : [];
  for (const task of tasks) {
    if (!task || typeof task !== "object") continue;
    const results = Array.isArray((task as { result?: unknown }).result)
      ? (task as { result: unknown[] }).result
      : [];
    for (const result of results) {
      if (!result || typeof result !== "object") continue;
      const items = Array.isArray((result as { items?: unknown }).items)
        ? (result as { items: unknown[] }).items
        : [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        if (rec.type === "ai_overview" && Array.isArray(rec.references)) {
          candidates.push(...rec.references);
        }
      }
    }
  }

  const out: ExtractedRef[] = [];
  const seen = new Set<string>();
  for (const ref of candidates) {
    if (!ref || typeof ref !== "object") continue;
    const r = ref as Record<string, unknown>;
    const url = String(r.link ?? r.url ?? r.source ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      title: typeof r.title === "string" ? r.title : null,
      position: out.length + 1,
    });
  }
  return out;
}

export type BackfillResult = {
  drawsChecked: number;
  drawsWithPayload: number;
  drawsSkippedExisting: number;
  citationsInserted: number;
  drawsBackfilled: number;
};

/**
 * Insert citation rows for google_aio draws that have none, using references from
 * stored raw payloads. Never updates draws. Idempotent: skips draws that already
 * have at least one citation row.
 */
export async function backfillAioCitationsFromRaw(
  db: Db,
  opts?: { orgId?: string; dryRun?: boolean; limit?: number },
): Promise<BackfillResult> {
  const dryRun = opts?.dryRun ?? false;
  const limit = opts?.limit ?? 5000;

  const existingDrawIds = await db.selectDistinct({ drawId: citations.drawId }).from(citations);
  const hasCitation = new Set(existingDrawIds.map((r) => r.drawId));

  const candidates = await db
    .select({
      drawId: draws.id,
      orgId: campaigns.orgId,
      rawPayloadId: draws.rawPayloadId,
      promptText: prompts.text,
      paramsHash: draws.paramsHash,
    })
    .from(draws)
    .innerJoin(scans, eq(scans.id, draws.scanId))
    .innerJoin(campaigns, eq(campaigns.id, scans.campaignId))
    .innerJoin(prompts, eq(prompts.id, draws.promptId))
    .where(
      and(
        eq(draws.engine, "google_aio"),
        eq(draws.status, "ok"),
        opts?.orgId ? eq(campaigns.orgId, opts.orgId) : sql`true`,
      ),
    )
    .limit(limit);

  let drawsChecked = 0;
  let drawsWithPayload = 0;
  let drawsSkippedExisting = 0;
  let citationsInserted = 0;
  let drawsBackfilled = 0;

  const classifyByOrg = new Map<string, (input: string) => SourceClass>();

  async function refsForDraw(row: {
    rawPayloadId: string | null;
    promptText: string;
    paramsHash: string | null;
  }): Promise<ExtractedRef[]> {
    if (row.rawPayloadId) {
      const text = await getRawText(db, row.rawPayloadId);
      if (text) {
        drawsWithPayload++;
        try {
          const parsed = JSON.parse(text);
          const refs = extractAioReferencesFromRaw(parsed);
          if (refs.length) return refs;
        } catch {
          // Legacy migration stored answer text as the draw payload (not SerpAPI JSON).
        }
      }
    }
    // Fall back to SerpAPI provider_cache: match by params_hash or prompt text in params.
    if (row.paramsHash) {
      const [hit] = await db
        .select({ rawPayloadId: providerCache.rawPayloadId })
        .from(providerCache)
        .where(and(eq(providerCache.provider, "serpapi"), eq(providerCache.paramsHash, row.paramsHash)))
        .limit(1);
      if (hit?.rawPayloadId) {
        const text = await getRawText(db, hit.rawPayloadId);
        if (text) {
          try {
            const refs = extractAioReferencesFromRaw(JSON.parse(text));
            if (refs.length) return refs;
          } catch {
            /* ignore */
          }
        }
      }
    }
    const needle = row.promptText.slice(0, 48).replace(/[%_]/g, "");
    if (needle.length < 12) return [];
    const caches = await db.execute(sql`
      SELECT raw_payload_id FROM provider_cache
      WHERE provider = 'serpapi' AND params::text ILIKE ${"%" + needle + "%"}
      ORDER BY created_at DESC
      LIMIT 3
    `);
    for (const c of caches.rows as Array<{ raw_payload_id: string }>) {
      const text = await getRawText(db, c.raw_payload_id);
      if (!text) continue;
      try {
        const refs = extractAioReferencesFromRaw(JSON.parse(text));
        if (refs.length) return refs;
      } catch {
        /* ignore */
      }
    }
    return [];
  }

  for (const row of candidates) {
    drawsChecked++;
    if (hasCitation.has(row.drawId)) {
      drawsSkippedExisting++;
      continue;
    }
    const refs = await refsForDraw(row);
    if (refs.length === 0) continue;

    let classify = classifyByOrg.get(row.orgId);
    if (!classify) {
      classify = await sourceClassifier(db, row.orgId);
      classifyByOrg.set(row.orgId, classify);
    }

    const values = refs.map((c) => {
      const domain = registrableDomain(c.url) ?? "unknown";
      return {
        drawId: row.drawId,
        url: c.url,
        canonicalUrl: null as string | null,
        domain,
        position: c.position,
        linked: true as boolean | null,
        sourceClass: classify!(domain),
        title: c.title,
        spanStart: null as number | null,
        spanEnd: null as number | null,
      };
    });

    if (!dryRun) {
      await db.insert(citations).values(values);
    }
    citationsInserted += values.length;
    drawsBackfilled++;
    hasCitation.add(row.drawId);
  }

  return {
    drawsChecked,
    drawsWithPayload,
    drawsSkippedExisting,
    citationsInserted,
    drawsBackfilled,
  };
}

/** Reflag prompts whose text names a brand alias or city (location-biased). */
export async function reflagLocationBiasedPrompts(
  db: Db,
  opts: { orgId: string; isBiased: (text: string) => boolean },
): Promise<{ updated: number; checked: number }> {
  const campaignRows = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.orgId, opts.orgId));
  if (!campaignRows.length) return { updated: 0, checked: 0 };
  const ids = campaignRows.map((c) => c.id);
  const promptRows = await db
    .select({ id: prompts.id, text: prompts.text, branded: prompts.branded })
    .from(prompts)
    .where(inArray(prompts.campaignId, ids));
  let updated = 0;
  for (const p of promptRows) {
    const biased = opts.isBiased(p.text);
    if (biased !== p.branded) {
      await db.update(prompts).set({ branded: biased }).where(eq(prompts.id, p.id));
      updated++;
    }
  }
  return { updated, checked: promptRows.length };
}
