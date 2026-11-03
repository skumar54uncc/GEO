import type PgBoss from "pg-boss";

export const QUEUES = {
  healthPing: "health.ping",
  scheduleTick: "schedule.tick",
} as const;

export type HealthPingData = { sent_at: string };

/** Registers Phase 1 queues. No scan logic yet: schedule.tick only logs. */
export async function registerJobs(boss: PgBoss, log: (msg: string) => void = console.log): Promise<void> {
  await boss.createQueue(QUEUES.healthPing);
  await boss.createQueue(QUEUES.scheduleTick);

  await boss.work<HealthPingData>(QUEUES.healthPing, async (jobs) => {
    for (const job of jobs) {
      log(`[worker] health.ping ${job.id} sent_at=${job.data?.sent_at ?? "?"}`);
    }
    return { ok: true, processed_at: new Date().toISOString() };
  });

  await boss.work(QUEUES.scheduleTick, async (jobs) => {
    for (const job of jobs) log(`[worker] schedule.tick ${job.id} (no scheduled scans until Phase 5)`);
  });

  await boss.schedule(QUEUES.scheduleTick, "0 * * * *");
}
