import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getStore } from "@/lib/db";
import { getDb } from "@/lib/db/pg/client";
import { guardedDelete, guardedUpdate, ImmutableViolation, isImmutableDbError } from "@/lib/db/pg/immutable";
import { auditLog, draws, promptSetItems, promptSets, rawPayloads } from "@/lib/db/pg/schema";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { recordAudit } from "@/lib/auth";
import { freezePromptSet } from "@/lib/promptSets";
import { resetDatabase } from "./helpers";

async function seedDraw() {
  const store = getStore();
  const prompt = await store.createPrompt({ text: "Which universities lead grid research?", audience: "grad", subtopics: [] });
  const [resp] = await store.upsertResponses([
    {
      prompt_id: prompt.id,
      surface: "chatgpt",
      run_number: 1,
      raw_text: "Original answer",
      source_type: "manual",
      location_note: "Charlotte NC, incognito",
    },
  ]);
  return { prompt, resp };
}

describe("immutability: application layer", () => {
  beforeEach(resetDatabase);

  it("refuses UPDATE and DELETE on draws, raw_payloads, prompt_set_items, audit_log", async () => {
    const db = getDb();
    for (const table of [draws, rawPayloads, promptSetItems, auditLog]) {
      await expect(guardedUpdate(db, table, {} as never, sql`true`)).rejects.toBeInstanceOf(ImmutableViolation);
      await expect(guardedDelete(db, table, sql`true`)).rejects.toBeInstanceOf(ImmutableViolation);
    }
  });

  it("refuses to update a frozen prompt set", async () => {
    const db = getDb();
    await seedDraw();
    const ctx = await legacyContext(db);
    const { set } = await freezePromptSet(db, ctx.orgId, ctx.campaignId);
    await expect(
      guardedUpdate(db, promptSets, { sha256: "x" }, eq(promptSets.id, set.id)),
    ).rejects.toBeInstanceOf(ImmutableViolation);
  });

  it("never overwrites a stored answer through the store", async () => {
    const { prompt } = await seedDraw();
    const store = getStore();
    await expect(
      store.upsertResponses([
        {
          prompt_id: prompt.id,
          surface: "chatgpt",
          run_number: 1,
          raw_text: "A different answer",
          source_type: "manual",
          location_note: "Charlotte NC, incognito",
        },
      ]),
    ).rejects.toBeInstanceOf(ImmutableViolation);
    const [row] = await store.listResponses({ prompt_id: prompt.id });
    expect(row.raw_text).toBe("Original answer");
  });

  it("treats re-saving identical text as a no-op", async () => {
    const { prompt, resp } = await seedDraw();
    const again = await getStore().upsertResponses([
      {
        prompt_id: prompt.id,
        surface: "chatgpt",
        run_number: 1,
        raw_text: "Original answer",
        source_type: "manual",
        location_note: "Charlotte NC, incognito",
      },
    ]);
    expect(again[0].id).toBe(resp.id);
    expect(await getStore().listResponses()).toHaveLength(1);
  });
});

describe("immutability: database triggers", () => {
  beforeEach(resetDatabase);

  // Drizzle wraps the Postgres error; the trigger's message is on the cause.
  const rejects = async (q: Promise<unknown>) => {
    const err = await q.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err, "query should have been rejected").not.toBeNull();
    expect(isImmutableDbError(err)).toBe(true);
    expect(String((err as { cause?: Error }).cause?.message)).toMatch(/immutable_violation/);
  };

  it("rejects raw SQL UPDATE and DELETE on draws", async () => {
    const db = getDb();
    await seedDraw();
    await rejects(db.execute(sql`UPDATE draws SET answer_text = 'tampered'`));
    await rejects(db.execute(sql`DELETE FROM draws`));
  });

  it("rejects raw SQL UPDATE on raw_payloads and audit_log", async () => {
    const db = getDb();
    await seedDraw();
    await recordAudit(db, { orgId: null, userId: null, action: "test" });
    await rejects(db.execute(sql`UPDATE raw_payloads SET bytes = 0`));
    await rejects(db.execute(sql`UPDATE audit_log SET action = 'x'`));
    await rejects(db.execute(sql`DELETE FROM audit_log`));
  });

  it("rejects changes to a frozen set and to its items, and new items on it", async () => {
    const db = getDb();
    const { prompt } = await seedDraw();
    const ctx = await legacyContext(db);
    const { set } = await freezePromptSet(db, ctx.orgId, ctx.campaignId);
    await rejects(db.execute(sql`UPDATE prompt_sets SET sha256 = 'x' WHERE id = ${set.id}`));
    await rejects(db.execute(sql`DELETE FROM prompt_sets WHERE id = ${set.id}`));
    await rejects(db.execute(sql`UPDATE prompt_set_items SET prompt_text_snapshot = 'x'`));
    await rejects(
      db.execute(
        sql`INSERT INTO prompt_set_items (prompt_set_id, prompt_id, prompt_text_snapshot)
            SELECT ${set.id}, id, 'late' FROM prompts WHERE seq = ${prompt.id}`,
      ),
    );
  });

  it("allows updates to an unfrozen set", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    const [set] = await db.insert(promptSets).values({ campaignId: ctx.campaignId, version: 99 }).returning();
    await db.execute(sql`UPDATE prompt_sets SET sha256 = 'draft' WHERE id = ${set.id}`);
    const [row] = await db.select().from(promptSets).where(eq(promptSets.id, set.id));
    expect(row.sha256).toBe("draft");
  });
});
