import { eq } from "drizzle-orm";
import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteAllDataForOrg } from "@/lib/demo/deleteDemoOrgData";
import { getDb } from "@/lib/db/pg/client";
import { assertNoForeignKeyOrphans } from "@/lib/db/pg/orphanFks";
import { auditLog, organizations } from "@/lib/db/pg/schema";
import { resetDatabase } from "../helpers";

describe("R3: org soft-delete leaves zero orphans", () => {
  beforeEach(resetDatabase);

  it("deleting an org with audit rows soft-archives and leaves zero FK orphans", async () => {
    const db = getDb();
    const [org] = await db
      .insert(organizations)
      .values({ name: "Soft Probe", slug: "soft-probe", isDemo: true })
      .returning();
    await db.insert(auditLog).values({
      orgId: org.id,
      action: "probe.soft",
      entityType: "organization",
      entityId: org.id,
      before: { keep: true },
      after: null,
    });

    await deleteAllDataForOrg(db, org.id);

    const [row] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(row).toBeTruthy();
    expect(row.archivedAt).not.toBeNull();
    expect(row.name).toBe(`Deleted organization ${org.id}`);
    expect(row.slug).toBe(`deleted-${org.id.replace(/-/g, "")}`);

    const audits = await db.select().from(auditLog).where(eq(auditLog.orgId, org.id));
    expect(audits).toHaveLength(1);

    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL });
    await client.connect();
    try {
      await assertNoForeignKeyOrphans(client);
    } finally {
      await client.end();
    }
  });
});
