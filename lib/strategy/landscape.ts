import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { checkBudget } from "@/lib/cost/guard";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, scans } from "@/lib/db/pg/schema";
import { stableStringify } from "./hash";

export const LANDSCAPE_PROVIDER = "strategy_landscape_sample";

export type LandscapeReuse = {
  mode: "reuse_existing";
  scanId: string;
  promptSetId: string | null;
  createdAt: string;
  note: string;
};

export type LandscapeEstimate = {
  provider: typeof LANDSCAPE_PROVIDER;
  mode: "fixture_only";
  capability: "unknown";
  priceUsd: null;
  units: number;
  paramsHash: string;
  available: true;
  topic: string;
  campaignId: string;
};

export type LandscapeApproval = {
  paramsHash: string;
  units: number;
  priceUsd: null;
  acknowledgedUnknownPrice: true;
};

export type LandscapeSampleResult = {
  mode: "fixture_sample";
  scanId: string;
  paramsHash: string;
  ownersByEngine: Array<{ engine: string; runner: string; mentionedBrand: boolean; n: number }>;
};

export class LandscapeApprovalError extends Error {}

/**
 * Prefer an existing completed scan for this campaign/topic. A new sample scan
 * is a paid path (estimate → approval → cost guard) and fixtures-only in tests.
 */
export async function findExistingLandscapeScan(
  db: Db,
  opts: { orgId: string; campaignId: string; topic: string },
): Promise<LandscapeReuse | null> {
  const [campaign] = await db
    .select({ id: campaigns.id, topic: campaigns.topic, orgId: campaigns.orgId })
    .from(campaigns)
    .where(and(eq(campaigns.id, opts.campaignId), eq(campaigns.orgId, opts.orgId)));
  if (!campaign) return null;

  const topicNeedle = opts.topic.trim().toLowerCase();
  const campaignTopic = campaign.topic.trim().toLowerCase();
  const campaignName = (await db.select({ name: campaigns.name }).from(campaigns).where(eq(campaigns.id, opts.campaignId)))[0]
    ?.name?.trim()
    .toLowerCase();
  const related =
    !topicNeedle ||
    !campaignTopic ||
    topicNeedle === campaignTopic ||
    campaignTopic.includes(topicNeedle) ||
    topicNeedle.includes(campaignTopic) ||
    (campaignName ? topicNeedle.includes(campaignName) || campaignName.includes(topicNeedle.split(" ")[0]!) : false);
  if (!related) return null;

  const [latest] = await db
    .select({
      id: scans.id,
      promptSetId: scans.promptSetId,
      createdAt: scans.createdAt,
      name: scans.name,
    })
    .from(scans)
    .where(and(eq(scans.campaignId, opts.campaignId), eq(scans.kind, "scan"), eq(scans.status, "complete")))
    .orderBy(desc(scans.createdAt))
    .limit(1);
  if (!latest) return null;

  return {
    mode: "reuse_existing",
    scanId: latest.id,
    promptSetId: latest.promptSetId,
    createdAt: latest.createdAt.toISOString(),
    note: `Reused existing scan ${latest.id} for topic "${opts.topic}"`,
  };
}

export function estimateLandscapeSample(input: {
  campaignId: string;
  topic: string;
  promptCount: number;
}): LandscapeEstimate {
  const paramsHash = crypto
    .createHash("sha256")
    .update(stableStringify({ campaignId: input.campaignId, topic: input.topic.trim(), promptCount: input.promptCount }))
    .digest("hex");
  return {
    provider: LANDSCAPE_PROVIDER,
    mode: "fixture_only",
    capability: "unknown",
    priceUsd: null,
    units: Math.max(1, input.promptCount),
    paramsHash,
    available: true,
    topic: input.topic.trim(),
    campaignId: input.campaignId,
  };
}

/**
 * Runs a fixture-only landscape sample after estimate approval and cost guard.
 * Does not call paid providers. Caller supplies the fixture scan id + rollup.
 */
export async function runLandscapeSample(
  db: Db,
  opts: {
    orgId: string;
    estimate: LandscapeEstimate;
    approval: LandscapeApproval;
    fixture: LandscapeSampleResult;
  },
): Promise<LandscapeSampleResult> {
  if (opts.approval.paramsHash !== opts.estimate.paramsHash) {
    throw new LandscapeApprovalError("Landscape approval paramsHash does not match estimate.");
  }
  if (opts.approval.units !== opts.estimate.units) {
    throw new LandscapeApprovalError("Landscape approval units do not match estimate.");
  }
  if (opts.fixture.paramsHash !== opts.estimate.paramsHash) {
    throw new LandscapeApprovalError("Fixture paramsHash must match the estimate.");
  }
  const budget = await checkBudget(db, opts.orgId, LANDSCAPE_PROVIDER, {
    units: opts.estimate.units,
    uncachedUnits: opts.estimate.units,
    usd: null,
  });
  if (!budget.allowed) throw new LandscapeApprovalError(budget.reason ?? "Cost guard refused the landscape sample.");
  return opts.fixture;
}
