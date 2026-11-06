import { and, eq } from "drizzle-orm";
import { recordAudit } from "../lib/auth";
import { DEFAULT_ORG_SLUG, legacyContext } from "../lib/db/pg/bootstrap";
import { closeDb, getDb } from "../lib/db/pg/client";
import { memberships, organizations, users } from "../lib/db/pg/schema";
import { loadEnv } from "./env";

loadEnv();

// usage: npm run user:role -- someone@charlotte.edu editor [org-slug]
async function main() {
  const [email, role, orgSlug = DEFAULT_ORG_SLUG] = process.argv.slice(2);
  if (!email || !["admin", "editor", "viewer"].includes(role)) {
    throw new Error("usage: npm run user:role -- <email> <admin|editor|viewer> [org-slug]");
  }
  const db = getDb();
  await legacyContext(db);
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, orgSlug));
  if (!org) throw new Error(`No organization with slug ${orgSlug}.`);
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!user) throw new Error(`No user ${email}. They must attempt to sign in once first.`);
  const [before] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, user.id)));
  const assignedRole = role as "admin" | "editor" | "viewer";
  const membership = before
    ? (
        await db
          .update(memberships)
          .set({ role: assignedRole })
          .where(eq(memberships.id, before.id))
          .returning()
      )[0]
    : (
        await db
          .insert(memberships)
          .values({ orgId: org.id, userId: user.id, role: assignedRole })
          .returning()
      )[0];
  await recordAudit(db, {
    orgId: org.id,
    userId: null,
    action: before ? "membership.role_change (cli)" : "membership.create (cli)",
    entityType: "membership",
    entityId: membership.id,
    before: before ? { role: before.role } : null,
    after: { role },
  });
  console.log(`${email} @ ${org.slug}: ${before?.role ?? "none"} -> ${role}`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await closeDb();
  process.exit(1);
});
