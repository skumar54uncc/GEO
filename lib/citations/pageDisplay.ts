/**
 * Plain-language labels for cited-page features and freshness in Answer Explorer.
 * Freshness uses published/modified only — never fetched_at.
 */

export const FEATURES_DETECTED_LABEL = "detected automatically" as const;
export const FEATURES_DETECTED_TOOLTIP =
  "Detected automatically from the fetched HTML: list/listicle structure, short Q&A blocks (answer capsules), numeric statistics, and attributed quotes. Not hand-labeled." as const;

export type CitedPageDateFields = {
  publishedAt: Date | string | null | undefined;
  updatedAt: Date | string | null | undefined;
  /** Ignored for freshness — present so callers do not pass it by mistake. */
  fetchedAt?: Date | string | null | undefined;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Prefer updatedAt, else publishedAt. No date → "unknown". Never uses fetchedAt. */
export function citedPageFreshnessLabel(page: CitedPageDateFields): {
  label: string;
  source: "updated" | "published" | "unknown";
} {
  void page.fetchedAt; // freshness must not read fetch time
  const updated = asDate(page.updatedAt);
  if (updated) {
    return { label: updated.toISOString().slice(0, 10), source: "updated" };
  }
  const published = asDate(page.publishedAt);
  if (published) {
    return { label: published.toISOString().slice(0, 10), source: "published" };
  }
  return { label: "unknown", source: "unknown" };
}

export type FeatureFlags = {
  listicle: boolean;
  answerCapsule: boolean;
  statisticsCount: number;
  namedQuotes: number;
};

export function featureFlagsSummary(features: FeatureFlags | null): string[] {
  if (!features) return [];
  const parts: string[] = [];
  if (features.listicle) parts.push("listicle");
  if (features.answerCapsule) parts.push("answer capsule");
  if (features.statisticsCount > 0) parts.push(`statistics×${features.statisticsCount}`);
  if (features.namedQuotes > 0) parts.push(`named quotes×${features.namedQuotes}`);
  return parts;
}
