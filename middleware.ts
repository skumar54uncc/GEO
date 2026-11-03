import { NextResponse, type NextRequest } from "next/server";

// Pages redirect to /login without a session cookie. API routes check the session and role
// themselves (the edge runtime here cannot reach Postgres).
export function middleware(req: NextRequest) {
  if (req.cookies.get("geo_session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};
