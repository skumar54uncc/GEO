import crypto from "crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, max } from "drizzle-orm";
import type { Db } from "./db/pg/client";
import { guardedUpdate } from "./db/pg/immutable";
import { campaigns, organizations, prompts, promptSetItems, promptSets, scans } from "./db/pg/schema";
import { brandedShare, MIN_UNBRANDED_SHARE, type BrandedShare } from "./prompts/branded";

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

export type FreezeFilter = "all" | "core" | "persona";

export type FreezeResult = {
  set: typeof promptSets.$inferSelect;
  created: boolean;
  itemCount: number;
  filter: FreezeFilter;
  label: string | null;
  brandedShare: BrandedShare;
  unbrandedOverrideReason: string | null;
};

export type FreezeOpts = {
  /** all = every approved prompt (legacy). core = neutrals only. persona = variants only. */
  filter?: FreezeFilter;
  /** Stable label such as AI-core-v1. Required when filter is core or persona. */
  label?: string | null;
  /**
   * Required when approved unbranded share is below MIN_UNBRANDED_SHARE (default 70%).
   * Audit-logged by the freeze route.
   */
  unbrandedOverrideReason?: string | null;
};

export class FreezeFixtureError extends Error {
  constructor(message = "Fixture — cannot be frozen") {
    super(message);
    this.name = "FreezeFixtureError";
  }
}

export class FreezeUnbrandedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FreezeUnbrandedError";
  }
}

/**
 * Snapshots approved prompts into a frozen version.
 * When `label` is set, re-freezing the same filter with an identical hash returns the existing labeled set.
 * Rejects provenance=fixture outside the demo org. Enforces ≥70% unbranded unless overridden with a reason.
 */
export async function freezePromptSet(db: Db, orgId: string, campaignId: string, opts: FreezeOpts = {}): Promise<FreezeResult> {
  const filter: FreezeFilter = opts.filter ?? "all";
  const label = opts.label ?? null;
  const override = opts.unbrandedOverrideReason?.trim() || null;
  if ((filter === "core" || filter === "persona") && !label) {
    throw new Error("A label is required when freezing a core or persona set.");
  }

  const [campaign] = await db
    .select({ id: campaigns.id, settings: campaigns.settings, name: campaigns.name })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)));
  if (!campaign) throw new Error("Campaign not found.");

  const [org] = await db
    .select({ isDemo: organizations.isDemo })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!org) throw new Error("Campaign not found.");

  const conds = [eq(prompts.campaignId, campaignId), eq(prompts.status, "approved")];
  if (filter === "core") conds.push(isNull(prompts.personaId));
  if (filter === "persona") conds.push(isNotNull(prompts.personaId));

  const approved = await db
    .select({
      id: prompts.id,
      text: prompts.text,
      personaId: prompts.personaId,
      provenance: prompts.provenance,
      branded: prompts.branded,
    })
    .from(prompts)
    .where(and(...conds))
    .orderBy(asc(prompts.seq));
  if (!approved.length) throw new Error("No approved prompts to freeze.");

  if (approved.some((p) => p.provenance === "fixture") && !org.isDemo) {
    throw new FreezeFixtureError("Fixture — cannot be frozen");
  }

  if (filter === "core" && approved.some((p) => p.personaId)) {
    throw new Error("Core freeze included a persona variant; refusing.");
  }
  if (filter === "persona" && approved.some((p) => !p.personaId)) {
    throw new Error("Persona freeze included a neutral prompt; refusing.");
  }

  const share = brandedShare(approved);
  if (share.unbrandedShare < MIN_UNBRANDED_SHARE && !override) {
    throw new FreezeUnbrandedError(
      `Unbranded share is ${(share.unbrandedShare * 100).toFixed(0)}% (below the ${(MIN_UNBRANDED_SHARE * 100).toFixed(0)}% default). Provide an override reason to freeze.`,
    );
  }

  const hash = promptSetHash(approved.map((p) => p.text));

  if (label) {
    const [byLabel] = await db
      .select()
      .from(promptSets)
      .where(and(eq(promptSets.campaignId, campaignId), eq(promptSets.label, label), isNotNull(promptSets.frozenAt)))
      .limit(1);
    if (byLabel && byLabel.sha256 === hash) {
      return {
        set: byLabel,
        created: false,
        itemCount: approved.length,
        filter,
        label,
        brandedShare: share,
        unbrandedOverrideReason: override,
      };
    }
  } else {
    const [latest] = await db
      .select()
      .from(promptSets)
      .where(and(eq(promptSets.campaignId, campaignId), isNotNull(promptSets.frozenAt), isNull(promptSets.label)))
      .orderBy(desc(promptSets.version))
      .limit(1);
    if (latest && latest.sha256 === hash) {
      return {
        set: latest,
        created: false,
        itemCount: approved.length,
        filter,
        label: null,
        brandedShare: share,
        unbrandedOverrideReason: override,
      };
    }
  }

  const set = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [{ v }] = await tx
      .select({ v: max(promptSets.version) })
      .from(promptSets)
      .where(eq(promptSets.campaignId, campaignId));
    const [created] = await tx
      .insert(promptSets)
      .values({ campaignId, version: (v ?? 0) + 1, label })
      .returning();
    await tx
      .insert(promptSetItems)
      .values(approved.map((p) => ({ promptSetId: created.id, promptId: p.id, promptTextSnapshot: p.text })));
    await guardedUpdate(tx, promptSets, { sha256: hash, frozenAt: new Date() }, eq(promptSets.id, created.id));
    const [frozen] = await tx.select().from(promptSets).where(eq(promptSets.id, created.id));
    return frozen;
  });
  return {
    set,
    created: true,
    itemCount: approved.length,
    filter,
    label,
    brandedShare: share,
    unbrandedOverrideReason: override,
  };
}

export async function listPromptSets(db: Db, campaignId: string) {
  return db.select().from(promptSets).where(eq(promptSets.campaignId, campaignId)).orderBy(desc(promptSets.version));
}

/** Scores on different prompt set versions are different series and must never be compared. */
export function assertComparable(a: { promptSetId: string | null }, b: { promptSetId: string | null }): void {
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
