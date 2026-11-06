import { createDemandAdapter } from "../adapter";

/** Exa: how the topic is discussed on the web, including Reddit and forums. */
export const exaAdapter = createDemandAdapter({
  id: "exa",
  source: "exa",
  label: "Exa",
  provider: "exa",
  requiredEnv: ["EXA_API_KEY"],
  note: "Web and forum discussion via Exa. Fixture-only in this build.",
});
