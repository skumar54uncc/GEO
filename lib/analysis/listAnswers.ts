import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Engine, Runner } from "@/lib/capture/types";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, draws, mentions, personas, prompts, scans, judgeRuns } from "@/lib/db/pg/schema";
import { personaTaxonomyLabel } from "@/lib/ui/labels";

export type AnswerListItem = {
  drawId: string;
  promptId: string;
  promptText: string;
  scanId: string;
  scanCreatedAt: string;
  capturedAt: string;
  engine: Engine;
  runner: Runner;
  fidelity: string;
  branded: boolean;
  mentionedBrand: boolean;
  status: string;
  personaKey: string | null;
  personaLabel: string | null;
  drawIndex: number;
};

export async function listCampaignAnswers(
  db: Db,
  opts: { orgId: string; campaignId: string; scanId?: string; limit?: number },
): Promise<{ answers: AnswerListItem[]; scanId: string | null }> {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, opts.campaignId), eq(campaigns.orgId, opts.orgId)));
  if (!campaign) return { answers: [], scanId: null };

  let scanId = opts.scanId ?? null;
  if (!scanId) {
    const [latest] = await db
      .select({ id: scans.id })
      .from(scans)
      .where(and(eq(scans.campaignId, opts.campaignId), inArray(scans.status, ["complete", "partial", "running"]), eq(scans.kind, "scan")))
      .orderBy(desc(scans.createdAt))
      .limit(1);
    scanId = latest?.id ?? null;
  }
  if (!scanId) return { answers: [], scanId: null };

  const rows = await db
    .select({
      draw: draws,
      promptText: prompts.text,
      branded: prompts.branded,
      scanCreatedAt: scans.createdAt,
      personaKey: personas.key,
      personaName: personas.name,
    })
    .from(draws)
    .innerJoin(scans, eq(scans.id, draws.scanId))
    .innerJoin(prompts, eq(prompts.id, draws.promptId))
    .leftJoin(personas, eq(personas.id, prompts.personaId))
    .where(and(eq(draws.scanId, scanId), eq(draws.status, "ok")))
    .orderBy(asc(prompts.text), asc(draws.engine), asc(draws.drawIndex))
    .limit(opts.limit ?? 2000);

  const out: AnswerListItem[] = [];
  for (const row of rows) {
    const [judge] = await db
      .select({ id: judgeRuns.id })
      .from(judgeRuns)
      .where(eq(judgeRuns.drawId, row.draw.id))
      .orderBy(desc(judgeRuns.seq))
      .limit(1);
    let mentionedBrand = false;
    if (judge) {
      const m = await db
        .select({ id: mentions.id })
        .from(mentions)
        .where(and(eq(mentions.judgeRunId, judge.id), eq(mentions.entityType, "brand")))
        .limit(1);
      mentionedBrand = m.length > 0;
    }
    out.push({
      drawId: row.draw.id,
      promptId: row.draw.promptId,
      promptText: row.promptText,
      scanId,
      scanCreatedAt: row.scanCreatedAt.toISOString(),
      capturedAt: row.draw.capturedAt?.toISOString() ?? row.scanCreatedAt.toISOString(),
      engine: row.draw.engine,
      runner: row.draw.runner,
      fidelity: row.draw.fidelity,
      branded: row.branded,
      mentionedBrand,
      status: row.draw.status,
      personaKey: row.personaKey,
      personaLabel: personaTaxonomyLabel(row.personaKey, row.personaName),
      drawIndex: row.draw.drawIndex,
    });
  }
  return { answers: out, scanId };
}
