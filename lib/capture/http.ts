export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type HttpResult = {
  ok: boolean;
  status: number;
  text: string;
  json: unknown;
  /** Set when the call failed before a response, or the body was not JSON when JSON was expected. */
  error: string | null;
  latencyMs: number;
};

/** One HTTP call with a timeout. Never throws and never retries. */
export async function httpJson(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<HttpResult> {
  const started = Date.now();
  const { timeoutMs = 120_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...rest, signal: controller.signal, cache: "no-store" });
    const text = await res.text();
    let json: unknown = null;
    let error: string | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      error = `Malformed JSON from provider (HTTP ${res.status})`;
    }
    if (!res.ok && !error) error = `HTTP ${res.status}`;
    return { ok: res.ok && !error, status: res.status, text, json, error, latencyMs: Date.now() - started };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      text: "",
      json: null,
      error: aborted ? `Timed out after ${timeoutMs} ms` : `Network error: ${err instanceof Error ? err.message : String(err)}`,
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** HTTP statuses that mean the provider refused us rather than failed. */
export function isBlockedStatus(status: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 429;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v.length ? v : null;
}

export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
