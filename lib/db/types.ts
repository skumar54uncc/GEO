import crypto from "crypto";
import type {
  AnalysisRow,
  AppConfig,
  Audience,
  PromptRow,
  ResponseRow,
  SerpCacheRow,
  SerpEventRow,
  SerpOrganicRow,
  SourceType,
  Surface,
} from "../types";
import { nowIso } from "../domain";
import { SEED_CONFIG } from "@/seed/config";
import { SEED_PROMPTS } from "@/seed/prompts";

export type UpsertResponseInput = {
  prompt_id: number;
  surface: Surface;
  run_number: number;
  raw_text: string;
  source_type: SourceType;
  location_note: string;
};

/**
 * Data access used by the original screens. Same shapes as the SQLite store it replaced,
 * but async, because Postgres is. Draws are immutable: saving a run that already exists
 * with different text throws an ImmutableViolation instead of overwriting it.
 */
export type Store = {
  backend: "postgres";
  getConfig(): Promise<AppConfig>;
  saveConfig(patch: Partial<AppConfig>): Promise<AppConfig>;
  listPrompts(opts?: { activeOnly?: boolean }): Promise<PromptRow[]>;
  getPrompt(id: number): Promise<PromptRow | null>;
  createPrompt(input: { text: string; audience: Audience; subtopics: string[] }): Promise<PromptRow>;
  updatePrompt(
    id: number,
    patch: Partial<Pick<PromptRow, "text" | "audience" | "subtopics" | "active" | "version">>,
  ): Promise<PromptRow | null>;
  upsertResponses(rows: UpsertResponseInput[]): Promise<ResponseRow[]>;
  listResponses(filter?: {
    prompt_id?: number;
    surface?: Surface;
    unanalyzedOnly?: boolean;
  }): Promise<Array<ResponseRow & { analyzed: boolean; error_flag: number | null }>>;
  getResponse(id: number): Promise<ResponseRow | null>;
  upsertAnalysis(input: {
    response_id: number;
    judge_json: string;
    judge_model: string;
    error_flag: boolean;
    manual_override?: boolean;
    repair_used?: boolean;
  }): Promise<AnalysisRow>;
  getAnalysisByResponse(response_id: number): Promise<AnalysisRow | null>;
  listAnalyses(): Promise<AnalysisRow[]>;
  getSerpCache(paramsHash: string): Promise<SerpCacheRow | null>;
  putSerpCache(input: {
    engine: string;
    params_hash: string;
    params_json: string;
    raw_json: string;
    credits_charged: number;
  }): Promise<SerpCacheRow>;
  upsertOrganic(input: Omit<SerpOrganicRow, "id">): Promise<SerpOrganicRow>;
  getOrganic(prompt_id: number): Promise<SerpOrganicRow | null>;
  listOrganic(): Promise<SerpOrganicRow[]>;
  logSerpEvent(input: Omit<SerpEventRow, "id">): Promise<void>;
  listSerpEvents(limit?: number): Promise<SerpEventRow[]>;
  chargeCredits(n: number): Promise<AppConfig>;
  coverage(): Promise<CoverageRow[]>;
  putTrend(term_key: string, data_type: string, raw_json: string): Promise<void>;
  listTrends(): Promise<Array<{ id: number; term_key: string; data_type: string; raw_json: string; fetched_at: string }>>;
  putAutocomplete(term: string, raw_json: string): Promise<void>;
  listAutocomplete(): Promise<Array<{ id: number; term: string; raw_json: string; fetched_at: string }>>;
};

export type CoverageRow = {
  prompt: PromptRow;
  cells: Record<string, number[]>;
  filled: number;
  total: number;
};

export function hashParams(params: Record<string, unknown>): string {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(params).sort()) {
    if (key === "api_key") continue;
    normalized[key] = params[key];
  }
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function seedConfigFromEnv(base: AppConfig): AppConfig {
  const starting = Number(process.env.SERPAPI_STARTING_BALANCE || base.serpapi_starting_balance);
  const cap = Number(process.env.SERPAPI_PER_RUN_CAP || base.serpapi_per_run_cap);
  return {
    ...base,
    serpapi_starting_balance: Number.isFinite(starting) ? starting : base.serpapi_starting_balance,
    serpapi_credits_remaining: Number.isFinite(starting) ? starting : base.serpapi_credits_remaining,
    serpapi_per_run_cap: Number.isFinite(cap) ? cap : base.serpapi_per_run_cap,
  };
}

export function defaultSeedConfig(): AppConfig {
  return seedConfigFromEnv(structuredClone(SEED_CONFIG));
}

export function hydrateConfig(raw: Partial<AppConfig> | AppConfig): AppConfig {
  const base = defaultSeedConfig();
  const extra = (raw.facts || []).filter((f) => !base.facts.some((b) => b.id === f.id));
  return {
    ...base,
    ...raw,
    facts: [...base.facts, ...extra],
    aliases: raw.aliases?.length ? raw.aliases : base.aliases,
    competitors: raw.competitors?.length ? raw.competitors : base.competitors,
    subtopics: raw.subtopics?.length ? raw.subtopics : base.subtopics,
    assets: raw.assets?.length ? raw.assets : base.assets,
  };
}

export function seedPromptRows(): Array<Omit<PromptRow, "id">> {
  return SEED_PROMPTS.map((p) => ({
    text: p.text,
    audience: p.audience,
    subtopics: p.subtopics,
    version: 1,
    active: 1,
  }));
}

export function parsePrompt(row: { id: number; text: string; audience: string; subtopics: string; version: number; active: number }): PromptRow {
  return {
    id: row.id,
    text: row.text,
    audience: row.audience as Audience,
    subtopics: JSON.parse(row.subtopics),
    version: row.version,
    active: row.active,
  };
}

export { nowIso };
