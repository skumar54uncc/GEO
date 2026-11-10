import { createDemandAdapter } from "../adapter";

/** Real queries that reach owned properties. Needs Search Console property access. */
export const searchConsoleAdapter = createDemandAdapter({
  id: "search_console",
  source: "search_console",
  label: "Google Search Console",
  provider: "search_console",
  requiredEnv: ["GOOGLE_SEARCH_CONSOLE_PROPERTY"],
  note: "Not connected (property access pending from the web team). Never presents figures as AI search volume.",
});
