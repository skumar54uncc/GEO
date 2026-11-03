import { loadEnv } from "../scripts/env";

loadEnv();
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.RAW_STORE_DIR = process.env.TEST_RAW_STORE_DIR || "./data/raw-test";
