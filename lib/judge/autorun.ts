import { QUEUES } from "@/lib/queues";

export type JudgeRunPayload = { scan_id: string; org_id: string };

export type JudgeEnqueueBoss = {
  send: (queue: string, data: JudgeRunPayload, opts?: unknown) => Promise<string | null>;
};

/** Default true. Set JUDGE_AUTORUN=false to capture without enqueueing judge.run. */
export function judgeAutorunEnabled(): boolean {
  const raw = process.env.JUDGE_AUTORUN?.trim().toLowerCase();
  if (!raw) return true;
  return raw !== "false" && raw !== "0" && raw !== "no";
}

/**
 * After scan.run / capture.retry: enqueue judge.run unless JUDGE_AUTORUN=false.
 * Returns whether a job was sent.
 */
export async function maybeEnqueueJudgeAfterCapture(
  boss: JudgeEnqueueBoss,
  opts: {
    scanId: string;
    orgId: string;
    source: "scan.run" | "capture.retry";
    log?: (m: string) => void;
    jobOptions?: unknown;
  },
): Promise<boolean> {
  const log = opts.log ?? (() => {});
  if (!judgeAutorunEnabled()) {
    log(`[worker] ${opts.source} ${opts.scanId}: judge deferred`);
    return false;
  }
  await boss.send(QUEUES.judgeRun, { scan_id: opts.scanId, org_id: opts.orgId }, opts.jobOptions);
  return true;
}
