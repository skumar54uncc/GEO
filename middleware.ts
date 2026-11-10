import { NextResponse, type NextRequest } from "next/server";

/**
 * 1) Normalize Chrome's localhost / ::1 to 127.0.0.1 (app binds loopback only).
 * 2) Pages without a session cookie redirect to /login. API routes check auth themselves.
 */
export function middleware(req: NextRequest) {
  const host = req.nextUrl.hostname;
  if (host === "localhost" || host === "::1") {
    const dest = req.nextUrl.clone();
    dest.hostname = "127.0.0.1";
    return NextResponse.redirect(dest);
  }

  const path = req.nextUrl.pathname;
  if (path.startsWith("/api") || path === "/login" || path.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (req.cookies.get("geo_session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
