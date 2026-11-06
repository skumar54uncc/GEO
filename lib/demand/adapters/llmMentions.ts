import { createDemandAdapter } from "../adapter";

/** DataForSEO LLM Mentions / AI keyword surfaces. Stored as demand_source llm_mentions. */
export const llmMentionsAdapter = createDemandAdapter({
  id: "llm_mentions",
  source: "llm_mentions",
  label: "LLM Mentions",
  provider: "dataforseo",
  requiredEnv: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
  note: "LLM mention / AI keyword signals via DataForSEO. Never labeled as observed AI search volume. Fixture-only in this build.",
});
