/**
 * Truth layer: surface brand facts that conflict with values cited on third-party pages.
 * Reports our fact, the conflicting value, and the source URL. Never auto-corrects.
 */
import type { BrandFactInput, CitedValueInput, TruthConflict } from "./types";

/** Normalize for comparison: trim, lowercase, collapse whitespace, strip thousands separators in numbers. */
export function normalizeFactValue(raw: string): string {
  let s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  // "15,000" / "$15,000" → comparable digit string when the whole token is numeric-ish
  if (/^[$€£]?\d{1,3}(,\d{3})+(\.\d+)?%?$/.test(s) || /^\d{1,3}(,\d{3})+(\.\d+)?%?$/.test(s)) {
    s = s.replace(/[$€£]/g, "").replace(/,/g, "");
  }
  return s;
}

/**
 * Find cited values that share a key with a brand fact but disagree on the normalized value.
 * Does not mutate facts or propose replacements.
 */
export function findTruthConflicts(
  facts: readonly BrandFactInput[],
  cited: readonly CitedValueInput[],
): TruthConflict[] {
  const byKey = new Map<string, BrandFactInput[]>();
  for (const f of facts) {
    const key = f.key.trim().toLowerCase();
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(f);
    byKey.set(key, list);
  }

  const out: TruthConflict[] = [];
  const seen = new Set<string>();

  for (const c of cited) {
    const key = c.key.trim().toLowerCase();
    if (!key || !c.sourceUrl.trim()) continue;
    const matches = byKey.get(key);
    if (!matches) continue;
    const citedNorm = normalizeFactValue(c.value);
    if (!citedNorm) continue;

    for (const fact of matches) {
      const ourNorm = normalizeFactValue(fact.value);
      if (!ourNorm || ourNorm === citedNorm) continue;
      const dedupe = `${fact.id}|${citedNorm}|${c.sourceUrl}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({
        factId: fact.id,
        ourFact: fact.text,
        conflictingValue: c.excerpt?.trim() || c.value,
        sourceUrl: c.sourceUrl,
      });
    }
  }

  return out.sort((a, b) =>
    a.factId < b.factId ? -1 : a.factId > b.factId ? 1 : a.sourceUrl < b.sourceUrl ? -1 : 1,
  );
}
