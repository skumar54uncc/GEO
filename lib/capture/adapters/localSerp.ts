import fs from "fs";
import path from "path";
import { createSerpApiAdapter } from "./serpapi";
import { depsOf, type AdapterDeps, type Env } from "./common";
import { errorResult, type ProviderAdapter } from "../types";

export const PARITY_MAX_AGE_DAYS = 35;

export type ParityStatus = { passed: boolean; fresh: boolean; date: string | null; ageDays: number | null; reason: string | null; path: string };

/**
 * The local SERP service counts only after its parity report passes. The report must contain a line
 * `Result: PASS` and a line `Date: YYYY-MM-DD` (the day the parity run finished).
 */
export function parityStatus(env: Env = process.env, now = new Date(), read = (p: string) => fs.readFileSync(p, "utf8")): ParityStatus {
  const file = path.resolve(env.LOCAL_SERP_PARITY_REPORT || "parity-report.md");
  let text: string;
  try {
    text = read(file);
  } catch {
    return { passed: false, fresh: false, date: null, ageDays: null, reason: `No parity report at ${file}`, path: file };
  }
  const passed = /^\s*Result:\s*PASS\b/im.test(text);
  const m = text.match(/^\s*Date:\s*(\d{4}-\d{2}-\d{2})\b/im);
  const date = m ? m[1] : null;
  const ageDays = date ? Math.floor((now.getTime() - Date.parse(`${date}T00:00:00Z`)) / 86_400_000) : null;
  const fresh = ageDays !== null && ageDays >= 0 && ageDays < PARITY_MAX_AGE_DAYS;
  const reason = !passed ? "Parity report does not say Result: PASS" : !date ? "Parity report has no Date: line" : !fresh ? `Parity report is ${ageDays} days old (limit ${PARITY_MAX_AGE_DAYS})` : null;
  return { passed, fresh, date, ageDays, reason, path: file };
}

/** Same request shape as SerpAPI, pointed at SERPAPI_BASE_URL. No key: the service is local. */
export function createLocalSerpAdapter(deps: AdapterDeps = {}): ProviderAdapter {
  const { env } = depsOf(deps);
  const inner = createSerpApiAdapter({ ...deps, id: "local_serp", baseUrl: env().SERPAPI_BASE_URL || "http://unset.invalid", keyEnv: null });
  return {
    ...inner,
    missingConfig: () => (env().SERPAPI_BASE_URL ? [] : ["SERPAPI_BASE_URL"]),
    estimate: () => ({ units: 2, usd: 0, note: "local service; no provider charge" }),
    capture: async (req) => {
      if (!env().SERPAPI_BASE_URL) return errorResult("Missing SERPAPI_BASE_URL", { status: "blocked" });
      const result = await inner.capture(req);
      return { ...result, costUsd: result.costUsd ?? 0 };
    },
  };
}
