import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import {
  campaigns,
  citations,
  claims,
  draws,
  fanoutQueries,
  judgeRuns,
  mentions,
  prompts,
  scans,
} from "@/lib/db/pg/schema";

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
      escapedText: escapeHtml(text),
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
    citations: citationRows.map((citation) => ({
      id: citation.id,
      url: citation.url,
      canonicalUrl: citation.canonicalUrl,
      domain: citation.domain,
      position: citation.position,
      linked: citation.linked,
      sourceClass: citation.sourceClass,
      title: citation.title,
      span: safeSpan(text, citation.spanStart, citation.spanEnd),
    })),
    fanoutQueries: fanoutRows.map(({ query, source }) => ({ query, source })),
  };
}
