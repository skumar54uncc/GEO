import { ENGINES, type Engine } from "@/lib/capture/types";

export const SEARCH_INDEXES = ["chat", "google"] as const;
export type SearchIndex = (typeof SEARCH_INDEXES)[number];

export const ENGINE_INDEX: Record<Engine, SearchIndex> = {
  chatgpt: "chat",
  gemini: "chat",
  claude: "chat",
  perplexity: "chat",
  google_aio: "google",
  google_ai_mode: "google",
};

export function enginesInIndex(index: SearchIndex): Engine[] {
  return ENGINES.filter((engine) => ENGINE_INDEX[engine] === index);
}

export class IndexMixError extends Error {
  constructor(public readonly engines: Engine[]) {
    const found = [...new Set(engines.map((e) => ENGINE_INDEX[e]))].join(", ");
    super(`Indexes must never be pooled; got engines from: ${found} (${[...new Set(engines)].join(", ")})`);
    this.name = "IndexMixError";
  }
}

export function assertSameIndex(engines: readonly Engine[]): SearchIndex {
  if (engines.length === 0) throw new RangeError("assertSameIndex needs at least one engine");
  const first = ENGINE_INDEX[engines[0]];
  if (engines.some((engine) => ENGINE_INDEX[engine] !== first)) throw new IndexMixError([...engines]);
  return first;
}
