import { createDemandAdapter } from "../adapter";

/** DataForSEO Google Ads search volume (keyword volume). Label source and range vs modeled. */
export const keywordsAdapter = createDemandAdapter({
  id: "keyword_volume",
  source: "keyword_volume",
  label: "DataForSEO keywords",
  provider: "dataforseo",
  requiredEnv: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
  note: "Keyword volume from DataForSEO. Label whether values are ranges or modeled. Fixture-only in this build.",
});
