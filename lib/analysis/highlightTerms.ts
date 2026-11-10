/**
 * Highlight known terms inside a headline (title / H1 / H2).
 * Same rule as highlightAnswerHtml: find spans on raw UTF-16 text, then escape each segment.
 */
import { escapeHtml } from "./answerExplorer";

export type HighlightTermsResult = {
  html: string;
  /** Number of term occurrences wrapped. */
  matched: number;
};

/**
 * Case-insensitive whole-word-ish matches for each term (non-overlapping; earlier wins).
 * Empty / blank terms are ignored. Never throws.
 */
export function highlightGapTermsHtml(text: string, terms: readonly string[]): HighlightTermsResult {
  if (!text) return { html: "", matched: 0 };
  const cleaned = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length > 0))].sort(
    (a, b) => b.length - a.length,
  );
  if (cleaned.length === 0) return { html: escapeHtml(text), matched: 0 };

  type Span = { start: number; end: number; term: string };
  const spans: Span[] = [];
  const lower = text.toLowerCase();
  for (const term of cleaned) {
    const needle = term.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(needle, from);
      if (idx < 0) break;
      const end = idx + needle.length;
      const overlaps = spans.some((s) => !(end <= s.start || idx >= s.end));
      if (!overlaps) spans.push({ start: idx, end, term });
      from = idx + 1;
    }
  }
  spans.sort((a, b) => a.start - b.start || a.end - b.end);

  if (spans.length === 0) return { html: escapeHtml(text), matched: 0 };

  const parts: string[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) parts.push(escapeHtml(text.slice(cursor, span.start)));
    const slice = text.slice(span.start, span.end);
    parts.push(
      `<mark class="mention-gap-term" data-label="${escapeHtml(span.term)}">${escapeHtml(slice)}</mark>`,
    );
    cursor = span.end;
  }
  if (cursor < text.length) parts.push(escapeHtml(text.slice(cursor)));
  return { html: parts.join(""), matched: spans.length };
}
