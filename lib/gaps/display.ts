/**
 * Leadership-friendly labels for gap cards. No raw enum keys in user-facing strings.
 */

export type GapPayloadParts = {
  format?: string;
  headlineTerms?: string[];
  note?: string;
  suggestedAction?: string;
  sharedAmongCitedPages?: string;
  /** Count of cited pages that share the trait (when present). */
  sharedAmongCitedPagesN?: number;
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

export function suggestedActionFromPayload(payload: unknown): string | null {
  const p = payload as GapPayloadParts | null | undefined;
  if (typeof p?.suggestedAction === "string" && p.suggestedAction.trim()) return p.suggestedAction.trim();
  if (typeof p?.note === "string" && p.note.trim()) return p.note.trim();
  return null;
}
