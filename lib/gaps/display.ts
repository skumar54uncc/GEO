/**
 * Leadership-friendly labels for gap cards. No raw enum keys in user-facing strings.
 */

import { CORRELATION_LABEL } from "@/lib/contracts/gaps";

export type CitedPagesShareTerm = { term: string; n: number; headlines: string[] };
export type CitedPagesShareCount = { label: string; n: number };

/** Structured “What cited pages share” table (B2). Always correlation, not cause. */
export type CitedPagesShareTable = {
  label: typeof CORRELATION_LABEL;
  /** Cited pages in the lost cohort used for this table. */
  n: number;
  headlineTerms: CitedPagesShareTerm[];
  contentTypes: CitedPagesShareCount[];
  faqs: CitedPagesShareCount[];
  freshness: { summary: string; n: number } | null;
  peers: CitedPagesShareCount[];
};

export type GapPayloadParts = {
  format?: string;
  headlineTerms?: string[];
  note?: string;
  suggestedAction?: string;
  sharedAmongCitedPages?: string;
  /** Count of cited pages that share the trait (when present). */
  sharedAmongCitedPagesN?: number;
  /** Structured share table for gap cards (preferred over the free-text summary). */
  citedPagesShare?: CitedPagesShareTable;
};

export type GapEvidenceShape = {
  rows?: Array<{ source?: string; detail?: string; url?: string }>;
};

const FORMAT_LABELS: Record<string, string> = {
  program_page: "program page",
  faq: "FAQ content",
  news: "news article",
  ranking_list: "ranking list",
  landing_page: "landing page",
};

const LEVER_LABELS: Record<string, string> = {
  technical: "Technical",
  on_page: "On-page content",
  truth_layer: "Facts and verification",
  listing: "Listings and profiles",
  earned_media: "Earned media",
  community: "Community and forums",
  original_data: "Original data",
};

/** Map `recommendations.lever_type` enum string to a short plain-English label. */
export function leverTypeToLabel(leverType: string | null): string | null {
  if (!leverType) return null;
  return LEVER_LABELS[leverType] ?? leverType.replace(/_/g, " ");
}

/** Derive a human title from payload (never raw keys like on_page or program_page). */
export function gapTitleFromPayload(payload: unknown, fallbackKind: string): string {
  const p = payload as GapPayloadParts | null | undefined;
  if (p?.suggestedAction && typeof p.suggestedAction === "string" && p.suggestedAction.trim()) {
    const s = p.suggestedAction.trim();
    if (s.length <= 120) return s.charAt(0).toUpperCase() + s.slice(1);
    return s.slice(0, 117).trimEnd() + "...";
  }
  const terms = p?.headlineTerms?.filter((t) => typeof t === "string" && t.trim()).slice(0, 4) ?? [];
  const fmt = p?.format ? (FORMAT_LABELS[p.format] ?? p.format.replace(/_/g, " ")) : null;
  if (terms.length && fmt) return `Strengthen ${fmt} visibility for ${terms.join(", ")}`;
  if (terms.length) return `Improve visibility for ${terms.join(", ")}`;
  if (fmt) return `Update your ${fmt}`;
  if (p?.note && typeof p.note === "string") return p.note;
  return fallbackKind === "gap" ? "Gap recommendation" : fallbackKind;
}

export function parseGapEvidence(evidence: unknown): { items: Array<{ detail: string; url?: string }>; count: number } {
  const e = evidence as GapEvidenceShape | null | undefined;
  const rows = e?.rows;
  if (!Array.isArray(rows)) return { items: [], count: 0 };
  const items = rows
    .filter((r): r is { detail?: string; url?: string } => r != null && typeof r === "object")
    .map((r) => ({
      detail: typeof r.detail === "string" ? r.detail : "",
      url: typeof r.url === "string" && r.url.startsWith("http") ? r.url : undefined,
    }))
    .filter((r) => r.detail.length > 0);
  return { items, count: items.length };
}

export function sharedAmongSummary(payload: unknown): { text: string | null; n: number | null } {
  const p = payload as GapPayloadParts | null | undefined;
  const text = typeof p?.sharedAmongCitedPages === "string" && p.sharedAmongCitedPages.trim() ? p.sharedAmongCitedPages.trim() : null;
  const n = typeof p?.sharedAmongCitedPagesN === "number" && Number.isFinite(p.sharedAmongCitedPagesN) ? Math.round(p.sharedAmongCitedPagesN) : null;
  return { text, n };
}

function asCountRows(raw: unknown): CitedPagesShareCount[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is { label?: unknown; n?: unknown } => r != null && typeof r === "object")
    .map((r) => ({
      label: typeof r.label === "string" ? r.label.trim() : "",
      n: typeof r.n === "number" && Number.isFinite(r.n) ? Math.round(r.n) : 0,
    }))
    .filter((r) => r.label.length > 0 && r.n > 0);
}

/** Parse the structured share table from a recommendation payload. Invalid shapes → null. */
export function citedPagesShareFromPayload(payload: unknown): CitedPagesShareTable | null {
  const p = payload as GapPayloadParts | null | undefined;
  const raw = p?.citedPagesShare;
  if (!raw || typeof raw !== "object") return null;
  const n = typeof raw.n === "number" && Number.isFinite(raw.n) ? Math.round(raw.n) : 0;
  if (n < 1) return null;
  const rawHeadlineTerms = (raw as { headlineTerms?: unknown }).headlineTerms;
  const headlineTerms: CitedPagesShareTerm[] = Array.isArray(rawHeadlineTerms)
    ? rawHeadlineTerms
        .map((r) => {
          if (r == null || typeof r !== "object") return null;
          const row = r as { term?: unknown; n?: unknown; headlines?: unknown };
          const term = typeof row.term === "string" ? row.term.trim() : "";
          const n = typeof row.n === "number" && Number.isFinite(row.n) ? Math.round(row.n) : 0;
          const headlines = Array.isArray(row.headlines)
            ? row.headlines.filter((h): h is string => typeof h === "string" && h.trim().length > 0).map((h) => h.trim())
            : [];
          if (!term || n <= 0) return null;
          return { term, n, headlines };
        })
        .filter((r): r is CitedPagesShareTerm => r != null)
    : [];
  const freshness =
    raw.freshness && typeof raw.freshness === "object"
      ? {
          summary:
            typeof (raw.freshness as { summary?: unknown }).summary === "string"
              ? (raw.freshness as { summary: string }).summary.trim()
              : "",
          n:
            typeof (raw.freshness as { n?: unknown }).n === "number" &&
            Number.isFinite((raw.freshness as { n: number }).n)
              ? Math.round((raw.freshness as { n: number }).n)
              : 0,
        }
      : null;
  return {
    label: CORRELATION_LABEL,
    n,
    headlineTerms,
    contentTypes: asCountRows(raw.contentTypes),
    faqs: asCountRows(raw.faqs),
    freshness: freshness && freshness.summary && freshness.n > 0 ? freshness : null,
    peers: asCountRows(raw.peers),
  };
}

export function suggestedActionFromPayload(payload: unknown): string | null {
  const p = payload as GapPayloadParts | null | undefined;
  if (typeof p?.suggestedAction === "string" && p.suggestedAction.trim()) return p.suggestedAction.trim();
  if (typeof p?.note === "string" && p.note.trim()) return p.note.trim();
  return null;
}
