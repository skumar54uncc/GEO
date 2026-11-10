import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureCaptureProviders } from "@/lib/capture/accounts";
import { approveScan } from "@/lib/capture/batch";
import { PROVIDER_IDS } from "@/lib/capture/registry";
import type { ProviderAdapter } from "@/lib/capture/types";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { prompts, scans } from "@/lib/db/pg/schema";
import {
  __setPreflightForTests,
  FIREWORKS_MODELS_URL,
  MODEL_UNAVAILABLE,
  preflightFireworksModels,
} from "@/lib/fireworks/preflight";
import { QUEUES } from "@/lib/queues";
import { freezePromptSet } from "@/lib/promptSets";
import { createSchedule, tickSchedules } from "@/lib/schedules";
import { resetDatabase } from "../helpers";

const ORIGINAL = {
  JUDGE_MODEL: process.env.JUDGE_MODEL,
  CONTENT_MODEL: process.env.CONTENT_MODEL,
  FIREWORKS_API_KEY: process.env.FIREWORKS_API_KEY,
};

afterEach(() => {
  __setPreflightForTests(async () => ({ ok: true, method: "skip" }));
  vi.unstubAllGlobals();
  if (ORIGINAL.JUDGE_MODEL === undefined) delete process.env.JUDGE_MODEL;
  else process.env.JUDGE_MODEL = ORIGINAL.JUDGE_MODEL;
  if (ORIGINAL.CONTENT_MODEL === undefined) delete process.env.CONTENT_MODEL;
  else process.env.CONTENT_MODEL = ORIGINAL.CONTENT_MODEL;
  if (ORIGINAL.FIREWORKS_API_KEY === undefined) delete process.env.FIREWORKS_API_KEY;
  else process.env.FIREWORKS_API_KEY = ORIGINAL.FIREWORKS_API_KEY;
});

function fakeAdapters(usd = 0.01): Record<string, ProviderAdapter> {
  const make = (id: string): ProviderAdapter =>
    ({
      id,
      supports: () => true,
      missingConfig: () => [],
      estimate: () => ({ units: 1, usd }),
      capture: async () => {
        throw new Error("preflight test must never capture");
      },
    }) as unknown as ProviderAdapter;
  return Object.fromEntries(PROVIDER_IDS.map((p) => [p, make(p)]));
}

describe("C4: model preflight", () => {
  beforeEach(resetDatabase);

  it("mocked 404 for the model blocks approval", async () => {
    process.env.JUDGE_MODEL = "accounts/fireworks/models/retired-model";
    process.env.FIREWORKS_API_KEY = "test-key";
    __setPreflightForTests(null);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const href = String(url);
        if (href === FIREWORKS_MODELS_URL) {
          return new Response("not found", { status: 404 });
        }
        return new Response(JSON.stringify({ error: { message: "Model not found" } }), { status: 404 });
      }),
    );

    const db = getDb();
    const { orgId, campaignId } = await legacyContext(db);
    await ensureCaptureProviders(db, orgId);
    const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
    const [p] = await db
      .insert(prompts)
      .values({
        campaignId,
        text: "best engineering schools in North Carolina",
        provenance: "custom",
        status: "approved",
      })
      .returning();
    const [scan] = await db
      .insert(scans)
      .values({
        campaignId,
        name: "c4-approve",
        kind: "scan",
        status: "awaiting_approval",
        estimate: {
          totalUsd: 0.01,
          totalDraws: 1,
          canaryDraws: 0,
          cells: [],
          refusals: [],
          spec: {
            promptIds: [p.id],
            regionIds: [region.id],
            draws: 1,
            canary: false,
            routes: [{ engine: "claude", runner: "api_search", provider: "anthropic" }],
          },
        },
      })
      .returning();

    const approved = await approveScan(db, scan.id, { userId: null, via: "test" });
    expect(approved.ok).toBe(false);
    expect(approved.reason).toBe(MODEL_UNAVAILABLE("accounts/fireworks/models/retired-model"));
    const [again] = await db.select().from(scans).where(eq(scans.id, scan.id));
    expect(again.status).toBe("awaiting_approval");
  });

  it("mocked 404 pauses a scheduled run with the same message", async () => {
    process.env.JUDGE_MODEL = "accounts/fireworks/models/retired-model";
    process.env.FIREWORKS_API_KEY = "test-key";
    __setPreflightForTests(null);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const href = String(url);
        if (href === FIREWORKS_MODELS_URL) {
          return new Response("not found", { status: 404 });
        }
        return new Response(JSON.stringify({ error: { message: "Model not found" } }), { status: 404 });
      }),
    );

    const db = getDb();
    const { orgId, campaignId } = await legacyContext(db);
    await ensureCaptureProviders(db, orgId);
    await db.insert(prompts).values({
      campaignId,
      text: "best engineering schools in North Carolina",
      provenance: "custom",
      status: "approved",
    });
    const { set } = await freezePromptSet(db, orgId, campaignId);
    const due = new Date("2026-11-01T12:00:00Z");
    const schedule = await createSchedule(db, orgId, {
      campaign_id: campaignId,
      prompt_set_id: set.id,
      cadence: "monthly",
      enabled: true,
      budget_cap_usd: 100,
      estimate_approved: true,
      approved_estimate_usd: 100,
      next_run_at: due.toISOString(),
    });

    const jobs: Array<{ queue: string }> = [];
    const res = await tickSchedules(db, {
      now: due,
      adapters: fakeAdapters(),
      sendJob: async (queue) => {
        jobs.push({ queue });
        return "job";
      },
    });
    expect(res).toHaveLength(1);
    expect(res[0].action).toBe("paused_reestimate");
    expect(res[0].detail).toBe(MODEL_UNAVAILABLE("accounts/fireworks/models/retired-model"));
    expect(jobs.filter((j) => j.queue === QUEUES.scanRun)).toHaveLength(0);
    const [scan] = await db.select().from(scans).where(eq(scans.id, res[0].scanId!));
    expect(scan.status).toBe("paused");
    expect(scan.pausedReason).toBe(MODEL_UNAVAILABLE("accounts/fireworks/models/retired-model"));
    expect(schedule.id).toBe(res[0].scheduleId);
  });

  it("list method reports missing model without probe", async () => {
    process.env.FIREWORKS_API_KEY = "test-key";
    __setPreflightForTests(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ object: "list", data: [{ id: "accounts/fireworks/models/other" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const db = getDb();
    const { orgId } = await legacyContext(db);
    const result = await preflightFireworksModels(db, {
      orgId,
      modelIds: ["accounts/fireworks/models/retired-model"],
    });
    expect(result).toEqual({
      ok: false,
      reason: MODEL_UNAVAILABLE("accounts/fireworks/models/retired-model"),
      method: "list",
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
