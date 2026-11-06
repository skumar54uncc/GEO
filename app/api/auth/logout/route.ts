import { NextResponse } from "next/server";
import { ACTIVE_ORG_COOKIE, destroySession, readCookie, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
  res.cookies.set(SESSION_COOKIE, "", cookieOptions);
  res.cookies.set(ACTIVE_ORG_COOKIE, "", cookieOptions);
  return res;
}
