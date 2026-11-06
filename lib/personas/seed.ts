import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { personas } from "@/lib/db/pg/schema";
import { ensureContentTeamPersonas } from "@/lib/contentTeam/seed";
import { assertPersonaLibraryComplete, CONTENT_TEAM_PERSONA_KEYS, PERSONA_LIBRARY } from "./library";

export type PersonaSeedRow = {
  key: string;
  id: string;
  created: boolean;
  canonicalKey: string | null;
  selectable: boolean;
};

/**
 * Seeds the 12 selectable library personas. Never replaces or deletes the five
 * content-team rows; upserts new keys only.
 */
export async function ensureCanonicalPersonas(db: Db): Promise<PersonaSeedRow[]> {
  assertPersonaLibraryComplete();

  // Preserve existing UUIDs for the five content-team keys.
  const contentTeam = await ensureContentTeamPersonas(db);
  const contentIds = new Map(contentTeam.map((row) => [row.key, row.id]));

  const out: PersonaSeedRow[] = [];

  for (const def of PERSONA_LIBRARY) {
    if (def.contentTeamKey) {
      const id = contentIds.get(def.contentTeamKey);
      if (!id) throw new Error(`Content-team persona ${def.contentTeamKey} missing after seed`);
      await db
        .update(personas)
        .set({
          background: def.background,
          vocabulary: def.vocabulary,
          region: def.region,
          typicalQuestions: def.typicalQuestions,
          notes: def.notes,
          // Keep content-team name/goal/draft_prefix; only enrich Phase 4 fields.
        })
        .where(eq(personas.id, id));
      out.push({
        key: def.dbKey,
        id,
        created: false,
        canonicalKey: def.canonicalKey,
        selectable: true,
      });
      continue;
    }

    const [existing] = await db.select({ id: personas.id }).from(personas).where(eq(personas.key, def.dbKey));
    if (existing) {
      await db
        .update(personas)
        .set({
          name: def.name,
          goal: def.goal,
          background: def.background,
          vocabulary: def.vocabulary,
          region: def.region,
          typicalQuestions: def.typicalQuestions,
          notes: def.notes,
          orgId: null,
        })
        .where(eq(personas.id, existing.id));
      out.push({
        key: def.dbKey,
        id: existing.id,
        created: false,
        canonicalKey: def.canonicalKey,
        selectable: true,
      });
      continue;
    }

    const [created] = await db
      .insert(personas)
      .values({
        orgId: null,
        key: def.dbKey,
        name: def.name,
        goal: def.goal,
        background: def.background,
        vocabulary: def.vocabulary,
        region: def.region,
        typicalQuestions: def.typicalQuestions,
        notes: def.notes,
      })
      .returning({ id: personas.id });
    out.push({
      key: def.dbKey,
      id: created.id,
      created: true,
      canonicalKey: def.canonicalKey,
      selectable: true,
    });
  }

  return out;
}

export async function listLibraryPersonaIdsByKey(db: Db): Promise<Map<string, string>> {
  const keys = [...CONTENT_TEAM_PERSONA_KEYS, ...PERSONA_LIBRARY.map((p) => p.dbKey)];
  const unique = [...new Set(keys)];
  const rows = await db
    .select({ id: personas.id, key: personas.key })
    .from(personas)
    .where(inArray(personas.key, unique));
  return new Map(rows.filter((r): r is { id: string; key: string } => Boolean(r.key)).map((r) => [r.key!, r.id]));
}
