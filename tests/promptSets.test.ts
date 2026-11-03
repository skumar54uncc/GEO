import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getStore } from "@/lib/db";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { promptSetItems, scans } from "@/lib/db/pg/schema";
import {
  assertComparable,
  assertScansComparable,
  freezePromptSet,
  IncomparableScansError,
  promptSetHash,
} from "@/lib/promptSets";
import { resetDatabase } from "./helpers";

describe("prompt set hash", () => {
  it("does not depend on order", () => {
    expect(promptSetHash(["b", "a", "c"])).toBe(promptSetHash(["c", "b", "a"]));
  });
  it("changes when any text changes", () => {
    expect(promptSetHash(["a", "b"])).not.toBe(promptSetHash(["a", "b "]));
  });
  it("does not collide when texts contain the joiner", () => {
    expect(promptSetHash(["a\nb"])).not.toBe(promptSetHash(["a", "b"]));
  });
});

describe("freezing", () => {
  beforeEach(resetDatabase);

  it("same approved prompts give the same version and hash; an edit gives a new version", async () => {
    const db = getDb();
    const store = getStore();
    const ctx = await legacyContext(db);
    const p1 = await store.createPrompt({ text: "Best grid research universities in the Southeast?", audience: "grad", subtopics: [] });
    await store.createPrompt({ text: "Who trains utility engineers in the Carolinas?", audience: "industry", subtopics: [] });

    const first = await freezePromptSet(db, ctx.orgId, ctx.campaignId);
    expect(first.created).toBe(true);
    expect(first.set.version).toBe(1);
    expect(first.itemCount).toBe(2);

    const again = await freezePromptSet(db, ctx.orgId, ctx.campaignId);
    expect(again.created).toBe(false);
    expect(again.set.id).toBe(first.set.id);
    expect(again.set.sha256).toBe(first.set.sha256);

    await store.updatePrompt(p1.id, { text: "Best grid research universities in the Southeast US?" });
    const second = await freezePromptSet(db, ctx.orgId, ctx.campaignId);
    expect(second.created).toBe(true);
    expect(second.set.version).toBe(2);
    expect(second.set.sha256).not.toBe(first.set.sha256);

    const v1Items = await db.select().from(promptSetItems).where(eq(promptSetItems.promptSetId, first.set.id));
    expect(v1Items.map((i) => i.promptTextSnapshot)).toContain("Best grid research universities in the Southeast?");
  });

  it("only freezes approved prompts", async () => {
    const db = getDb();
    const store = getStore();
    const ctx = await legacyContext(db);
    await store.createPrompt({ text: "approved one", audience: "grad", subtopics: [] });
    const p2 = await store.createPrompt({ text: "draft one", audience: "grad", subtopics: [] });
    await store.updatePrompt(p2.id, { active: 0 });
    const res = await freezePromptSet(db, ctx.orgId, ctx.campaignId);
    expect(res.itemCount).toBe(1);
  });

  it("refuses an empty set", async () => {
    const db = getDb();
    const ctx = await legacyContext(db);
    await expect(freezePromptSet(db, ctx.orgId, ctx.campaignId)).rejects.toThrow(/No approved prompts/);
  });

  it("refuses to compare scans on different versions", async () => {
    const db = getDb();
    const store = getStore();
    const ctx = await legacyContext(db);
    const p = await store.createPrompt({ text: "q1", audience: "grad", subtopics: [] });
    const v1 = await freezePromptSet(db, ctx.orgId, ctx.campaignId);
    await store.updatePrompt(p.id, { text: "q1 edited" });
    const v2 = await freezePromptSet(db, ctx.orgId, ctx.campaignId);
    const [a] = await db.insert(scans).values({ campaignId: ctx.campaignId, promptSetId: v1.set.id, status: "complete" }).returning();
    const [b] = await db.insert(scans).values({ campaignId: ctx.campaignId, promptSetId: v2.set.id, status: "complete" }).returning();
    const [c] = await db.insert(scans).values({ campaignId: ctx.campaignId, promptSetId: v1.set.id, status: "complete" }).returning();
    await expect(assertScansComparable(db, a.id, b.id)).rejects.toBeInstanceOf(IncomparableScansError);
    await expect(assertScansComparable(db, a.id, c.id)).resolves.toBeUndefined();
    expect(() => assertComparable({ promptSetId: null }, { promptSetId: null })).toThrow(IncomparableScansError);
  });
});
