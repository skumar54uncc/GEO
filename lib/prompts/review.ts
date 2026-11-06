import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, personas, prompts } from "@/lib/db/pg/schema";
import { NEAR_DUPLICATE_QIDS } from "@/lib/contentTeam/personas";

export class PromptNotFoundError extends Error {}
export class PromptValidationError extends Error {}

const statusEnum = z.enum(["draft", "approved", "rejected"]);

export const promptPatch = z.object({
  text: z.string().trim().min(1).max(8000).optional(),
  status: statusEnum.optional(),
  note: z.string().max(4000).nullable().optional(),
});

export const bulkBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  status: statusEnum,
});

export type PromptListFilters = {
  orgId: string;
  campaignId: string;
  pillar?: string;
  personaKey?: string | "neutral";
  region?: string;
  branded?: boolean;
  status?: "draft" | "approved" | "rejected";
  q?: string;
};

export type PromptRow = {
  id: string;
  text: string;
  status: string;
  branded: boolean;
  note: string | null;
  external_id: string | null;
  persona_mode: string | null;
  persona_id: string | null;
  persona_key: string | null;
  persona_name: string | null;
  doc_personas: string[];
  suggested_personas: string[];
  tags: string[];
  question_id: string | null;
  pillar: string | null;
  region: string | null;
  near_duplicate: boolean;
  updated_at: string;
};

function tagValue(tags: string[], prefix: string): string | null {
  const hit = tags.find((t) => t.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function campaignOwned(db: Db, orgId: string, campaignId: string) {
  const [c] = await db
    .select({ id: campaigns.id, settings: campaigns.settings })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)));
  if (!c) throw new PromptNotFoundError("Campaign not found");
  if ((c.settings as { legacy?: boolean })?.legacy) throw new PromptValidationError("Legacy campaign prompts are not editable here");
  return c;
}

export async function listPromptsForReview(db: Db, filters: PromptListFilters): Promise<PromptRow[]> {
  await campaignOwned(db, filters.orgId, filters.campaignId);
  const conds = [eq(prompts.campaignId, filters.campaignId)];
  if (filters.status) conds.push(eq(prompts.status, filters.status));
  if (filters.branded === true) conds.push(eq(prompts.branded, true));
  if (filters.branded === false) conds.push(eq(prompts.branded, false));
  if (filters.personaKey === "neutral") conds.push(isNull(prompts.personaId));
  if (filters.pillar) {
    const tag = `pillar:${filters.pillar}`;
    conds.push(sql`${tag} = any(${prompts.tags})`);
  }
  if (filters.region) {
    const tag = `region:${filters.region}`;
    conds.push(sql`${tag} = any(${prompts.tags})`);
  }
  if (filters.q) {
    const q = `%${filters.q.replace(/[%_]/g, "")}%`;
    conds.push(sql`${prompts.text} ilike ${q}`);
  }

  let rows = await db
    .select({
      id: prompts.id,
      text: prompts.text,
      status: prompts.status,
      branded: prompts.branded,
      note: prompts.note,
      externalId: prompts.externalId,
      personaMode: prompts.personaMode,
      personaId: prompts.personaId,
      docPersonas: prompts.docPersonas,
      suggestedPersonas: prompts.suggestedPersonas,
      tags: prompts.tags,
      updatedAt: prompts.updatedAt,
      personaKey: personas.key,
      personaName: personas.name,
    })
    .from(prompts)
    .leftJoin(personas, eq(personas.id, prompts.personaId))
    .where(and(...conds))
    .orderBy(asc(prompts.seq));

  if (filters.personaKey && filters.personaKey !== "neutral") {
    rows = rows.filter((r) => r.personaKey === filters.personaKey);
  }

  return rows.map((r) => {
    const qid = tagValue(r.tags, "qid:");
    return {
      id: r.id,
      text: r.text,
      status: r.status,
      branded: r.branded,
      note: r.note,
      external_id: r.externalId,
      persona_mode: r.personaMode,
      persona_id: r.personaId,
      persona_key: r.personaKey,
      persona_name: r.personaName,
      doc_personas: r.docPersonas,
      suggested_personas: r.suggestedPersonas,
      tags: r.tags,
      question_id: qid,
      pillar: tagValue(r.tags, "pillar:"),
      region: tagValue(r.tags, "region:"),
      near_duplicate: qid ? NEAR_DUPLICATE_QIDS.has(qid) : false,
      updated_at: r.updatedAt.toISOString(),
    };
  });
}

export async function patchPrompt(
  db: Db,
  orgId: string,
  promptId: string,
  patch: z.infer<typeof promptPatch>,
): Promise<PromptRow> {
  const [row] = await db
    .select({ id: prompts.id, campaignId: prompts.campaignId })
    .from(prompts)
    .where(eq(prompts.id, promptId));
  if (!row) throw new PromptNotFoundError("Prompt not found");
  await campaignOwned(db, orgId, row.campaignId);
  const data: Partial<typeof prompts.$inferInsert> = { updatedAt: new Date() };
  if (patch.text !== undefined) data.text = patch.text;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.note !== undefined) data.note = patch.note;
  await db.update(prompts).set(data).where(eq(prompts.id, promptId));
  const list = await listPromptsForReview(db, { orgId, campaignId: row.campaignId });
  const found = list.find((p) => p.id === promptId);
  if (!found) throw new PromptNotFoundError("Prompt not found after update");
  return found;
}

export async function bulkSetStatus(
  db: Db,
  orgId: string,
  campaignId: string,
  ids: string[],
  status: "draft" | "approved" | "rejected",
): Promise<number> {
  await campaignOwned(db, orgId, campaignId);
  const owned = await db
    .select({ id: prompts.id })
    .from(prompts)
    .where(and(eq(prompts.campaignId, campaignId), inArray(prompts.id, ids)));
  if (!owned.length) return 0;
  await db
    .update(prompts)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(prompts.campaignId, campaignId),
        inArray(
          prompts.id,
          owned.map((o) => o.id),
        ),
      ),
    );
  return owned.length;
}

/** Counts used by the review header. */
export async function promptCounts(db: Db, campaignId: string) {
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(prompts).where(eq(prompts.campaignId, campaignId));
  const [{ approved }] = await db
    .select({ approved: sql<number>`count(*)::int` })
    .from(prompts)
    .where(and(eq(prompts.campaignId, campaignId), eq(prompts.status, "approved")));
  const [{ neutrals }] = await db
    .select({ neutrals: sql<number>`count(*)::int` })
    .from(prompts)
    .where(and(eq(prompts.campaignId, campaignId), isNull(prompts.personaId)));
  const [{ variants }] = await db
    .select({ variants: sql<number>`count(*)::int` })
    .from(prompts)
    .where(and(eq(prompts.campaignId, campaignId), isNotNull(prompts.personaId)));
  return { total: Number(total), approved: Number(approved), neutrals: Number(neutrals), variants: Number(variants) };
}
