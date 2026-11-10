import crypto from "crypto";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, type Db } from "./db/pg/client";
import { legacyContext } from "./db/pg/bootstrap";
import { ImmutableViolation, isImmutableDbError } from "./db/pg/immutable";
import { safeOrganizationTheme, type OrganizationTheme } from "./contracts/shell";
import { auditLog, memberships, organizations, sessions, users } from "./db/pg/schema";
import { roleAtLeast, type Role } from "./auth/roles";
import { checkLoopbackHostOrigin } from "./net/loopbackHost";

export type { Role };
export { roleAtLeast };
export type SessionUser = { userId: string; email: string; name: string | null; orgId: string; role: Role };
export type OrganizationAccess = {
  id: string;
  name: string;
  slug: string;
  role: Role;
  isDemo: boolean;
  theme: OrganizationTheme;
};

export const SESSION_COOKIE = "geo_session";
export const ACTIVE_ORG_COOKIE = "geo_active_org";
const SESSION_DAYS = 7;
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

/** Loopback names Chrome / Next may present while the process is bound to 127.0.0.1. */
export function isLoopbackHostname(host: string | null | undefined): boolean {
  const h = (host ?? "").trim().toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}

export function assertDevEmailLoginAllowed(req: Request): void {
  if (process.env.NODE_ENV === "production") {
    throw new AuthError(
      "Passwordless email login is disabled in production. Configure magic-link authentication or university SSO.",
      403,
    );
  }
  if (process.env.APP_BIND_HOST !== "127.0.0.1") {
    throw new AuthError(
      "Passwordless email login requires the server to bind explicitly to 127.0.0.1 (APP_BIND_HOST=127.0.0.1).",
      403,
    );
  }
  const requestHost = new URL(req.url).hostname;
  const hostHeader = req.headers.get("host")?.split(":")[0]?.trim() ?? "";
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim().split(":")[0];
  // Chrome and Next often surface `localhost` even when the server listens on 127.0.0.1 only.
  // Safety comes from APP_BIND_HOST=127.0.0.1 (no LAN bind), not from forbidding the localhost name.
  const loopback = isLoopbackHostname(requestHost) || isLoopbackHostname(hostHeader);
  if (!loopback || (forwardedHost && !isLoopbackHostname(forwardedHost))) {
    throw new AuthError(
      "Passwordless email login is available only on loopback (127.0.0.1 or localhost) while the app binds to 127.0.0.1. Use real authentication before hosting.",
      403,
    );
  }
}

/**
 * Local dev login: no password, so the app must only listen on 127.0.0.1.
 * The first account bootstraps the default org admin. Every later account needs
 * an explicit org-scoped membership before it can create a session.
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

  let [membership] = await db.select().from(memberships).where(eq(memberships.userId, user.id));
  if (!membership) {
    const [{ admins }] = await db
      .select({ admins: count() })
      .from(memberships)
      .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.role, "admin")));
    if (admins > 0) {
      throw new AuthError(
        "No organization membership is assigned to this account. Ask an administrator to grant access.",
        403,
      );
    }
    [membership] = await db
      .insert(memberships)
      .values({ orgId: ctx.orgId, userId: user.id, role: "admin" })
      .returning();
  }

  const token = crypto.randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000),
  });
  await recordAudit(db, {
    orgId: membership.orgId,
    userId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
  });
  return {
    token,
    user: { userId: user.id, email: user.email, name: user.name, orgId: membership.orgId, role: membership.role },
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

async function sessionIdentity(token: string | null, db: Db): Promise<{
  userId: string;
  email: string;
  name: string | null;
} | null> {
  if (!token) return null;
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  return { userId: row.user.id, email: row.user.email, name: row.user.name };
}

export async function organizationsForToken(token: string | null, db: Db = getDb()): Promise<{
  identity: { userId: string; email: string; name: string | null };
  organizations: OrganizationAccess[];
} | null> {
  const identity = await sessionIdentity(token, db);
  if (!identity) return null;
  const rows = await db
    .select({ organization: organizations, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, identity.userId), isNull(organizations.archivedAt)));
  return {
    identity,
    organizations: rows.map(({ organization, role }) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role,
      isDemo: organization.isDemo,
      theme: safeOrganizationTheme(organization.themeConfig),
    })),
  };
}

export async function userForToken(
  token: string | null,
  activeOrgId?: string | null,
  db: Db = getDb(),
): Promise<SessionUser | null> {
  const access = await organizationsForToken(token, db);
  if (!access || access.organizations.length === 0) return null;
  const selected = activeOrgId
    ? access.organizations.find((organization) => organization.id === activeOrgId)
    : access.organizations[0];
  if (!selected) return null;
  return {
    ...access.identity,
    orgId: selected.id,
    role: selected.role,
  };
}

export async function getSessionUser(req: Request, db: Db = getDb()): Promise<SessionUser | null> {
  return userForToken(readCookie(req, SESSION_COOKIE), readCookie(req, ACTIVE_ORG_COOKIE), db);
}

export async function getSessionState(req: Request, db: Db = getDb()): Promise<{
  user: SessionUser;
  organizations: OrganizationAccess[];
  activeOrganization: OrganizationAccess;
} | null> {
  const token = readCookie(req, SESSION_COOKIE);
  const activeOrgId = readCookie(req, ACTIVE_ORG_COOKIE);
  const access = await organizationsForToken(token, db);
  if (!access || access.organizations.length === 0) return null;
  const activeOrganization = activeOrgId
    ? access.organizations.find((organization) => organization.id === activeOrgId)
    : access.organizations[0];
  if (!activeOrganization) return null;
  return {
    user: {
      ...access.identity,
      orgId: activeOrganization.id,
      role: activeOrganization.role,
    },
    organizations: access.organizations,
    activeOrganization,
  };
}

export async function requireRole(req: Request, required: Role, db: Db = getDb()): Promise<SessionUser> {
  const guard = checkLoopbackHostOrigin(req);
  if (!guard.ok) throw new AuthError(guard.error, 403);
  const user = await getSessionUser(req, db);
  if (!user) throw new AuthError("Sign in required.", 401);
  if (!roleAtLeast(user.role, required)) throw new AuthError(`Requires ${required} role; you are ${user.role}.`, 403);
  return user;
}

export async function assertLegacyOrganization(orgId: string, db: Db = getDb()): Promise<void> {
  const legacy = await legacyContext(db);
  if (orgId !== legacy.orgId) {
    throw new AuthError("This legacy endpoint is available only in its original organization.", 403);
  }
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
      console.error("withRole handler error:", err);
      return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}

/** Restricts compatibility routes backed by PgStore to the one organization that owns that legacy dataset. */
export function withLegacyRole<P = Record<string, string>>(required: Role, handler: Handler<P>) {
  return withRole<P>(required, async (req, ctx) => {
    try {
      await assertLegacyOrganization(ctx.user.orgId);
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }
    return handler(req, ctx);
  });
}
