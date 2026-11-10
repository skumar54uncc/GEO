import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { canonicalizeCitationUrl } from "@/lib/citations/canonical";
import { citedPageFreshnessLabel } from "@/lib/citations/pageDisplay";
import type { Db } from "@/lib/db/pg/client";
import {
  brandAliases,
  brands,
  campaigns,
  citations,
  citedPages,
  claims,
  draws,
  fanoutQueries,
  judgeRuns,
  mentions,
  prompts,
  recommendations,
  scans,
} from "@/lib/db/pg/schema";
import { filterGapTermsForHighlight } from "@/lib/gaps/selectTerms";
import { highlightGapTermsHtml } from "./highlightTerms";

export class AnswerNotFoundError extends Error {}

export type SafeSpan = {
  startUtf16: number;
  endUtf16: number;
  startCodePoint: number;
  endCodePoint: number;
  startUtf8Byte: number;
  endUtf8Byte: number;
  text: string;
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export type AnswerHighlightSpan = {
  /** Raw UTF-16 offsets into the answer text. Null/invalid offsets are skipped (never throw). */
  start: number | null;
  end: number | null;
  kind: "brand" | "competitor" | "citation";
  label: string;
};

const HIGHLIGHT_KIND_PRIORITY: Record<AnswerHighlightSpan["kind"], number> = {
  brand: 3,
  citation: 2,
  competitor: 1,
};

const HIGHLIGHT_TAG_PREFIX: Record<AnswerHighlightSpan["kind"], string> = {
  brand: "us",
  citation: "cite",
  competitor: "peer",
};

export type HighlightAnswerResult = {
  /** Safe HTML for Answer Explorer. Only this string may be passed to dangerouslySetInnerHTML. */
  html: string;
  /** Spans skipped for null/out-of-range/invalid offsets or empty labels (never throws). */
  skipped: number;
};

/**
 * Apply highlight spans on **raw** UTF-16 offsets, then escape each segment.
 * Offsets are never computed against escaped text. Overlaps pick one winner
 * (brand > citation > competitor); adjacent marks are siblings, never nested.
 */
export function highlightAnswerHtml(text: string, spans: AnswerHighlightSpan[]): HighlightAnswerResult {
  let skipped = 0;
  const valid: Array<AnswerHighlightSpan & { start: number; end: number }> = [];
  for (const span of spans) {
    const resolved = safeSpan(text, span.start, span.end);
    if (!span.label.trim() || resolved === null) {
      skipped += 1;
      continue;
    }
    valid.push({ ...span, start: resolved.startUtf16, end: resolved.endUtf16 });
  }
  valid.sort((a, b) => a.start - b.start || a.end - b.end);

  const boundaries = new Set<number>([0, text.length]);
  for (const span of valid) {
    boundaries.add(span.start);
    boundaries.add(span.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);

  const parts: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!;
    const end = points[i + 1]!;
    if (end <= start) continue;

    const slice = text.slice(start, end);
    const covering = valid.filter((span) => span.start <= start && span.end >= end);
    let winner: (typeof valid)[number] | null = null;
    for (const span of covering) {
      if (!winner || HIGHLIGHT_KIND_PRIORITY[span.kind] > HIGHLIGHT_KIND_PRIORITY[winner.kind]) {
        winner = span;
      }
    }

    const escaped = escapeHtml(slice);
    if (!winner) {
      parts.push(escaped);
      continue;
    }
    const tag = escapeHtml(HIGHLIGHT_TAG_PREFIX[winner.kind]);
    const label = escapeHtml(winner.label);
    parts.push(
      `<mark class="mention-${winner.kind}" data-label="${label}"><span class="answer-hl-tag">${tag}</span>${escaped}</mark>`,
    );
  }
  return { html: parts.join(""), skipped };
}

function isUtf16Boundary(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return true;
  const previous = text.charCodeAt(index - 1);
  const current = text.charCodeAt(index);
  return !(previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff);
}

/** Converts stored JS/UTF-16 offsets into all offsets clients commonly need. Invalid spans are omitted. */
export function safeSpan(text: string, start: number | null, end: number | null): SafeSpan | null {
  if (
    start === null ||
    end === null ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > text.length ||
    !isUtf16Boundary(text, start) ||
    !isUtf16Boundary(text, end)
  ) {
    return null;
  }
  return {
    startUtf16: start,
    endUtf16: end,
    startCodePoint: Array.from(text.slice(0, start)).length,
    endCodePoint: Array.from(text.slice(0, end)).length,
    startUtf8Byte: Buffer.byteLength(text.slice(0, start), "utf8"),
    endUtf8Byte: Buffer.byteLength(text.slice(0, end), "utf8"),
    text: text.slice(start, end),
  };
}

export async function getAnswerExplorerDraw(db: Db, input: { orgId: string; drawId: string }) {
  const [row] = await db
    .select({ draw: draws, promptText: prompts.text, campaignId: campaigns.id })
    .from(draws)
    .innerJoin(scans, eq(draws.scanId, scans.id))
    .innerJoin(campaigns, and(eq(scans.campaignId, campaigns.id), eq(campaigns.orgId, input.orgId)))
    .innerJoin(prompts, eq(draws.promptId, prompts.id))
    .where(eq(draws.id, input.drawId));
  if (!row) throw new AnswerNotFoundError("Answer not found.");

  const [judge] = await db
    .select()
    .from(judgeRuns)
    .where(and(eq(judgeRuns.drawId, row.draw.id), isNull(judgeRuns.error)))
    .orderBy(desc(judgeRuns.seq))
    .limit(1);

  const [citationRows, fanoutRows, mentionRows, claimRows] = await Promise.all([
    db.select().from(citations).where(eq(citations.drawId, row.draw.id)).orderBy(citations.position, citations.createdAt),
    db.select().from(fanoutQueries).where(eq(fanoutQueries.drawId, row.draw.id)).orderBy(fanoutQueries.createdAt),
    judge ? db.select().from(mentions).where(eq(mentions.judgeRunId, judge.id)).orderBy(mentions.createdAt) : [],
    judge ? db.select().from(claims).where(eq(claims.judgeRunId, judge.id)).orderBy(claims.createdAt) : [],
  ]);
  const text = row.draw.answerText;

  // Pass raw offsets into highlightAnswerHtml (escape happens per segment after slicing).
  const highlightSpans: AnswerHighlightSpan[] = [];
  for (const mention of mentionRows) {
    if (mention.entityType === "brand" || mention.entityType === "competitor") {
      highlightSpans.push({
        start: mention.spanStart,
        end: mention.spanEnd,
        kind: mention.entityType,
        label: mention.aliasMatched ?? (mention.entityType === "brand" ? "us" : "peer"),
      });
    }
  }
  for (const citation of citationRows) {
    highlightSpans.push({
      start: citation.spanStart,
      end: citation.spanEnd,
      kind: "citation",
      label: citation.domain || citation.url,
    });
  }
  const highlighted = highlightAnswerHtml(text, highlightSpans);

  const gapTermRows = await db
    .select({ payload: recommendations.payload })
    .from(recommendations)
    .where(eq(recommendations.campaignId, row.campaignId));
  const rawGapTerms: string[] = [];
  for (const r of gapTermRows) {
    const p = r.payload as { headlineTerms?: unknown; citedPagesShare?: { headlineTerms?: Array<{ term?: string }> } } | null;
    if (Array.isArray(p?.headlineTerms)) {
      for (const t of p.headlineTerms) {
        if (typeof t === "string" && t.trim()) rawGapTerms.push(t.trim());
      }
    }
    const shareTerms = p?.citedPagesShare?.headlineTerms;
    if (Array.isArray(shareTerms)) {
      for (const rowTerm of shareTerms) {
        if (typeof rowTerm?.term === "string" && rowTerm.term.trim()) rawGapTerms.push(rowTerm.term.trim());
      }
    }
  }
  const [campaignBrand] = await db
    .select({ brandId: campaigns.brandId, brandName: brands.name })
    .from(campaigns)
    .leftJoin(brands, eq(brands.id, campaigns.brandId))
    .where(eq(campaigns.id, row.campaignId))
    .limit(1);
  const aliasRows =
    campaignBrand?.brandId != null
      ? await db.select({ alias: brandAliases.alias }).from(brandAliases).where(eq(brandAliases.brandId, campaignBrand.brandId))
      : [];
  // Brand + stopwords out. The ≥2-pages gate applies when selecting terms from pages
  // (`selectGapTermsFromPages`), not when highlighting curated recommendation terms.
  const gapTerms = filterGapTermsForHighlight(
    rawGapTerms,
    campaignBrand?.brandName ?? "",
    aliasRows.map((a) => a.alias),
  );

  const canonKeys = [
    ...new Set(
      citationRows
        .map((c) => c.canonicalUrl || canonicalizeCitationUrl(c.url))
        .filter((u): u is string => Boolean(u)),
    ),
  ];
  const pageRows =
    canonKeys.length > 0
      ? await db.select().from(citedPages).where(inArray(citedPages.canonicalUrl, canonKeys))
      : [];
  const pageByCanon = new Map(pageRows.map((p) => [p.canonicalUrl, p]));

  return {
    draw: {
      id: row.draw.id,
      scanId: row.draw.scanId,
      campaignId: row.campaignId,
      promptId: row.draw.promptId,
      promptText: row.promptText,
      engine: row.draw.engine,
      runner: row.draw.runner,
      fidelity: row.draw.fidelity,
      regionId: row.draw.regionId,
      drawIndex: row.draw.drawIndex,
      status: row.draw.status,
      capturedAt: row.draw.capturedAt.toISOString(),
    },
    answer: {
      format: "plain_text" as const,
      renderAs: "text_only" as const,
      text,
      /** HTML from highlightAnswerHtml only — safe for dangerouslySetInnerHTML. */
      escapedText: highlighted.html,
      highlightSkipped: highlighted.skipped,
      offsetEncoding: "utf16" as const,
      offsetsApplyTo: "text" as const,
    },
    judge: judge
      ? {
          id: judge.id,
          model: judge.judgeModel,
          promptVersion: judge.judgePromptVersion,
          sentiment: judge.sentiment,
          sentimentSpan: safeSpan(text, judge.sentimentSpanStart, judge.sentimentSpanEnd),
        }
      : null,
    mentions: mentionRows.map((mention) => ({
      entityType: mention.entityType,
      entityId: mention.entityId,
      aliasMatched: mention.aliasMatched,
      prominence: mention.prominence,
      listPosition: mention.listPosition,
      span: safeSpan(text, mention.spanStart, mention.spanEnd),
    })),
    claims: claimRows.map((claim) => ({
      id: claim.id,
      text: claim.text,
      factId: claim.factId,
      verdict: claim.verdict,
      span: safeSpan(text, claim.spanStart, claim.spanEnd),
    })),
    citations: citationRows.map((citation) => {
      const canon = citation.canonicalUrl || canonicalizeCitationUrl(citation.url);
      const page = canon ? pageByCanon.get(canon) : undefined;
      const features = (page?.structuredFeatures ?? null) as Record<string, unknown> | null;
      const title = page?.title ?? citation.title;
      const h1 = page?.h1 ?? null;
      const h2s = page?.h2s ?? [];
      return {
        id: citation.id,
        url: citation.url,
        canonicalUrl: citation.canonicalUrl,
        domain: citation.domain,
        position: citation.position,
        linked: citation.linked,
        sourceClass: citation.sourceClass,
        title: citation.title,
        span: safeSpan(text, citation.spanStart, citation.spanEnd),
        page: page
          ? {
              canonicalUrl: page.canonicalUrl,
              fetchStatus: page.fetchStatus,
              contentType: page.contentType,
              publishedAt: page.publishedAt ? page.publishedAt.toISOString() : null,
              updatedAt: page.updatedAt ? page.updatedAt.toISOString() : null,
              freshness: citedPageFreshnessLabel({
                publishedAt: page.publishedAt,
                updatedAt: page.updatedAt,
                fetchedAt: page.fetchedAt,
              }),
              title,
              h1,
              h2s,
              /** Safe HTML for title/H1/H2 — only from highlightGapTermsHtml. */
              titleHtml: title ? highlightGapTermsHtml(title, gapTerms).html : null,
              h1Html: h1 ? highlightGapTermsHtml(h1, gapTerms).html : null,
              h2Htmls: h2s.map((h) => highlightGapTermsHtml(h, gapTerms).html),
              features: features
                ? {
                    listicle: Boolean((features.listicle as { present?: boolean } | undefined)?.present),
                    answerCapsule: Boolean((features.answerCapsule as { present?: boolean } | undefined)?.present),
                    statisticsCount:
                      typeof features.statisticsCount === "number" ? features.statisticsCount : 0,
                    namedQuotes: Array.isArray(features.namedQuotes) ? features.namedQuotes.length : 0,
                  }
                : null,
            }
          : null,
      };
    }),
    gapTerms: [...new Set(gapTerms)],
    fanoutQueries: fanoutRows.map(({ query, source }) => ({ query, source })),
  };
}
