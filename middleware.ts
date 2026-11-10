import { NextResponse, type NextRequest } from "next/server";
import { checkLoopbackHostOrigin, hostnameOnly } from "@/lib/net/loopbackHost";

export { isLoopbackHostname } from "@/lib/net/loopbackHost";

/**
 * 1) Every matched path: loopback Host; unsafe methods also require loopback Origin when present.
 *    Accepts 127.0.0.1 and localhost (app port). Runs before redirects so checks are never skipped.
 * 2) If the client Host header is localhost / ::1, redirect to 127.0.0.1 (Chrome often uses localhost
 *    while the process binds 127.0.0.1). Decision uses the Host header — not nextUrl.hostname —
 *    because Next can normalize 127.0.0.1 → localhost and create a redirect loop.
 * 3) Pages without a session cookie redirect to /login. API routes check auth themselves.
 * Matcher includes /_next/image (image optimizer advisories on Next 14.2.35).
 */
export function middleware(req: NextRequest) {
  const guard = checkLoopbackHostOrigin(req);
  if (!guard.ok) {
    if (req.nextUrl.pathname.startsWith("/api") || req.nextUrl.pathname.startsWith("/_next")) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    return new NextResponse(guard.error, { status: guard.status });
  }

  const path = req.nextUrl.pathname;
  if (path.startsWith("/api") || path.startsWith("/_next")) {
    return NextResponse.next();
  }

  const headerHost = hostnameOnly(req.headers.get("host"));
  if (headerHost === "localhost" || headerHost === "::1") {
    const dest = req.nextUrl.clone();
    dest.hostname = "127.0.0.1";
    return NextResponse.redirect(dest);
  }

  if (path === "/login") {
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
  // Include /_next/image so forged Host cannot hit the image optimizer. Keep static assets out.
  matcher: ["/((?!_next/static|favicon.ico).*)"],
};
