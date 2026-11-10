import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/pg/client";
import { assertNoForeignKeyOrphans, scanForeignKeyOrphans } from "@/lib/db/pg/orphanFks";
import { auditLog, organizations } from "@/lib/db/pg/schema";
import { resetDatabase } from "../helpers";

describe("R1: foreign-key orphan scan", () => {
  beforeEach(resetDatabase);

  it("reports zero orphans on a clean database", async () => {
    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL });
    await client.connect();
    try {
      const rows = await scanForeignKeyOrphans(client);
      expect(rows.length).toBeGreaterThan(50);
      expect(rows.every((r) => r.orphans === 0)).toBe(true);
      await assertNoForeignKeyOrphans(client);
    } finally {
      await client.end();
    }
  });

  it("detects legacy orphans created outside soft-delete (replica bypass simulation)", async () => {
    const db = getDb();
    const [org] = await db
      .insert(organizations)
      .values({ name: "Orphan Probe", slug: "orphan-probe", isDemo: true })
      .returning();
    await db.insert(auditLog).values({
      orgId: org.id,
      action: "probe.audit",
      entityType: "organization",
      entityId: org.id,
      before: { note: "must survive org delete" },
      after: null,
    });

    // Simulate the pre-R3 bug for scanner coverage only — production code never does this.
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('session_replication_role', 'replica', true)`);
      await tx.delete(organizations).where(eq(organizations.id, org.id));
    });

    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL });
    await client.connect();
    try {
      const rows = await scanForeignKeyOrphans(client);
      const auditOrg = rows.find((r) => r.constraintName === "audit_log_org_id_organizations_id_fk");
      expect(auditOrg?.orphans).toBeGreaterThan(0);
      await expect(assertNoForeignKeyOrphans(client)).rejects.toThrow(/audit_log_org_id_organizations_id_fk/);
    } finally {
      await client.end();
    }
  });
});
