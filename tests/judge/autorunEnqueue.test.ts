import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { draws, prompts, scans } from "@/lib/db/pg/schema";
import { __setPreflightForTests } from "@/lib/fireworks/preflight";
import { maybeEnqueueJudgeAfterCapture } from "@/lib/judge/autorun";
import { runJudgeScanEnqueue } from "@/lib/judge/scanEnqueue";
import { QUEUES } from "@/lib/queues";
import { resetDatabase } from "../helpers";

const ORIGINAL = {
  JUDGE_AUTORUN: process.env.JUDGE_AUTORUN,
  JUDGE_MODEL: process.env.JUDGE_MODEL,
};

afterEach(() => {
  if (ORIGINAL.JUDGE_AUTORUN === undefined) delete process.env.JUDGE_AUTORUN;
  else process.env.JUDGE_AUTORUN = ORIGINAL.JUDGE_AUTORUN;
  if (ORIGINAL.JUDGE_MODEL === undefined) delete process.env.JUDGE_MODEL;
  else process.env.JUDGE_MODEL = ORIGINAL.JUDGE_MODEL;
  __setPreflightForTests(async () => ({ ok: true, method: "skip" }));
});

describe("D2: JUDGE_AUTORUN and judge:scan", () => {
  beforeEach(resetDatabase);

  it("with JUDGE_AUTORUN=false no judge.run job is sent", async () => {
    process.env.JUDGE_AUTORUN = "false";
    const sent: Array<{ queue: string; data: unknown }> = [];
    const logs: string[] = [];
    const boss = {
      send: async (queue: string, data: { scan_id: string; org_id: string }) => {
        sent.push({ queue, data });
        return "job";
      },
    };
    const enqueued = await maybeEnqueueJudgeAfterCapture(boss, {
      scanId: "00000000-0000-4000-8000-0000000000aa",
      orgId: "00000000-0000-4000-8000-0000000000bb",
      source: "scan.run",
      log: (m) => logs.push(m),
    });
    expect(enqueued).toBe(false);
    expect(sent).toEqual([]);
    expect(logs.some((m) => m.includes("judge deferred"))).toBe(true);
  });

  it("judge:scan without --approve sends nothing", async () => {
    process.env.JUDGE_MODEL = "accounts/fireworks/models/test-judge";
    const db = getDb();
    const { orgId, campaignId } = await legacyContext(db);
    const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
    const [p] = await db
      .insert(prompts)
      .values({ campaignId, text: "power engineering", provenance: "custom", status: "approved" })
      .returning();
    const [s] = await db.insert(scans).values({ campaignId, name: "d2", kind: "scan", status: "complete" }).returning();
    await db.insert(draws).values({
      scanId: s.id,
      promptId: p.id,
      engine: "claude",
      runner: "api_search",
      fidelity: "medium",
      provider: "anthropic",
      regionId: region.id,
      drawIndex: 1,
      status: "ok",
      answerText: "UNC Charlotte",
      capturedAt: new Date(),
    });

    const sent: Array<{ queue: string }> = [];
    const boss = {
      send: async (queue: string) => {
        sent.push({ queue });
        return "job";
      },
    };
    const result = await runJudgeScanEnqueue(db, boss, { orgId, scanId: s.id, approve: false });
    expect(result.enqueued).toBe(false);
    expect(result.estimate.okDraws).toBe(1);
    expect(sent).toEqual([]);
    expect(result.reason).toMatch(/without --approve/);
  });

  it("default JUDGE_AUTORUN enqueues judge.run", async () => {
    delete process.env.JUDGE_AUTORUN;
    const sent: Array<{ queue: string }> = [];
    const boss = {
      send: async (queue: string) => {
        sent.push({ queue });
        return "job";
      },
    };
    const enqueued = await maybeEnqueueJudgeAfterCapture(boss, {
      scanId: "00000000-0000-4000-8000-0000000000aa",
      orgId: "00000000-0000-4000-8000-0000000000bb",
      source: "capture.retry",
    });
    expect(enqueued).toBe(true);
    expect(sent).toEqual([{ queue: QUEUES.judgeRun }]);
  });
});
