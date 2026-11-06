import { and, eq } from "drizzle-orm";
import type { RecommendationCard } from "@/lib/contracts/recommendations";
import type { Db } from "@/lib/db/pg/client";
import { promptSets, recommendations, scans } from "@/lib/db/pg/schema";
import { mcnemarExact } from "@/lib/metrics/stats";
import type { ComparisonDirection } from "@/lib/metrics/types";

export const RECOMMENDATION_STATUSES = ["open", "in_progress", "published", "dismissed"] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export type OutcomeLabel = "improvement" | "decline" | "within noise";

export type PreRegistrationLock = {
  targetPromptIds: string[];
  baselineScanId: string;
  promptSetId: string;
  promptSetHash: string;
  lockedAt: string;
};

export type RecommendationPayload = {
  card: RecommendationCard;
  preregistration?: PreRegistrationLock;
};

export type PublishInput = {
  recommendationId: string;
  targetPromptIds: string[];
  baselineScanId: string;
};

export type PublishResult = {
  id: string;
  status: "published";
  publishedAt: Date;
  lock: PreRegistrationLock;
};

export type TargetOutcomeInput = {
  /** promptId → won at baseline */
  beforeWon: ReadonlyMap<string, boolean>;
  /** promptId → won at follow-up */
  afterWon: ReadonlyMap<string, boolean>;
  targetPromptIds: readonly string[];
};

export type TargetOutcome = {
  pairs: number;
  wonBefore: number;
  wonAfter: number;
  b: number;
  c: number;
  pValue: number;
  label: OutcomeLabel;
  direction: ComparisonDirection;
  discordant: number;
};

export class PreRegistrationError extends Error {}
export class OutcomePromptSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutcomePromptSetError";
  }
}

function asPayload(raw: unknown): RecommendationPayload {
  if (!raw || typeof raw !== "object") throw new PreRegistrationError("Recommendation payload is missing.");
  const payload = raw as RecommendationPayload;
  if (!payload.card) throw new PreRegistrationError("Recommendation payload.card is required.");
  return payload;
}

function directionToOutcome(direction: ComparisonDirection): OutcomeLabel {
  if (direction === "improvement") return "improvement";
  if (direction === "decline") return "decline";
  return "within noise";
}

/**
 * McNemar on pre-registered target prompts only.
 * Labels: improvement / decline / within noise.
 */
export function judgeTargetOutcome(input: TargetOutcomeInput): TargetOutcome {
  let pairs = 0;
  let wonBefore = 0;
  let wonAfter = 0;
  let b = 0;
  let c = 0;
  for (const promptId of input.targetPromptIds) {
    const before = input.beforeWon.get(promptId);
    const after = input.afterWon.get(promptId);
    if (before === undefined || after === undefined) continue;
    pairs++;
    if (before) wonBefore++;
    if (after) wonAfter++;
    if (before && !after) b++;
    if (!before && after) c++;
  }
  const m = mcnemarExact({ b, c });
  return {
    pairs,
    wonBefore,
    wonAfter,
    b,
    c,
    pValue: m.pValue,
    label: directionToOutcome(m.direction),
    direction: m.direction,
    discordant: m.discordant,
  };
}

async function loadScanPromptSet(
  db: Db,
  scanId: string,
): Promise<{ scanId: string; promptSetId: string; promptSetHash: string; campaignId: string }> {
  const [scan] = await db
    .select({
      id: scans.id,
      campaignId: scans.campaignId,
      promptSetId: scans.promptSetId,
    })
    .from(scans)
    .where(eq(scans.id, scanId));
  if (!scan) throw new PreRegistrationError(`Scan ${scanId} not found.`);
  if (!scan.promptSetId) throw new PreRegistrationError(`Scan ${scanId} has no frozen prompt set.`);
  const [set] = await db
    .select({ id: promptSets.id, sha256: promptSets.sha256 })
    .from(promptSets)
    .where(eq(promptSets.id, scan.promptSetId));
  if (!set?.sha256) throw new PreRegistrationError(`Prompt set ${scan.promptSetId} has no hash.`);
  return {
    scanId: scan.id,
    promptSetId: set.id,
    promptSetHash: set.sha256,
    campaignId: scan.campaignId,
  };
}

/**
 * Transition to published: locks target_prompt_ids, baseline_scan_id, and the
 * baseline prompt set hash. Further edits to those fields are refused.
 */
export async function publishRecommendation(db: Db, input: PublishInput): Promise<PublishResult> {
  if (!input.targetPromptIds.length) {
    throw new PreRegistrationError("Published recommendations need at least one target prompt id.");
  }
  const uniqueTargets = [...new Set(input.targetPromptIds)];
  const baseline = await loadScanPromptSet(db, input.baselineScanId);

  const [row] = await db.select().from(recommendations).where(eq(recommendations.id, input.recommendationId));
  if (!row) throw new PreRegistrationError("Recommendation not found.");
  if (row.campaignId !== baseline.campaignId) {
    throw new PreRegistrationError("Baseline scan belongs to a different campaign.");
  }
  if (row.status === "published") {
    throw new PreRegistrationError("Recommendation is already published; pre-registration is locked.");
  }
  if (row.status === "dismissed") {
    throw new PreRegistrationError("Dismissed recommendations cannot be published.");
  }

  const payload = asPayload(row.payload);
  const lock: PreRegistrationLock = {
    targetPromptIds: uniqueTargets,
    baselineScanId: baseline.scanId,
    promptSetId: baseline.promptSetId,
    promptSetHash: baseline.promptSetHash,
    lockedAt: new Date().toISOString(),
  };
  const publishedAt = new Date();
  const nextPayload: RecommendationPayload = { ...payload, preregistration: lock };

  await db
    .update(recommendations)
    .set({
      status: "published",
      targetPromptIds: uniqueTargets,
      baselineScanId: baseline.scanId,
      publishedAt,
      payload: nextPayload,
    })
    .where(and(eq(recommendations.id, row.id), eq(recommendations.status, row.status)));

  return { id: row.id, status: "published", publishedAt, lock };
}

/** Refuses mutating locked pre-registration fields after publish. */
export function assertPreregistrationMutable(row: {
  status: string;
  targetPromptIds: string[] | null;
  baselineScanId: string | null;
  payload: unknown;
}, patch: {
  targetPromptIds?: string[];
  baselineScanId?: string | null;
}): void {
  if (row.status !== "published") return;
  const lock = asPayload(row.payload).preregistration;
  if (!lock) throw new PreRegistrationError("Published recommendation is missing its pre-registration lock.");
  if (patch.targetPromptIds) {
    const next = [...patch.targetPromptIds].sort().join(",");
    const prev = [...lock.targetPromptIds].sort().join(",");
    if (next !== prev) throw new PreRegistrationError("target_prompt_ids are locked after publish.");
  }
  if (patch.baselineScanId !== undefined && patch.baselineScanId !== lock.baselineScanId) {
    throw new PreRegistrationError("baseline_scan_id is locked after publish.");
  }
}

/**
 * Judge a published recommendation against a later scan on the same prompt set hash.
 * McNemar runs on target prompts only. Different prompt set versions are refused.
 */
export async function judgeRecommendationOutcome(
  db: Db,
  input: {
    recommendationId: string;
    followupScanId: string;
    beforeWon: ReadonlyMap<string, boolean>;
    afterWon: ReadonlyMap<string, boolean>;
  },
): Promise<TargetOutcome & { followupScanId: string; lock: PreRegistrationLock }> {
  const [row] = await db.select().from(recommendations).where(eq(recommendations.id, input.recommendationId));
  if (!row) throw new PreRegistrationError("Recommendation not found.");
  if (row.status !== "published") {
    throw new PreRegistrationError("Outcome requires a published recommendation.");
  }
  const payload = asPayload(row.payload);
  const lock = payload.preregistration;
  if (!lock) throw new PreRegistrationError("Published recommendation is missing its pre-registration lock.");

  const followup = await loadScanPromptSet(db, input.followupScanId);
  if (followup.promptSetHash !== lock.promptSetHash || followup.promptSetId !== lock.promptSetId) {
    throw new OutcomePromptSetError(
      "Follow-up scan uses a different prompt set version; outcome comparison refused.",
    );
  }
  if (followup.scanId === lock.baselineScanId) {
    throw new PreRegistrationError("Follow-up scan must differ from the baseline scan.");
  }

  const outcome = judgeTargetOutcome({
    beforeWon: input.beforeWon,
    afterWon: input.afterWon,
    targetPromptIds: lock.targetPromptIds,
  });

  await db
    .update(recommendations)
    .set({ followupScanId: followup.scanId })
    .where(eq(recommendations.id, row.id));

  return { ...outcome, followupScanId: followup.scanId, lock };
}
