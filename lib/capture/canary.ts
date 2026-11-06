import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { alerts, canaryRuns, prompts, scans } from "@/lib/db/pg/schema";
import type { Route } from "./registry";
import { captureDraw, type DrawOutcome } from "./run";
import type { ProviderAdapter, Region } from "./types";

export const CANARY_PROMPT = "Which universities in North Carolina offer undergraduate engineering degrees?";
export const CANARY_TAG = "system:canary";

/** The fixed canary prompt lives in the campaign as a draft tagged system:canary; it never joins a prompt set. */
export async function ensureCanaryPrompt(db: Db, campaignId: string): Promise<string> {
  const [row] = await db
    .select({ id: prompts.id })
    .from(prompts)
    .where(and(eq(prompts.campaignId, campaignId), sql`${CANARY_TAG} = any(${prompts.tags})`));
  if (row) return row.id;
  const [created] = await db
    .insert(prompts)
    .values({ campaignId, text: CANARY_PROMPT, provenance: "custom", status: "draft", tags: [CANARY_TAG] })
    .returning({ id: prompts.id });
  return created.id;
}

export type CanaryResult = { route: Route; ok: boolean; reason: string | null; drawId: string | null };

/**
 * Expected structure: an answer for chat engines; for Google AI Overview either an overview or organic
 * results (Google often shows no overview, which is not a parser failure).
 */
export function canaryVerdict(route: Route, outcome: DrawOutcome): { ok: boolean; reason: string | null } {
  if (outcome.status === "ok") return { ok: true, reason: null };
  if (outcome.status === "empty" && route.engine === "google_aio") {
    if (outcome.organicCount > 0) return { ok: true, reason: null };
    return { ok: false, reason: "No AI Overview and no organic results: parser found no expected structure" };
  }
  if (outcome.status === "empty") return { ok: false, reason: "Empty answer: parser found no expected structure" };
  return { ok: false, reason: outcome.error ?? outcome.status };
}

/** One canary draw per route in its own canary scan. A failure raises an alert and refuses that route. */
export async function runCanaries(
  db: Db,
  opts: { orgId: string; campaignId: string; forScanId: string; routes: Route[]; region: Region; adapters?: Partial<Record<string, ProviderAdapter>> },
): Promise<CanaryResult[]> {
  // Re-delivery of scan.run must not pay for canaries twice: reuse rows already written for this scan.
  const prior = await db.select().from(canaryRuns).where(eq(canaryRuns.scanId, opts.forScanId));
  if (prior.length) {
    const byRoute = new Map(prior.map((r) => [`${r.engine}|${r.runner}|${r.provider}`, r]));
    return opts.routes.map((route) => {
      const row = byRoute.get(`${route.engine}|${route.runner}|${route.provider}`);
      if (!row) return { route, ok: false, reason: "Canary missing for route on resume", drawId: null };
      return { route, ok: row.ok, reason: row.reason, drawId: row.drawId };
    });
  }

  const promptId = await ensureCanaryPrompt(db, opts.campaignId);
  const [canaryScan] = await db
    .insert(scans)
    .values({ campaignId: opts.campaignId, name: `Canary for ${opts.forScanId}`, kind: "canary", status: "running", approvedAt: new Date() })
    .returning({ id: scans.id });
  const results: CanaryResult[] = [];
  for (const route of opts.routes) {
    const outcome = await captureDraw(
      db,
      {
        orgId: opts.orgId,
        scanId: canaryScan.id,
        promptId,
        promptSetId: null,
        promptText: CANARY_PROMPT,
        engine: route.engine,
        runner: route.runner,
        provider: route.provider,
        region: opts.region,
        drawIndex: 1,
      },
      { adapter: opts.adapters?.[route.provider] },
    );
    const verdict = canaryVerdict(route, outcome);
    await db.insert(canaryRuns).values({
      orgId: opts.orgId,
      scanId: opts.forScanId,
      engine: route.engine,
      runner: route.runner,
      provider: route.provider,
      drawId: outcome.drawId,
      ok: verdict.ok,
      reason: verdict.reason,
    });
    if (!verdict.ok) {
      await db.insert(alerts).values({
        orgId: opts.orgId,
        campaignId: opts.campaignId,
        kind: "canary_failed",
        payload: { scanId: opts.forScanId, engine: route.engine, runner: route.runner, provider: route.provider, reason: verdict.reason, drawId: outcome.drawId },
      });
    }
    results.push({ route, ok: verdict.ok, reason: verdict.reason, drawId: outcome.drawId });
  }
  const anyFailed = results.some((r) => !r.ok);
  await db.update(scans).set({ status: anyFailed ? "partial" : "complete" }).where(eq(scans.id, canaryScan.id));
  return results;
}
