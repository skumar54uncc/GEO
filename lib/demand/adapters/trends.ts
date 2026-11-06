import { createDemandAdapter } from "../adapter";

/** Google Trends: official API when access exists, else SerpAPI Trends. Never scraped. */
export const trendsAdapter = createDemandAdapter({
  id: "google_trends",
  source: "google_trends",
  label: "Google Trends",
  provider: "google_trends",
  requiredEnv: ["GOOGLE_TRENDS_API_KEY", "SERPAPI_API_KEY"],
  note: "Official Trends API if approved; SerpAPI Trends as fallback. Never scraped. Fixture-only in this build.",
  resolveMissing: (env) => {
    const hasOfficial = Boolean(String(env.GOOGLE_TRENDS_API_KEY ?? "").trim());
    const hasSerpapi = Boolean(String(env.SERPAPI_API_KEY ?? "").trim());
    return hasOfficial || hasSerpapi ? [] : ["GOOGLE_TRENDS_API_KEY|SERPAPI_API_KEY"];
  },
});
