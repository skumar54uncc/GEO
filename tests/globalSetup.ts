import { Client } from "pg";
import { runMigrations, setup } from "../scripts/db";
import { loadEnv } from "../scripts/env";

/** Recreates the test database schema from migrations once per test run. */
export default async function globalSetup() {
  loadEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set. See .env.example.");
  if (process.env.DATABASE_URL && url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL: the test database is wiped.");
  }
  await setup(url);
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS pgboss CASCADE; CREATE SCHEMA public;");
  await client.end();
  await runMigrations(url);
}
