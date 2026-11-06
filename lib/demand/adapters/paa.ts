import { createDemandAdapter } from "../adapter";

/** People Also Ask from SERP data (SerpAPI or DataForSEO). */
export const paaAdapter = createDemandAdapter({
  id: "paa",
  source: "paa",
  label: "People Also Ask",
  provider: "serp_paa",
  requiredEnv: ["SERPAPI_API_KEY", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
  note: "PAA from SERP providers. Fixture-only in this build.",
  resolveMissing: (env) => {
    const hasSerpapi = Boolean(String(env.SERPAPI_API_KEY ?? "").trim());
    const hasDfs =
      Boolean(String(env.DATAFORSEO_LOGIN ?? "").trim()) && Boolean(String(env.DATAFORSEO_PASSWORD ?? "").trim());
    return hasSerpapi || hasDfs ? [] : ["SERPAPI_API_KEY|DATAFORSEO_LOGIN+DATAFORSEO_PASSWORD"];
  },
});
