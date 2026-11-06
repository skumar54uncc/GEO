import { eq } from "drizzle-orm";
import { ensureCaptureProviders } from "@/lib/capture/accounts";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { fidelityFor, type Engine, type Runner } from "@/lib/capture/types";
import { TEST_FIXTURE_MARKER } from "@/lib/contracts/demoSeed";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { campaigns, citations, claims, draws, judgeRuns, mentions, prompts, scans } from "@/lib/db/pg/schema";
import { freezePromptSet } from "@/lib/promptSets";

export async function seed(promptCount = 10) {
  const db = getDb();
  const ctx = await legacyContext(db);
  await ensureCaptureProviders(db, ctx.orgId);
  const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
  const [{ brandId }] = await db.select({ brandId: campaigns.brandId }).from(campaigns).where(eq(campaigns.id, ctx.campaignId));
  const promptIds: string[] = [];
  for (let i = 0; i < promptCount; i++) {
    const [p] = await db.insert(prompts).values({ campaignId: ctx.campaignId, text: `prompt ${i}`, provenance: "custom", status: "approved" }).returning({ id: prompts.id });
    promptIds.push(p.id);
  }
  const { set } = await freezePromptSet(db, ctx.orgId, ctx.campaignId);
  return { db, ...ctx, brandId, regionId: region.id, promptIds, promptSetId: set.id };
}
export type Ctx = Awaited<ReturnType<typeof seed>>;

export async function newScan(c: Ctx, promptSetId: string | null = c.promptSetId, status: "complete" | "partial" | "running" = "complete", createdAt?: Date) {
  const [s] = await c.db
    .insert(scans)
    .values({ campaignId: c.campaignId, promptSetId, name: "fixture", kind: "scan", status, approvedAt: new Date(), ...(createdAt ? { createdAt } : {}) })
    .returning({ id: scans.id });
  return s.id;
}

export type DrawOpts = {
  status?: "ok" | "empty" | "error" | "blocked";
  engine?: Engine;
  runner?: Runner;
  provider?: string;
  drawIndex?: number;
  attempt?: number;
  /** null = not judged; true/false = judged with/without a brand mention. */
  brand?: boolean | null;
  searchUsed?: boolean | null;
  experimental?: boolean;
  regionHonored?: "yes" | "no" | "unknown";
  citation?: { domain: string; sourceClass?: "owned" | "other" };
  claim?: "supported" | "contradicted" | "unverifiable";
  brandSpan?: number;
  /**
   * Defaults to TEST_FIXTURE_MARKER so fixture draws are detectable.
   * Pass `null` only for isolation tests that model unmarked production rows.
   */
  seedMarker?: string | null;
};

export async function addDraw(c: Ctx, scanId: string, promptId: string, o: DrawOpts = {}) {
  const runner = o.runner ?? "ui_provider";
  const seedMarker = o.seedMarker === undefined ? TEST_FIXTURE_MARKER : o.seedMarker;
  const [d] = await c.db
    .insert(draws)
    .values({
      scanId,
      promptId,
      promptSetId: c.promptSetId,
      engine: o.engine ?? "chatgpt",
      runner,
      fidelity: fidelityFor(runner),
      provider: o.provider ?? "dataforseo",
      regionId: c.regionId,
      regionHonored: o.regionHonored ?? "unknown",
      drawIndex: o.drawIndex ?? 1,
      attempt: o.attempt ?? 1,
      status: o.status ?? "ok",
      answerText: "fixture answer",
      capturedAt: new Date(),
      searchUsed: o.searchUsed ?? null,
      experimental: o.experimental ?? false,
      seedMarker,
    })
    .returning({ id: draws.id });
  if (o.citation) {
    await c.db.insert(citations).values({ drawId: d.id, url: `https://${o.citation.domain}/x`, domain: o.citation.domain, sourceClass: o.citation.sourceClass ?? "other" });
  }
  if (o.brand !== null && o.brand !== undefined) {
    const [run] = await c.db.insert(judgeRuns).values({ drawId: d.id, judgeModel: "fixture", judgePromptVersion: "fixture", rawOutput: "{}" }).returning({ id: judgeRuns.id });
    if (o.brand) await c.db.insert(mentions).values({ judgeRunId: run.id, entityType: "brand", entityId: c.brandId, spanStart: o.brandSpan ?? 0, spanEnd: (o.brandSpan ?? 0) + 5 });
    if (o.claim) await c.db.insert(claims).values({ judgeRunId: run.id, text: "a claim", verdict: o.claim });
  }
  return d.id;
}
