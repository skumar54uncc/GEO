export const SURFACES = [
  "chatgpt",
  "gemini",
  "claude",
  "perplexity",
  "google_aio",
  "google_ai_mode",
] as const;

export type Surface = (typeof SURFACES)[number];

export const MANUAL_SURFACES = [
  "chatgpt",
  "gemini",
  "claude",
  "perplexity",
] as const;

export type ManualSurface = (typeof MANUAL_SURFACES)[number];

export const AUDIENCES = [
  "undergrad",
  "grad",
  "industry",
  "hel",
  "government",
] as const;

export type Audience = (typeof AUDIENCES)[number];

export const PROMINENCE = [
  "headline",
  "first_paragraph",
  "body",
  "footnote_only",
  "absent",
] as const;

export type Prominence = (typeof PROMINENCE)[number];

export const SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export type SourceType = "manual" | "serpapi";

export type CompetitorConfig = {
  name: string;
  aliases: string[];
  domains: string[];
};

export type SubtopicConfig = {
  id: string;
  label: string;
};

export type AssetConfig = {
  name: string;
  description: string;
};

export type FactRecord = {
  id: string;
  text: string;
  source_url: string;
  source_label: string;
  subtopics: string[];
  names: string[];
  needs_confirmation: boolean;
};

export type AppConfig = {
  aliases: string[];
  competitors: CompetitorConfig[];
  subtopics: SubtopicConfig[];
  assets: AssetConfig[];
  facts: FactRecord[];
  target_domains: string[];
  serpapi_starting_balance: number;
  serpapi_credits_remaining: number;
  serpapi_per_run_cap: number;
  last_location_note: string;
};

export type PromptRow = {
  id: number;
  text: string;
  audience: Audience;
  subtopics: string[];
  version: number;
  active: number;
};

export type ResponseRow = {
  id: number;
  prompt_id: number;
  surface: Surface;
  run_number: number;
  raw_text: string;
  source_type: SourceType;
  location_note: string;
  captured_at: string;
};

export type JudgeCompetitor = {
  name: string;
  rank: number | null;
  sentiment: Sentiment;
};

export type JudgeCitation = {
  domain: string;
  is_target: boolean;
};

export type JudgeJson = {
  brand_mentioned: boolean;
  brand_aliases_found: string[];
  mention_rank: number | null;
  total_entities_listed: number | null;
  mention_prominence: Prominence;
  mention_sentiment: Sentiment | "absent";
  mention_context: string;
  competitors: JudgeCompetitor[];
  citations: JudgeCitation[];
  target_cited: boolean;
  subtopics_covered: string[];
  assets_surfaced: string[];
  answer_summary: string;
  hallucination_flags: string[];
};

export type AnalysisRow = {
  id: number;
  response_id: number;
  judge_json: string;
  judge_model: string;
  analyzed_at: string;
  error_flag: number;
  manual_override: number;
};

export type SerpCacheRow = {
  id: number;
  engine: string;
  params_hash: string;
  params_json: string;
  raw_json: string;
  credits_charged: number;
  created_at: string;
};

export type SerpOrganicRow = {
  id: number;
  prompt_id: number;
  target_ranked: number;
  target_position: number | null;
  competitor_domains: string;
  paa: string;
  related_searches: string;
  aio_shown: number | null;
  fetched_at: string;
};

export type SerpEventRow = {
  id: number;
  created_at: string;
  engine: string | null;
  ok: number;
  cached: number;
  credits_charged: number;
  error: string | null;
  prompt_id: number | null;
  params_hash: string | null;
};

export type RateWithInterval = {
  rate: number | null;
  successes: number;
  n: number;
  ci_low: number | null;
  ci_high: number | null;
  label: string;
};

export const SURFACE_LABELS: Record<Surface, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
  google_aio: "Google AI Overview",
  google_ai_mode: "Google AI Mode",
};

export const AUDIENCE_LABELS: Record<Audience, string> = {
  undergrad: "Undergraduate",
  grad: "Graduate",
  industry: "Industry",
  hel: "Higher-ed leadership",
  government: "Government",
};

export const AIO_LOCATION_NOTE = "United States (location pinned; not Charlotte-biased)";
export const DEFAULT_LOCATION_NOTE = "Charlotte NC, incognito";
export const GOOGLE_AIO_LOCATION = "United States";
