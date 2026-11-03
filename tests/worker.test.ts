import PgBoss from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QUEUES, registerJobs } from "../worker/jobs";

describe("worker skeleton", () => {
  let boss: PgBoss;
  const logs: string[] = [];

  beforeAll(async () => {
    boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, pollingIntervalSeconds: 0.5 });
    await boss.start();
    await registerJobs(boss, (m) => logs.push(m));
  });

  afterAll(async () => {
    await boss.stop({ graceful: false, wait: true });
  });

  it("processes health.ping", async () => {
    const id = await boss.send(QUEUES.healthPing, { sent_at: new Date().toISOString() });
    expect(id).toBeTruthy();
    const deadline = Date.now() + 20_000;
    let state: string | undefined;
    while (Date.now() < deadline) {
      state = (await boss.getJobById(QUEUES.healthPing, id!))?.state;
      if (state === "completed") break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(state).toBe("completed");
    expect(logs.some((l) => l.includes("health.ping"))).toBe(true);
  });

  it("schedules schedule.tick hourly", async () => {
    const schedules = await boss.getSchedules();
    const tick = schedules.find((s) => s.name === QUEUES.scheduleTick);
    expect(tick?.cron).toBe("0 * * * *");
  });
});
