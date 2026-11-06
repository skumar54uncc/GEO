/**
 * Headline term lift: log-odds ratio with an informative Dirichlet (Jeffreys) prior.
 *
 * Requires ≥ MIN_CITED_PAGES_PER_COHORT unique pages in BOTH cohorts before any term
 * is shown. Every term carries n for each cohort and CORRELATION_LABEL.
 */
import {
  CORRELATION_LABEL,
  DIRICHLET_ALPHA,
  MIN_CITED_PAGES_PER_COHORT,
  NOT_ENOUGH_PAGES_MESSAGE,
  type PageTermSource,
  type TermLiftResult,
  type TermLiftRow,
} from "./types";

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "into",
  "over",
  "under",
  "about",
  "after",
  "before",
  "between",
  "through",
  "during",
  "without",
  "within",
  "your",
  "our",
  "their",
  "his",
  "her",
  "how",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "can",
  "could",
  "should",
  "would",
  "may",
  "might",
  "will",
  "just",
  "also",
  "more",
  "most",
  "other",
  "some",
  "such",
  "than",
  "then",
  "too",
  "very",
  "not",
  "no",
  "nor",
  "only",
  "own",
  "same",
  "so",
  "up",
  "out",
  "if",
  "any",
  "all",
  "each",
  "few",
  "best",
  "top",
  "new",
  "vs",
  "versus",
]);

/** Tokenize title / H1 / H2 text into lowercase unigrams (length ≥ 3, no stopwords). */
export function extractHeadlineTerms(page: PageTermSource): Set<string> {
  const parts = [page.title, page.h1, ...(page.h2s ?? [])].filter(Boolean).join(" ");
  const terms = new Set<string>();
  for (const raw of parts.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue;
    if (STOPWORDS.has(raw)) continue;
    if (/^\d+$/.test(raw)) continue;
    terms.add(raw);
  }
  return terms;
}

function logit(p: number): number {
  const clamped = Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, p));
  return Math.log(clamped / (1 - clamped));
}

/**
 * Posterior mean under Beta(α, α) = Dirichlet prior on a Bernoulli rate.
 * α = DIRICHLET_ALPHA (Jeffreys 0.5) so rare terms are not overstated.
 */
export function smoothedRate(matches: number, n: number, alpha = DIRICHLET_ALPHA): number {
  return (matches + alpha) / (n + 2 * alpha);
}

/** Log-odds(lost) − log-odds(won) with Dirichlet smoothing. */
export function logOddsLift(
  lostMatches: number,
  lostN: number,
  wonMatches: number,
  wonN: number,
  alpha = DIRICHLET_ALPHA,
): number {
  return logit(smoothedRate(lostMatches, lostN, alpha)) - logit(smoothedRate(wonMatches, wonN, alpha));
}

/**
 * Compare headline terms on lost-cohort cited pages vs won-cohort cited pages.
 * Returns no terms when either cohort has fewer than MIN_CITED_PAGES_PER_COHORT pages.
 */
export function computeTermLifts(input: {
  wonPages: readonly PageTermSource[];
  lostPages: readonly PageTermSource[];
  /** Minimum absolute lift to include a term (default 0 = all overlapping vocabulary). */
  minAbsLift?: number;
}): TermLiftResult {
  const wonN = input.wonPages.length;
  const lostN = input.lostPages.length;
  if (wonN < MIN_CITED_PAGES_PER_COHORT || lostN < MIN_CITED_PAGES_PER_COHORT) {
    return {
      status: "insufficient",
      message: NOT_ENOUGH_PAGES_MESSAGE,
      wonN,
      lostN,
      terms: [],
    };
  }

  const wonTermPages = new Map<string, number>();
  const lostTermPages = new Map<string, number>();
  const allTerms = new Set<string>();

  for (const page of input.wonPages) {
    for (const term of extractHeadlineTerms(page)) {
      wonTermPages.set(term, (wonTermPages.get(term) ?? 0) + 1);
      allTerms.add(term);
    }
  }
  for (const page of input.lostPages) {
    for (const term of extractHeadlineTerms(page)) {
      lostTermPages.set(term, (lostTermPages.get(term) ?? 0) + 1);
      allTerms.add(term);
    }
  }

  const minAbs = input.minAbsLift ?? 0;
  const terms: TermLiftRow[] = [];
  for (const term of allTerms) {
    const wonMatches = wonTermPages.get(term) ?? 0;
    const lostMatches = lostTermPages.get(term) ?? 0;
    // Skip terms that never appear in either cohort's pages as a page-hit (shouldn't happen).
    if (wonMatches === 0 && lostMatches === 0) continue;
    const lift = logOddsLift(lostMatches, lostN, wonMatches, wonN);
    if (Math.abs(lift) < minAbs) continue;
    terms.push({
      term,
      won: { matches: wonMatches, n: wonN },
      lost: { matches: lostMatches, n: lostN },
      logOddsLift: lift,
      label: CORRELATION_LABEL,
    });
  }

  terms.sort((a, b) => b.logOddsLift - a.logOddsLift || (a.term < b.term ? -1 : 1));

  return {
    status: "ok",
    label: CORRELATION_LABEL,
    terms,
    wonN,
    lostN,
  };
}
