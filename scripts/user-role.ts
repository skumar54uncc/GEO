import { and, eq } from "drizzle-orm";
import { recordAudit } from "../lib/auth";
import { legacyContext } from "../lib/db/pg/bootstrap";
import { closeDb, getDb } from "../lib/db/pg/client";
import { memberships, users } from "../lib/db/pg/schema";
import { loadEnv } from "./env";

loadEnv();

// usage: npm run user:role -- someone@charlotte.edu editor
async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !["admin", "editor", "viewer"].includes(role)) {
    throw new Error("usage: npm run user:role -- <email> <admin|editor|viewer>");
  }
  const db = getDb();
  const ctx = await legacyContext(db);
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!user) throw new Error(`No user ${email}. They must sign in once first.`);
  const [before] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.userId, user.id)));
  if (!before) throw new Error(`${email} has no membership in this organization.`);
  await db
    .update(memberships)
    .set({ role: role as "admin" | "editor" | "viewer" })
    .where(eq(memberships.id, before.id));
  await recordAudit(db, {
    orgId: ctx.orgId,
    userId: null,
    action: "membership.role_change (cli)",
    entityType: "membership",
    entityId: before.id,
    before: { role: before.role },
    after: { role },
  });
  console.log(`${email}: ${before.role} -> ${role}`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await closeDb();
  process.exit(1);
});
