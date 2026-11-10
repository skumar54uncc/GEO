import { beforeEach } from "vitest";
import { __setPreflightForTests } from "@/lib/fireworks/preflight";
import { loadEnv } from "../scripts/env";

loadEnv();
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error(
    "Refusing to run tests: TEST_DATABASE_URL equals DATABASE_URL. The test suite wipes its database.",
  );
}
// Point the app at the isolated test DB for the rest of this process.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.RAW_STORE_DIR = process.env.TEST_RAW_STORE_DIR || "./data/raw-test";
process.env.APP_BIND_HOST = "127.0.0.1";

// Capture/schedule suites must not call Fireworks; C4 tests override this hook.
beforeEach(() => {
  __setPreflightForTests(async () => ({ ok: true, method: "skip" }));
  if (!process.env.JUDGE_MODEL?.trim()) {
    process.env.JUDGE_MODEL = "accounts/fireworks/models/test-judge";
  }
});
