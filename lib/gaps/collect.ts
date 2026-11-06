/**
 * Collect citations, cited_pages, and fanout_queries for a set of draw ids
 * (ARCHITECTURE §9 step 2). Pure assembly helpers plus a DB loader.
 */
import { inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { citations, citedPages, fanoutQueries } from "@/lib/db/pg/schema";
import { canonicalizeCitationUrl } from "@/lib/citations/canonical";
import type { GapCitation, GapCitedPage, GapFanoutQuery, LostEvidence } from "./types";

const CHUNK = 5000;

async function inChunks<T>(ids: string[], fn: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await fn(ids.slice(i, i + CHUNK))));
  return out;
}

/** Join citation rows to cited_pages by canonical URL (fixture-friendly, no DB). */
export function assembleLostEvidence(input: {
  citations: GapCitation[];
  citedPages: GapCitedPage[];
  fanoutQueries: GapFanoutQuery[];
}): LostEvidence {
  const pageByCanon = new Map(input.citedPages.map((p) => [p.canonicalUrl, p]));
  const linkedPages: GapCitedPage[] = [];
  const seen = new Set<string>();
  for (const c of input.citations) {
    const canon = c.canonicalUrl ?? canonicalizeCitationUrl(c.url);
    if (!canon) continue;
    const page = pageByCanon.get(canon);
    if (page && !seen.has(page.id)) {
      seen.add(page.id);
      linkedPages.push(page);
    }
  }
  return {
    citations: [...input.citations].sort((a, b) => (a.id < b.id ? -1 : 1)),
    citedPages: linkedPages.sort((a, b) => (a.id < b.id ? -1 : 1)),
    fanoutQueries: [...input.fanoutQueries].sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
}

/** Load evidence rows for the given draws from Postgres. */
export async function collectEvidenceForDraws(db: Db, drawIds: readonly string[]): Promise<LostEvidence> {
  const ids = [...new Set(drawIds)].filter(Boolean);
  if (ids.length === 0) {
    return { citations: [], citedPages: [], fanoutQueries: [] };
  }

  const [citationRows, fanoutRows] = await Promise.all([
    inChunks(ids, (chunk) => db.select().from(citations).where(inArray(citations.drawId, chunk))),
    inChunks(ids, (chunk) => db.select().from(fanoutQueries).where(inArray(fanoutQueries.drawId, chunk))),
  ]);

  const gapCitations: GapCitation[] = citationRows.map((c) => ({
    id: c.id,
    drawId: c.drawId,
    url: c.url,
    canonicalUrl: c.canonicalUrl,
    domain: c.domain,
    sourceClass: c.sourceClass,
    position: c.position,
    title: c.title,
  }));

  const canons = [
    ...new Set(
      gapCitations
        .map((c) => c.canonicalUrl ?? canonicalizeCitationUrl(c.url))
        .filter((u): u is string => Boolean(u)),
    ),
  ];

  const pageRows = canons.length
    ? await inChunks(canons, (chunk) =>
        db.select().from(citedPages).where(inArray(citedPages.canonicalUrl, chunk)),
      )
    : [];

  const gapPages: GapCitedPage[] = pageRows.map((p) => ({
    id: p.id,
    canonicalUrl: p.canonicalUrl,
    title: p.title,
    h1: p.h1,
    h2s: p.h2s ?? [],
    contentType: p.contentType,
    wordCount: p.wordCount,
  }));

  const gapFanout: GapFanoutQuery[] = fanoutRows.map((f) => ({
    id: f.id,
    drawId: f.drawId,
    query: f.query,
    source: f.source,
  }));

  return assembleLostEvidence({
    citations: gapCitations,
    citedPages: gapPages,
    fanoutQueries: gapFanout,
  });
}
