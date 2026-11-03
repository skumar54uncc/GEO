import { and, eq, sql } from "drizzle-orm";
import { createSession, SESSION_COOKIE, type Role } from "@/lib/auth";
import { resetLegacyContextCache } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { memberships, users } from "@/lib/db/pg/schema";

/** Empties every application table. TRUNCATE does not fire the row level immutability triggers. */
export async function resetDatabase(): Promise<void> {
  const db = getDb();
  const res = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  const tables = (res.rows as Array<{ tablename: string }>).map((r) => `"public"."${r.tablename}"`);
  if (tables.length) await db.execute(sql.raw(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`));
  resetLegacyContextCache();
  (globalThis as { __geoStore?: unknown }).__geoStore = undefined;
}

/** Signs a user in and forces their role. Returns a Cookie header value. */
export async function cookieFor(email: string, role: Role): Promise<string> {
  const db = getDb();
  const { token, user } = await createSession(email);
  await db
    .update(memberships)
    .set({ role })
    .where(and(eq(memberships.userId, user.userId), eq(memberships.orgId, user.orgId)));
  return `${SESSION_COOKIE}=${token}`;
}

export function req(url: string, init: { method?: string; cookie?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.cookie) headers.cookie = init.cookie;
  return new Request(`http://127.0.0.1:3000${url}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export async function userIdFor(email: string): Promise<string> {
  const [u] = await getDb().select().from(users).where(eq(users.email, email));
  return u.id;
}
