import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { organizations } from "@/lib/db/pg/schema";

/**
 * Soft-deletes a **demo** organization so immutable rows (`audit_log`, draws, …) keep valid FKs.
 * Archives the org, renames the slug (frees demo re-seed), and never uses
 * `session_replication_role` (FK checks and immutability triggers stay on).
 *
 * Refuses non-demo orgs (e.g. UNC Charlotte). Already-archived orgs are a no-op.
 */
export async function deleteAllDataForOrg(db: Db, orgId: string): Promise<void> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) return;
  if (org.archivedAt) return;
  if (!org.isDemo) {
    throw new Error(`Refusing to delete non-demo organization ${orgId} (${org.slug}). Only is_demo orgs may be soft-archived this way.`);
  }

  await db
    .update(organizations)
    .set({
      archivedAt: new Date(),
      name: `Deleted organization ${orgId}`,
      slug: `deleted-${orgId.replace(/-/g, "")}`,
    })
    .where(eq(organizations.id, orgId));
}
