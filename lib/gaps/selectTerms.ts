/**
 * Gap headline terms for highlighting and the "What cited pages share" table.
 * Brand name + aliases are excluded; stopwords dropped; a term needs ≥2 distinct cited pages.
 */
import { extractHeadlineTerms } from "./termLift";
import type { PageTermSource } from "./types";

export const MIN_PAGES_PER_GAP_TERM = 2;

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "as",
  "is", "are", "was", "were", "be", "been", "being", "this", "that", "these", "those", "it", "its",
  "into", "over", "under", "about", "after", "before", "between", "through", "during", "without",
  "within", "your", "our", "their", "his", "her", "how", "what", "when", "where", "which", "who", "why",
  "can", "could", "should", "would", "may", "might", "will", "just", "also", "more", "most", "other",
  "some", "such", "than", "then", "too", "very", "not", "no", "nor", "only", "own", "same", "so", "up",
  "out", "if", "any", "all", "each", "few", "best", "top", "new", "vs", "versus", "guide", "page",
  "university", "college", "school", "schools", "programs", "program",
]);

export function isGapStopword(term: string): boolean {
  return STOPWORDS.has(term.trim().toLowerCase());
}

/**
 * Brand name + every alias (exact, lowercased). Short names (≤3 tokens) also contribute
 * non-stopword tokens so "Demo University" / "Demo U" block "demo". Long unit titles
 * (e.g. "Energy Production and Infrastructure Center") are exact-match only — otherwise
 * every word like "energy" would be wrongly suppressed as a gap term.
 */
export function brandExclusionSet(brandName: string, aliases: readonly string[]): Set<string> {
  const out = new Set<string>();
  const add = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (!t) return;
    out.add(t);
    const parts = t.split(/[^a-z0-9]+/).filter(Boolean);
    if (parts.length > 3) return;
    for (const part of parts) {
      if (part.length >= 2 && !STOPWORDS.has(part)) out.add(part);
    }
  };
  add(brandName);
  for (const a of aliases) add(a);
  return out;
}

export function isExcludedBrandTerm(term: string, excluded: ReadonlySet<string>): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  if (excluded.has(t)) return true;
  // Multi-word term excluded if every token is in the brand set (e.g. "demo university").
  const parts = t.split(/[^a-z0-9]+/).filter(Boolean);
  if (parts.length > 1 && parts.every((p) => excluded.has(p))) return true;
  return false;
}

/**
 * Keep terms that appear on ≥ MIN_PAGES_PER_GAP_TERM distinct pages, are not stopwords,
 * and are not the brand name / alias (or their tokens).
 */
export function selectGapTermsFromPages(input: {
  pages: readonly PageTermSource[];
  brandName: string;
  aliases: readonly string[];
  minPages?: number;
}): Array<{ term: string; n: number; pageIds: string[] }> {
  const minPages = input.minPages ?? MIN_PAGES_PER_GAP_TERM;
  const excluded = brandExclusionSet(input.brandName, input.aliases);
  const byTerm = new Map<string, Set<string>>();
  for (const page of input.pages) {
    for (const term of extractHeadlineTerms(page)) {
      if (isGapStopword(term)) continue;
      if (isExcludedBrandTerm(term, excluded)) continue;
      const set = byTerm.get(term) ?? new Set<string>();
      set.add(page.id);
      byTerm.set(term, set);
    }
  }
  const rows: Array<{ term: string; n: number; pageIds: string[] }> = [];
  for (const [term, pages] of byTerm) {
    if (pages.size < minPages) continue;
    rows.push({ term, n: pages.size, pageIds: [...pages].sort() });
  }
  rows.sort((a, b) => b.n - a.n || (a.term < b.term ? -1 : 1));
  return rows;
}

/** Filter a hand-authored or stored term list for safe highlighting. */
export function filterGapTermsForHighlight(
  terms: readonly string[],
  brandName: string,
  aliases: readonly string[],
  opts?: { pageCounts?: Map<string, number>; minPages?: number },
): string[] {
  const excluded = brandExclusionSet(brandName, aliases);
  const minPages = opts?.minPages ?? MIN_PAGES_PER_GAP_TERM;
  const out: string[] = [];
  for (const raw of terms) {
    const t = raw.trim();
    if (!t) continue;
    if (isGapStopword(t)) continue;
    if (isExcludedBrandTerm(t, excluded)) continue;
    if (opts?.pageCounts) {
      const n = opts.pageCounts.get(t.toLowerCase()) ?? 0;
      if (n < minPages) continue;
    }
    out.push(t);
  }
  return [...new Set(out)];
}
