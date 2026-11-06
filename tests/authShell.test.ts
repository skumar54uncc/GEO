import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as meGet } from "@/app/api/auth/me/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { POST as switchOrgPost } from "@/app/api/auth/org/route";
import {
  ACTIVE_ORG_COOKIE,
  AuthError,
  getSessionUser,
  requireRole,
} from "@/lib/auth";
import { safeOrganizationTheme } from "@/lib/contracts";
import { getDb } from "@/lib/db/pg/client";
import { auditLog, memberships, organizations } from "@/lib/db/pg/schema";
import { cookieFor, req, resetDatabase, userIdFor } from "./helpers";

describe("organization-scoped sessions", () => {
  beforeEach(resetDatabase);

  it("refuses cross-organization switches without a membership", async () => {
    const cookie = await cookieFor("member@example.edu", "admin");
    const [outside] = await getDb()
      .insert(organizations)
      .values({ name: "Outside University", slug: "outside" })
      .returning();

    const res = await switchOrgPost(
      req("/api/auth/org", { method: "POST", cookie, body: { organizationId: outside.id } }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "You do not have access to this organization or action." });
  });

  it("re-verifies the role from the selected organization's membership", async () => {
    const cookie = await cookieFor("roles@example.edu", "admin");
    const userId = await userIdFor("roles@example.edu");
    const [viewerOrg] = await getDb()
      .insert(organizations)
      .values({ name: "Viewer Organization", slug: "viewer-org" })
      .returning();
    await getDb().insert(memberships).values({ orgId: viewerOrg.id, userId, role: "viewer" });

    const selectedCookie = `${cookie}; ${ACTIVE_ORG_COOKIE}=${viewerOrg.id}`;
    const selected = await getSessionUser(req("/api/example", { cookie: selectedCookie }));
    expect(selected?.role).toBe("viewer");
    await expect(requireRole(req("/api/example", { cookie: selectedCookie }), "admin")).rejects.toMatchObject({
      status: 403,
    } satisfies Partial<AuthError>);
  });

  it("lists only memberships and returns the active demo theme", async () => {
    const cookie = await cookieFor("multi@example.edu", "editor");
    const userId = await userIdFor("multi@example.edu");
    const [demo] = await getDb()
      .insert(organizations)
      .values({
        name: "Demo University",
        slug: "demo",
        isDemo: true,
        themeConfig: { primary: "#123456", accent: "#abcdef" },
      })
      .returning();
    await getDb().insert(memberships).values({ orgId: demo.id, userId, role: "viewer" });

    const res = await meGet(req("/api/auth/me", { cookie: `${cookie}; ${ACTIVE_ORG_COOKIE}=${demo.id}` }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.organizations).toHaveLength(2);
    expect(body.activeOrganization).toMatchObject({
      id: demo.id,
      isDemo: true,
      role: "viewer",
      theme: { primary: "#123456", accent: "#abcdef" },
    });
  });

  it("audits successful switches and sets a protected selector cookie", async () => {
    const cookie = await cookieFor("switch@example.edu", "admin");
    const userId = await userIdFor("switch@example.edu");
    const [target] = await getDb()
      .insert(organizations)
      .values({ name: "Target", slug: "target" })
      .returning();
    await getDb().insert(memberships).values({ orgId: target.id, userId, role: "editor" });

    const res = await switchOrgPost(
      req("/api/auth/org", { method: "POST", cookie, body: { organizationId: target.id } }),
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${ACTIVE_ORG_COOKIE}=${target.id}`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie).toContain("Path=/");

    const rows = await getDb()
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.orgId, target.id),
          eq(auditLog.userId, userId),
          eq(auditLog.action, "auth.organization_switch"),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("sets both protected cookies at login and clears both at logout", async () => {
    const login = await loginPost(
      req("/api/auth/login", { method: "POST", body: { email: "cookies@example.edu" } }),
    );
    const loginCookies = login.headers.get("set-cookie")?.toLowerCase() ?? "";
    expect(loginCookies).toContain("geo_session=");
    expect(loginCookies).toContain(`${ACTIVE_ORG_COOKIE}=`);
    expect(loginCookies.match(/httponly/g)?.length).toBe(2);
    expect(loginCookies.match(/samesite=lax/g)?.length).toBe(2);

    const sessionCookie = (login.headers.get("set-cookie") ?? "").match(/geo_session=([^;,]+)/)?.[1];
    const logout = await logoutPost(req("/api/auth/logout", { method: "POST", cookie: `geo_session=${sessionCookie}` }));
    const logoutCookies = logout.headers.get("set-cookie")?.toLowerCase() ?? "";
    expect(logoutCookies).toContain("geo_session=");
    expect(logoutCookies).toContain(`${ACTIVE_ORG_COOKIE}=`);
    expect(logoutCookies.match(/max-age=0/g)?.length).toBe(2);
  });
});

describe("Wave 1 shell contracts", () => {
  it("uses safe theme defaults when organization config is malformed", () => {
    expect(safeOrganizationTheme({ primary: "javascript:red", accent: "#123" })).toEqual({
      primary: "#005035",
      accent: "#A49665",
      sansFont: 'Arial, "Arial Narrow", system-ui, sans-serif',
      serifFont: 'Cambria, Georgia, "Times New Roman", serif',
    });
  });

  it("keeps leadership routes off legacy metrics", () => {
    for (const route of ["app/page.tsx", "app/budget/page.tsx"]) {
      const source = fs.readFileSync(path.join(process.cwd(), route), "utf8");
      expect(source).not.toMatch(/from\s+["']@\/lib\/metrics["']/);
      expect(source).not.toContain("/api/metrics");
    }
  });

  it("labels every remaining page that imports the legacy metrics module", () => {
    for (const route of ["app/legacy/page.tsx", "app/demand/page.tsx"]) {
      const source = fs.readFileSync(path.join(process.cwd(), route), "utf8");
      expect(source).toContain("Legacy, not METRICS.md compliant");
    }
  });

  it("mounts the shared demo banner globally and exposes accessibility landmarks", () => {
    const shell = fs.readFileSync(path.join(process.cwd(), "components/AppShell.tsx"), "utf8");
    expect(shell).toContain("<DemoBanner isDemo={activeOrganization.isDemo}");
    expect(shell).toContain('href="#main-content"');
    expect(shell).toContain('aria-label="Primary"');
  });
});
