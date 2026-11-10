import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { organizations } from "@/lib/db/pg/schema";

/**
 * Soft-deletes an organization so immutable rows (`audit_log`, draws, …) keep valid FKs.
 * Archives the org, renames the slug (frees demo re-seed), and never uses
 * `session_replication_role` (FK checks and immutability triggers stay on).
 *
 * Hard-deleting child rows that hit immutable tables is refused by soft-delete instead.
 * Never use this on UNC Charlotte production measurement data without an explicit archive decision.
 */
export async function deleteAllDataForOrg(db: Db, orgId: string): Promise<void> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) return;
  if (org.archivedAt) return;

  await db
    .update(organizations)
    .set({
      archivedAt: new Date(),
      name: `Deleted organization ${orgId}`,
      slug: `deleted-${orgId.replace(/-/g, "")}`,
    })
    .where(eq(organizations.id, orgId));
}
