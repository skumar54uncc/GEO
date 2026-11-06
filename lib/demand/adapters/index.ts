import type { DemandAdapter } from "../adapter";
import type { DemandSource } from "../types";
import { autocompleteAdapter } from "./autocomplete";
import { exaAdapter } from "./exa";
import { keywordsAdapter } from "./keywords";
import { llmMentionsAdapter } from "./llmMentions";
import { paaAdapter } from "./paa";
import { relatedSearchAdapter } from "./relatedSearch";
import { searchConsoleAdapter } from "./searchConsole";
import { trendsAdapter } from "./trends";

export const DEMAND_ADAPTERS: DemandAdapter[] = [
  trendsAdapter,
  searchConsoleAdapter,
  paaAdapter,
  autocompleteAdapter,
  relatedSearchAdapter,
  exaAdapter,
  keywordsAdapter,
  llmMentionsAdapter,
];

export function demandAdapterFor(source: DemandSource): DemandAdapter {
  const adapter = DEMAND_ADAPTERS.find((a) => a.config.source === source);
  if (!adapter) throw new Error(`No demand adapter for source ${source}`);
  return adapter;
}

export {
  autocompleteAdapter,
  exaAdapter,
  keywordsAdapter,
  llmMentionsAdapter,
  paaAdapter,
  relatedSearchAdapter,
  searchConsoleAdapter,
  trendsAdapter,
};
