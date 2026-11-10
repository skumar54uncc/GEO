/**
 * Shared Host/Origin allowlist for loopback-only hosting (APP_BIND_HOST=127.0.0.1).
 * Accepts 127.0.0.1 and localhost (with or without port) — Chrome / Next often use localhost
 * even when the process listens on 127.0.0.1 (see login fix 835c85f).
 */

export function hostnameOnly(value: string | null | undefined): string {
  if (!value) return "";
  const first = value.split(",")[0]?.trim() ?? "";
  try {
    if (first.includes("://")) return new URL(first).hostname.toLowerCase();
  } catch {
    /* fall through */
  }
  return first.split(":")[0]?.trim().toLowerCase() ?? "";
}

export function isLoopbackHostname(host: string | null | undefined): boolean {
  const h = (host ?? "").trim().toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}

export type LoopbackGuardResult =
  | { ok: true }
  | { ok: false; status: 403; error: string };

/** Host must be loopback; unsafe methods also require loopback Origin when Origin is present. */
export function checkLoopbackHostOrigin(req: {
  method: string;
  url?: string;
  headers: { get(name: string): string | null };
}): LoopbackGuardResult {
  let reqHost = hostnameOnly(req.headers.get("host"));
  // Node test Requests often omit Host; fall back to the request URL hostname.
  if (!reqHost && req.url) {
    try {
      reqHost = hostnameOnly(new URL(req.url).host);
    } catch {
      /* leave empty */
    }
  }
  if (!isLoopbackHostname(reqHost)) {
    return { ok: false, status: 403, error: "Requests are only available on loopback (127.0.0.1 or localhost)." };
  }
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const originHost = hostnameOnly(req.headers.get("origin"));
    if (originHost && !isLoopbackHostname(originHost)) {
      return { ok: false, status: 403, error: "Cross-origin writes are not allowed." };
    }
  }
  return { ok: true };
}
