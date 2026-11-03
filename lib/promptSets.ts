import crypto from "crypto";
import { and, asc, desc, eq, inArray, isNotNull, max } from "drizzle-orm";
import type { Db } from "./db/pg/client";
import { guardedUpdate } from "./db/pg/immutable";
import { campaigns, prompts, promptSetItems, promptSets, scans } from "./db/pg/schema";

/** sha256 over the JSON array of prompt texts sorted by code point. Order of approval does not matter. */
export function promptSetHash(texts: string[]): string {
  const sorted = [...texts].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return crypto.createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

export class IncomparableScansError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncomparableScansError";
  }
}

export type FreezeResult = {
  set: typeof promptSets.$inferSelect;
  created: boolean;
  itemCount: number;
};

/**
 * Snapshots every approved prompt of the campaign into a new frozen version. If the approved
 * prompts are identical to the latest frozen version, that version is returned unchanged.
 */
export async function freezePromptSet(db: Db, orgId: string, campaignId: string): Promise<FreezeResult> {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)));
  if (!campaign) throw new Error("Campaign not found.");

  const approved = await db
    .select({ id: prompts.id, text: prompts.text })
    .from(prompts)
    .where(and(eq(prompts.campaignId, campaignId), eq(prompts.status, "approved")))
    .orderBy(asc(prompts.seq));
  if (!approved.length) throw new Error("No approved prompts to freeze.");
  const hash = promptSetHash(approved.map((p) => p.text));

  const [latest] = await db
    .select()
    .from(promptSets)
    .where(and(eq(promptSets.campaignId, campaignId), isNotNull(promptSets.frozenAt)))
    .orderBy(desc(promptSets.version))
    .limit(1);
  if (latest && latest.sha256 === hash) return { set: latest, created: false, itemCount: approved.length };

  const set = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [{ v }] = await tx
      .select({ v: max(promptSets.version) })
      .from(promptSets)
      .where(eq(promptSets.campaignId, campaignId));
    const [created] = await tx
      .insert(promptSets)
      .values({ campaignId, version: (v ?? 0) + 1 })
      .returning();
    await tx
      .insert(promptSetItems)
      .values(approved.map((p) => ({ promptSetId: created.id, promptId: p.id, promptTextSnapshot: p.text })));
    await guardedUpdate(tx, promptSets, { sha256: hash, frozenAt: new Date() }, eq(promptSets.id, created.id));
    const [frozen] = await tx.select().from(promptSets).where(eq(promptSets.id, created.id));
    return frozen;
  });
  return { set, created: true, itemCount: approved.length };
}

export async function listPromptSets(db: Db, campaignId: string) {
  return db
    .select()
    .from(promptSets)
    .where(eq(promptSets.campaignId, campaignId))
    .orderBy(desc(promptSets.version));
}

/** Scores on different prompt set versions are different series and must never be compared. */
export function assertComparable(
  a: { promptSetId: string | null },
  b: { promptSetId: string | null },
): void {
  if (!a.promptSetId || !b.promptSetId) {
    throw new IncomparableScansError("Both scans must be tied to a frozen prompt set.");
  }
  if (a.promptSetId !== b.promptSetId) {
    throw new IncomparableScansError("Scans use different prompt set versions and cannot be compared.");
  }
}

export async function assertScansComparable(db: Db, scanA: string, scanB: string): Promise<void> {
  const rows = await db
    .select({ id: scans.id, promptSetId: scans.promptSetId })
    .from(scans)
    .where(inArray(scans.id, [scanA, scanB]));
  const a = rows.find((r) => r.id === scanA);
  const b = rows.find((r) => r.id === scanB);
  if (!a || !b) throw new IncomparableScansError("Scan not found.");
  assertComparable(a, b);
}
