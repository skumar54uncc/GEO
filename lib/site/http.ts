import { NextResponse } from "next/server";
import { SiteInputError, SiteNotFound } from "./context";

/** Maps known site errors to 400 and 404; anything else falls through to withRole's 500. */
export async function siteErrors(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SiteInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof SiteNotFound) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SiteInputError("Expected a JSON object body.");
  return body as Record<string, unknown>;
}
