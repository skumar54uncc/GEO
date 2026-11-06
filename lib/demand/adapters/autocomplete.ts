import { createDemandAdapter } from "../adapter";

/** Google autocomplete suggestions via SerpAPI-compatible access. */
export const autocompleteAdapter = createDemandAdapter({
  id: "autocomplete",
  source: "autocomplete",
  label: "Autocomplete",
  provider: "serpapi",
  requiredEnv: ["SERPAPI_API_KEY"],
  note: "Autocomplete suggestions. Fixture-only in this build.",
});
