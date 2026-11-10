import { isBlockedStatus, type FetchLike, type HttpResult } from "../http";
import { errorResult, type CaptureResult } from "../types";

export type Env = Record<string, string | undefined>;
export type AdapterDeps = { fetch?: FetchLike; env?: Env };

export function depsOf(deps: AdapterDeps) {
  return {
    env: (): Env => deps.env ?? process.env,
    fetch:
      deps.fetch ??
      ((u: string, i?: RequestInit) => fetch(u, { ...i, cache: i?.cache ?? "no-store" })),
  };
}

export function missingVars(env: Env, names: string[]): string[] {
  return names.filter((n) => !env[n]);
}

/**
 * The draw for a failed HTTP call, or null when the call succeeded. A timeout or network error may still
 * have been billed, so its cost is unknown (null) rather than zero.
 */
export function httpFailure(res: HttpResult): CaptureResult | null {
  if (res.ok) return null;
  const raw = res.json ?? (res.text || null);
  const status = isBlockedStatus(res.status) ? "blocked" : "error";
  return errorResult(res.error ?? `HTTP ${res.status}`, { raw, latencyMs: res.latencyMs, status, costUsd: res.status === 0 ? null : 0 });
}
