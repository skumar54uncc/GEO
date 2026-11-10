import { eq } from "drizzle-orm";
import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteAllDataForOrg } from "@/lib/demo/deleteDemoOrgData";
import { getDb } from "@/lib/db/pg/client";
import { assertNoForeignKeyOrphans } from "@/lib/db/pg/orphanFks";
import { repairOrphanOrganizationTombstones } from "@/lib/db/pg/orgTombstones";
import { auditLog, organizations } from "@/lib/db/pg/schema";
import { resetDatabase } from "../helpers";

describe("R2: organization tombstones", () => {
  beforeEach(resetDatabase);

  it("inserts archived orgs for orphaned audit_log.org_id without touching audit rows", async () => {
    const db = getDb();
    const [org] = await db
      .insert(organizations)
      .values({ name: "Doomed", slug: "doomed-tombstone", isDemo: true })
      .returning();
    await db.insert(auditLog).values({
      orgId: org.id,
      action: "probe.keep",
      entityType: "organization",
      entityId: org.id,
      before: { keep: true },
      after: null,
    });
    await deleteAllDataForOrg(db, org.id);

    const before = await db.select().from(auditLog).where(eq(auditLog.orgId, org.id));
    expect(before).toHaveLength(1);

    const { inserted } = await repairOrphanOrganizationTombstones(db);
    expect(inserted).toBe(1);

    const afterAudit = await db.select().from(auditLog).where(eq(auditLog.orgId, org.id));
    expect(afterAudit).toEqual(before);

    const [tomb] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(tomb.name).toBe(`Deleted organization ${org.id}`);
    expect(tomb.archivedAt).not.toBeNull();
    expect(tomb.slug.startsWith("deleted-")).toBe(true);

    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL });
    await client.connect();
    try {
      await assertNoForeignKeyOrphans(client);
    } finally {
      await client.end();
    }

    const again = await repairOrphanOrganizationTombstones(db);
    expect(again.inserted).toBe(0);
  });
});
