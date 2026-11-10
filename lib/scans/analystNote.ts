import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { checkBudget } from "@/lib/cost/guard";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, scans } from "@/lib/db/pg/schema";
import { contentModel, fireworksChat, judgeModel, WriterModelConfigError } from "@/lib/fireworks";

export const ANALYST_NOTE_PROVIDER = "analyst_note_writer";

export const analystNoteBody = z.object({
  text: z.string().trim().min(1).max(4000),
  /** publish requires editor edit; draft is AI or WIP. */
  status: z.enum(["draft", "published"]),
});

export class AnalystNoteError extends Error {}

function sentenceCount(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

/** Editor-written notes must be 3–5 sentences when published. */
export function assertPublishedLength(text: string): void {
  const n = sentenceCount(text);
  if (n < 3 || n > 5) {
    throw new AnalystNoteError(`Published analyst notes must be 3 to 5 sentences (found ${n}).`);
  }
}

export async function setAnalystNote(
  db: Db,
  opts: {
    orgId: string;
    scanId: string;
    authorId: string;
    text: string;
    status: "draft" | "published";
  },
) {
  const [scan] = await db
    .select({ id: scans.id, campaignId: scans.campaignId })
    .from(scans)
    .where(eq(scans.id, opts.scanId));
  if (!scan) throw new AnalystNoteError("Scan not found.");
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, scan.campaignId), eq(campaigns.orgId, opts.orgId)));
  if (!campaign) throw new AnalystNoteError("Scan not found.");

  if (opts.status === "published") assertPublishedLength(opts.text);

  const [updated] = await db
    .update(scans)
    .set({
      analystNote: opts.text,
      analystNoteStatus: opts.status,
      analystNoteAuthorId: opts.authorId,
      analystNoteAt: new Date(),
    })
    .where(eq(scans.id, opts.scanId))
    .returning();
  return updated;
}

/**
 * Optional AI draft. Labeled draft until an editor edits and publishes.
 * Writer model must differ from the judge model; goes through the cost guard.
 */
export async function draftAnalystNoteAi(
  db: Db,
  opts: {
    orgId: string;
    scanId: string;
    authorId: string;
    headline: string;
    chat?: typeof fireworksChat;
  },
) {
  const writer = contentModel();
  if (writer === judgeModel()) {
    throw new WriterModelConfigError("CONTENT_MODEL must differ from JUDGE_MODEL.");
  }
  const budget = await checkBudget(db, opts.orgId, ANALYST_NOTE_PROVIDER, {
    units: 1,
    uncachedUnits: 1,
    usd: null,
  });
  if (!budget.allowed) {
    throw new AnalystNoteError(budget.reason ?? "Cost guard refused analyst note draft.");
  }

  const chat = opts.chat ?? fireworksChat;
  const res = await chat({
    model: writer,
    system:
      "Write a 3 to 5 sentence analyst note for university leadership about AI search visibility. No invented metrics. Return JSON {\"text\":\"...\"}.",
    user: `Context headline (do not invent numbers beyond this): ${opts.headline}`,
    temperature: 0.3,
    json: true,
  });
  if (!res.ok) throw new AnalystNoteError(res.error ?? "Analyst note draft failed.");
  let text = "";
  try {
    const parsed = JSON.parse(res.text) as { text?: string };
    text = (parsed.text ?? "").trim();
  } catch {
    throw new AnalystNoteError("Analyst note draft returned non-JSON.");
  }
  if (!text) throw new AnalystNoteError("Analyst note draft was empty.");
  return setAnalystNote(db, {
    orgId: opts.orgId,
    scanId: opts.scanId,
    authorId: opts.authorId,
    text,
    status: "draft",
  });
}
