import PgBoss from "pg-boss";
import { loadEnv } from "../scripts/env";
import { registerJobs } from "./jobs";

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  const boss = new PgBoss(url);
  boss.on("error", (err) => console.error("[worker] pg-boss error", err));
  await boss.start();
  await registerJobs(boss);
  console.log("[worker] started: health.ping, schedule.tick (hourly, log only)");

  const stop = async () => {
    console.log("[worker] stopping");
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error("[worker] failed to start", err);
  process.exit(1);
});
