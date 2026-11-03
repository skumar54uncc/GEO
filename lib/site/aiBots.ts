import list from "./data/ai-robots.json";

/**
 * AI user agents. Names, operators and functions come from the ai.robots.txt project
 * (https://github.com/ai-robots-txt/ai.robots.txt, MIT, see data/ai-robots.LICENSE),
 * robots.json fetched 2026-11-03, sha256 532f315b…10e7c. Refresh by replacing the file.
 */
export const AI_ROBOTS_SOURCE = {
  url: "https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/robots.json",
  fetched_on: "2026-11-03",
  sha256: "532f315b083ac5b5e830c0f59a8e87cee8b08924dbaffd3bc48114bd54710e7c",
};

type ListEntry = { operator?: string; respect?: string; function?: string; frequency?: string; description?: string };
const LIST = list as Record<string, ListEntry>;

/**
 * search: fetches pages for an AI search index, so blocking it can remove the site from cited answers.
 * user_fetch: fetches a page because a user asked the assistant about it.
 * training: collects text for model training.
 * Categories are this repo's reading of the list's `function` text and the operators' docs. Review when refreshing.
 */
export type BotCategory = "search" | "user_fetch" | "training";

export type CoreBot = {
  name: string;
  operator: string;
  category: BotCategory;
  /** robots.txt control token that never appears in a User-Agent header. */
  tokenOnly?: boolean;
};

const CORE: Array<[string, string, BotCategory, boolean?]> = [
  ["OAI-SearchBot", "OpenAI", "search"],
  ["ChatGPT-User", "OpenAI", "user_fetch"],
  ["GPTBot", "OpenAI", "training"],
  ["Claude-SearchBot", "Anthropic", "search"],
  ["Claude-User", "Anthropic", "user_fetch"],
  ["ClaudeBot", "Anthropic", "training"],
  ["anthropic-ai", "Anthropic", "training"],
  ["Claude-Web", "Anthropic", "user_fetch"],
  ["PerplexityBot", "Perplexity", "search"],
  ["Perplexity-User", "Perplexity", "user_fetch"],
  ["Google-Extended", "Google", "training", true],
  ["Google-CloudVertexBot", "Google", "training"],
  ["GoogleOther", "Google", "training"],
  ["Gemini-Deep-Research", "Google", "user_fetch"],
  ["GoogleAgent-URLContext", "Google", "user_fetch"],
  ["Google-NotebookLM", "Google", "user_fetch"],
  ["Applebot", "Apple", "search"],
  ["Applebot-Extended", "Apple", "training", true],
  ["Amazonbot", "Amazon", "search"],
  ["Amzn-User", "Amazon", "user_fetch"],
  ["meta-externalagent", "Meta", "training"],
  ["meta-externalfetcher", "Meta", "user_fetch"],
  ["meta-webindexer", "Meta", "search"],
  ["FacebookBot", "Meta", "training"],
  ["Bytespider", "ByteDance", "training"],
  ["TikTokSpider", "ByteDance", "training"],
  ["CCBot", "Common Crawl", "training"],
  ["cohere-ai", "Cohere", "user_fetch"],
  ["cohere-training-data-crawler", "Cohere", "training"],
  ["MistralAI-User", "Mistral AI", "user_fetch"],
  ["MistralAI-Index", "Mistral AI", "search"],
  ["DuckAssistBot", "DuckDuckGo", "user_fetch"],
  ["YouBot", "You.com", "search"],
  ["Bravebot", "Brave", "search"],
  ["GrokBot", "xAI", "search"],
  ["xAI-Grok", "xAI", "training"],
  ["DeepSeekBot", "DeepSeek", "training"],
  ["QwenBot", "Alibaba", "training"],
  ["ERNIEBot", "Baidu", "training"],
  ["PetalBot", "Huawei", "search"],
  ["PanguBot", "Huawei", "training"],
  ["AI2Bot", "Ai2", "training"],
  ["Ai2Bot-Dolma", "Ai2", "training"],
  ["Diffbot", "Diffbot", "training"],
  ["Timpibot", "Timpi", "training"],
  ["omgili", "Webz.io", "training"],
  ["Kimi-SearchBot", "Moonshot AI", "search"],
  ["ExaSearchBot", "Exa", "search"],
];

export const CORE_AI_BOTS: CoreBot[] = CORE.map(([name, operator, category, tokenOnly]) => ({
  name,
  operator,
  category,
  ...(tokenOnly ? { tokenOnly: true } : {}),
}));

export const ALL_AI_BOT_NAMES: string[] = Object.keys(LIST);

/** Names too generic to match inside a User-Agent without false positives (e.g. "Spider" in Baiduspider). */
const UA_MATCH_SKIP = new Set(
  ["Code", "Spider", "Dot", "Operator", "Muse", "Instinct", "Cursor", "OpenAI", "LCC", "YaK", "Devin", "Trae", "Codex", "UseAI", "newsai"].map(
    (s) => s.toLowerCase(),
  ),
);
const TOKEN_ONLY = new Set(CORE_AI_BOTS.filter((b) => b.tokenOnly).map((b) => b.name.toLowerCase()));

const MATCHERS: Array<{ name: string; re: RegExp }> = ALL_AI_BOT_NAMES.filter(
  (n) => !UA_MATCH_SKIP.has(n.toLowerCase()) && !TOKEN_ONLY.has(n.toLowerCase()),
)
  // Longer names first so "Claude-SearchBot" wins over "ClaudeBot"-style prefixes.
  .sort((a, b) => b.length - a.length)
  .map((name) => ({
    name,
    re: new RegExp(`(^|[^A-Za-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z0-9-])`, "i"),
  }));

/** The AI bot a User-Agent claims to be, or null. The claim is not verified (we keep no IPs). */
export function matchAiBot(userAgent: string): string | null {
  if (!userAgent) return null;
  for (const m of MATCHERS) if (m.re.test(userAgent)) return m.name;
  return null;
}

export function botInfo(name: string): { operator: string | null; function: string | null; category: BotCategory | null } {
  const core = CORE_AI_BOTS.find((b) => b.name.toLowerCase() === name.toLowerCase());
  const entry = LIST[name];
  const operator = core?.operator ?? entry?.operator?.replace(/^\[([^\]]+)\]\(.*\)$/, "$1") ?? null;
  return { operator, function: entry?.function ?? null, category: core?.category ?? null };
}
