import { NextResponse } from "next/server";
import {
  ACTIVE_ORG_COOKIE,
  organizationsForToken,
  readCookie,
  recordAudit,
  SESSION_COOKIE,
} from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  const access = await organizationsForToken(token);
  if (!access) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { organizationId?: unknown };
  const organization = access.organizations.find(({ id }) => id === body.organizationId);
  if (!organization) {
    return NextResponse.json(
      { error: "You do not have access to this organization or action." },
      { status: 403 },
    );
  }

  await recordAudit(getDb(), {
    orgId: organization.id,
    userId: access.identity.userId,
    action: "auth.organization_switch",
    entityType: "organization",
    entityId: organization.id,
    after: { role: organization.role },
  });

  const res = NextResponse.json({ activeOrganization: organization });
  res.cookies.set(ACTIVE_ORG_COOKIE, organization.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  return res;
}
