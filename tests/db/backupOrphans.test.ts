import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { assertBackupHasNoOrphans } from "@/lib/db/pg/backupGuard";
import { getDb } from "@/lib/db/pg/client";
import { auditLog, organizations } from "@/lib/db/pg/schema";
import { Client } from "pg";
import { resetDatabase } from "../helpers";

describe("R4: backup orphan gate", () => {
  beforeEach(resetDatabase);

  it("refuses backup when FK orphans exist", async () => {
    const db = getDb();
    const [org] = await db
      .insert(organizations)
      .values({ name: "Backup Orphan", slug: "backup-orphan", isDemo: true })
      .returning();
    await db.insert(auditLog).values({
      orgId: org.id,
      action: "probe.backup",
      entityType: "organization",
      entityId: org.id,
      before: {},
      after: null,
    });
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('session_replication_role', 'replica', true)`);
      await tx.delete(organizations).where(eq(organizations.id, org.id));
    });

    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL });
    await client.connect();
    try {
      await expect(assertBackupHasNoOrphans(client)).rejects.toThrow(/Foreign-key orphans/);
    } finally {
      await client.end();
    }
  });

  it("allows backup when the database has no orphans", async () => {
    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL });
    await client.connect();
    try {
      await assertBackupHasNoOrphans(client);
    } finally {
      await client.end();
    }
  });
});
