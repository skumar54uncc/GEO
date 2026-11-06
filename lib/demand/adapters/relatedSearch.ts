import { createDemandAdapter } from "../adapter";

/** Related searches via SerpAPI-compatible access. */
export const relatedSearchAdapter = createDemandAdapter({
  id: "related_search",
  source: "related_search",
  label: "Related searches",
  provider: "serpapi",
  requiredEnv: ["SERPAPI_API_KEY"],
  note: "Related search suggestions. Fixture-only in this build.",
});
