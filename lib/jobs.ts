import PgBoss from "pg-boss";
import { databaseUrl } from "./db/pg/client";

const g = globalThis as unknown as { __geoBoss?: Promise<PgBoss> };

/** Send only client for API routes. The worker process (npm run worker) does the work. */
export function jobClient(): Promise<PgBoss> {
  if (!g.__geoBoss) {
    g.__geoBoss = (async () => {
      const boss = new PgBoss({ connectionString: databaseUrl(), supervise: false, schedule: false });
      boss.on("error", (err) => console.error("[jobs] pg-boss error", err));
      await boss.start();
      return boss;
    })().catch((err) => {
      g.__geoBoss = undefined;
      throw err;
    });
  }
  return g.__geoBoss;
}

export async function sendJob(queue: string, data: object): Promise<string | null> {
  const boss = await jobClient();
  await boss.createQueue(queue);
  return boss.send(queue, data, { retryLimit: 0, expireInSeconds: 4 * 3600 });
}
