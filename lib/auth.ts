import crypto from "crypto";
import { and, count, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, type Db } from "./db/pg/client";
import { legacyContext } from "./db/pg/bootstrap";
import { ImmutableViolation, isImmutableDbError } from "./db/pg/immutable";
import { auditLog, memberships, sessions, users } from "./db/pg/schema";

export type Role = "admin" | "editor" | "viewer";
export type SessionUser = { userId: string; email: string; name: string | null; orgId: string; role: Role };

export const SESSION_COOKIE = "geo_session";
const SESSION_DAYS = 7;
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

export function roleAtLeast(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403,
  ) {
    super(message);
  }
}

export function allowedEmail(email: string): boolean {
  const domains = (process.env.ALLOWED_LOGIN_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (!domains.length) return true;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return domains.includes(domain);
}

/**
 * Local dev login: no password, so the app must only listen on 127.0.0.1.
 * The first member of the org becomes admin; later new members start as viewer.
 */
export async function createSession(
  email: string,
  name?: string,
  db: Db = getDb(),
): Promise<{ token: string; user: SessionUser }> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new AuthError("A valid email is required.", 401);
  if (!allowedEmail(normalized)) throw new AuthError("This email domain is not allowed to sign in.", 403);
  const ctx = await legacyContext(db);

  let [user] = await db.select().from(users).where(eq(users.email, normalized));
  if (!user) [user] = await db.insert(users).values({ email: normalized, name: name?.trim() || null }).returning();

  let [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.userId, user.id)));
  if (!membership) {
    const [{ admins }] = await db
      .select({ admins: count() })
      .from(memberships)
      .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.role, "admin")));
    [membership] = await db
      .insert(memberships)
      .values({ orgId: ctx.orgId, userId: user.id, role: admins === 0 ? "admin" : "viewer" })
      .returning();
  }

  const token = crypto.randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000),
  });
  await recordAudit(db, {
    orgId: ctx.orgId,
    userId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
  });
  return {
    token,
    user: { userId: user.id, email: user.email, name: user.name, orgId: ctx.orgId, role: membership.role },
  };
}

export async function destroySession(token: string, db: Db = getDb()): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function userForToken(token: string | null, db: Db = getDb()): Promise<SessionUser | null> {
  if (!token) return null;
  const ctx = await legacyContext(db);
  const [row] = await db
    .select({ user: users, role: memberships.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.orgId, ctx.orgId)))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  return { userId: row.user.id, email: row.user.email, name: row.user.name, orgId: ctx.orgId, role: row.role };
}

export async function getSessionUser(req: Request, db: Db = getDb()): Promise<SessionUser | null> {
  return userForToken(readCookie(req, SESSION_COOKIE), db);
}

export async function requireRole(req: Request, required: Role, db: Db = getDb()): Promise<SessionUser> {
  const user = await getSessionUser(req, db);
  if (!user) throw new AuthError("Sign in required.", 401);
  if (!roleAtLeast(user.role, required)) throw new AuthError(`Requires ${required} role; you are ${user.role}.`, 403);
  return user;
}

export type AuditInput = {
  orgId: string | null;
  userId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

export async function recordAudit(db: Db, input: AuditInput): Promise<void> {
  await db.insert(auditLog).values({
    orgId: input.orgId,
    userId: input.userId,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    before: (input.before ?? null) as object | null,
    after: (input.after ?? null) as object | null,
  });
}

type Handler<P> = (req: Request, ctx: { user: SessionUser; params: P }) => Promise<Response>;

/**
 * Wraps a route handler with a role check. Every non-GET request that succeeds writes an
 * audit_log row. Attempts to overwrite immutable data return 409.
 */
export function withRole<P = Record<string, string>>(required: Role, handler: Handler<P>) {
  return async (req: Request, routeCtx?: { params: P }): Promise<Response> => {
    const db = getDb();
    let user: SessionUser;
    try {
      user = await requireRole(req, required, db);
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }
    try {
      const res = await handler(req, { user, params: (routeCtx?.params ?? {}) as P });
      if (req.method !== "GET" && req.method !== "HEAD" && res.status < 400) {
        await recordAudit(db, {
          orgId: user.orgId,
          userId: user.userId,
          action: `${req.method} ${new URL(req.url).pathname}`,
          after: { status: res.status },
        });
      }
      return res;
    } catch (err) {
      if (err instanceof ImmutableViolation || isImmutableDbError(err)) {
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
      }
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
