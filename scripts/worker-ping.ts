import PgBoss from "pg-boss";
import { QUEUES } from "../worker/jobs";
import { loadEnv } from "./env";

// Sends one health.ping and waits for a running worker (npm run worker) to complete it.
async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const boss = new PgBoss(url);
  await boss.start();
  await boss.createQueue(QUEUES.healthPing);
  const id = await boss.send(QUEUES.healthPing, { sent_at: new Date().toISOString() });
  if (!id) throw new Error("send returned no job id");
  const deadline = Date.now() + 30_000;
  for (;;) {
    const job = await boss.getJobById(QUEUES.healthPing, id);
    if (job?.state === "completed") {
      console.log(`health.ping ${id} completed`, job.output ?? "");
      break;
    }
    if (job?.state === "failed") throw new Error(`health.ping ${id} failed`);
    if (Date.now() > deadline) throw new Error(`health.ping ${id} not processed within 30s. Is npm run worker running?`);
    await new Promise((r) => setTimeout(r, 500));
  }
  await boss.stop({ graceful: false });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
