import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { brandAliases, brands, competitorAliases, competitors } from "@/lib/db/pg/schema";

export type AliasEntry = {
  alias: string;
  entityType: "brand" | "competitor";
  entityId: string;
  /** Display name: the brand or competitor name. */
  entityName: string;
  requiresContext: boolean;
};

export type AliasMatch = AliasEntry & { start: number; end: number; text: string };

export type Prominence = "headline" | "first_paragraph" | "body" | "footnote_only";

export async function loadAliases(db: Db, orgId: string, brandId: string): Promise<AliasEntry[]> {
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
  const out: AliasEntry[] = [];
  if (brand) {
    out.push({ alias: brand.name, entityType: "brand", entityId: brand.id, entityName: brand.name, requiresContext: false });
    const rows = await db.select().from(brandAliases).where(eq(brandAliases.brandId, brandId)).orderBy(asc(brandAliases.sortOrder));
    for (const r of rows) out.push({ alias: r.alias, entityType: "brand", entityId: brand.id, entityName: brand.name, requiresContext: r.requiresContext });
  }
  const comps = await db.select().from(competitors).where(eq(competitors.orgId, orgId)).orderBy(asc(competitors.sortOrder));
  const aliasRows = comps.length ? await db.select().from(competitorAliases).where(inArray(competitorAliases.competitorId, comps.map((c) => c.id))) : [];
  for (const c of comps) {
    out.push({ alias: c.name, entityType: "competitor", entityId: c.id, entityName: c.name, requiresContext: false });
    for (const a of aliasRows.filter((x) => x.competitorId === c.id)) {
      out.push({ alias: a.alias, entityType: "competitor", entityId: c.id, entityName: c.name, requiresContext: a.alias.trim().toLowerCase() === "charlotte" });
    }
  }
  return dedupe(out);
}

function dedupe(list: AliasEntry[]): AliasEntry[] {
  const seen = new Set<string>();
  return list.filter((a) => {
    const k = `${a.entityType}|${a.entityId}|${a.alias.trim().toLowerCase()}`;
    if (!a.alias.trim() || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Short all caps aliases (EPIC, UNCC) match case sensitively, so "an epic campus" is not a mention. */
function isAcronym(alias: string): boolean {
  return alias.length <= 6 && alias === alias.toUpperCase() && /[A-Z]/.test(alias);
}

/**
 * Deterministic alias matching with word boundaries. Overlapping matches keep the longest, so
 * "Queens University of Charlotte" never yields "Charlotte", and "University of North Carolina at
 * Charlotte" wins over "University of North Carolina". Aliases that require context ("Charlotte"
 * alone is the city) never produce a match on their own.
 */
export function matchAliases(text: string, aliases: AliasEntry[]): AliasMatch[] {
  const found: AliasMatch[] = [];
  for (const a of aliases) {
    const alias = a.alias.trim();
    if (!alias) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(alias).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, isAcronym(alias) ? "gu" : "giu");
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      found.push({ ...a, start, end: start + m[0].length, text: m[0] });
    }
  }
  found.sort((x, y) => x.start - y.start || y.end - y.start - (x.end - x.start));
  const kept: AliasMatch[] = [];
  for (const m of found) {
    const overlaps = kept.some((k) => m.start < k.end && k.start < m.end);
    if (!overlaps) kept.push(m);
  }
  return kept.filter((m) => !m.requiresContext);
}

/** Line based list items (numbered, bulleted, or markdown headings in a run), in order. */
export function listItems(text: string): Array<{ start: number; end: number }> {
  const items: Array<{ start: number; end: number }> = [];
  const re = /^[ \t]*(?:\d{1,2}[.)]|[-*•]|#{2,4})[ \t]+.+$/gm;
  for (const m of text.matchAll(re)) items.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  return items;
}

/** 1 based position of the first list item that contains the span, or null when not in a list. */
export function listPosition(text: string, start: number): number | null {
  const items = listItems(text);
  if (items.length < 2) return null;
  const i = items.findIndex((it) => start >= it.start && start < it.end);
  return i >= 0 ? i + 1 : null;
}

const SOURCES_HEADING = /^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?(sources|references|citations|learn more)(?:\*\*)?:?[ \t]*$/im;

export function prominenceAt(text: string, start: number): Prominence {
  const sources = text.search(SOURCES_HEADING);
  if (sources >= 0 && start >= sources) return "footnote_only";
  const firstLineEnd = text.indexOf("\n");
  const firstLine = firstLineEnd < 0 ? text : text.slice(0, firstLineEnd);
  if (start < firstLine.length && (/^\s*#/.test(firstLine) || firstLine.length <= 120)) return "headline";
  const paraEnd = text.search(/\n\s*\n/);
  if (paraEnd < 0 || start < paraEnd) return "first_paragraph";
  return "body";
}

/** Best (earliest) prominence and list position per entity, from deterministic matches only. */
export function summarizeMatches(text: string, matches: AliasMatch[]) {
  const byEntity = new Map<string, { entityType: "brand" | "competitor"; entityId: string; entityName: string; first: AliasMatch; matches: AliasMatch[]; listPosition: number | null; prominence: Prominence }>();
  for (const m of matches) {
    const k = `${m.entityType}|${m.entityId}`;
    const cur = byEntity.get(k);
    if (cur) cur.matches.push(m);
    else byEntity.set(k, { entityType: m.entityType, entityId: m.entityId, entityName: m.entityName, first: m, matches: [m], listPosition: null, prominence: "body" });
  }
  const rank: Record<Prominence, number> = { headline: 0, first_paragraph: 1, body: 2, footnote_only: 3 };
  for (const e of byEntity.values()) {
    e.prominence = e.matches.map((m) => prominenceAt(text, m.start)).sort((a, b) => rank[a] - rank[b])[0];
    e.listPosition = e.matches.map((m) => listPosition(text, m.start)).find((p) => p !== null) ?? null;
  }
  return [...byEntity.values()];
}
