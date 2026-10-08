import fs from "fs";
import path from "path";
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

export type Store = {
  backend: "sqlite" | "json";
  getConfig(): AppConfig;
  saveConfig(patch: Partial<AppConfig>): AppConfig;
  listPrompts(opts?: { activeOnly?: boolean }): PromptRow[];
  getPrompt(id: number): PromptRow | null;
  createPrompt(input: { text: string; audience: Audience; subtopics: string[] }): PromptRow;
  updatePrompt(id: number, patch: Partial<Pick<PromptRow, "text" | "audience" | "subtopics" | "active" | "version">>): PromptRow | null;
  upsertResponses(rows: UpsertResponseInput[]): ResponseRow[];
  listResponses(filter?: { prompt_id?: number; surface?: Surface; unanalyzedOnly?: boolean }): Array<ResponseRow & { analyzed: boolean; error_flag: number | null }>;
  getResponse(id: number): ResponseRow | null;
  upsertAnalysis(input: {
    response_id: number;
    judge_json: string;
    judge_model: string;
    error_flag: boolean;
    manual_override?: boolean;
  }): AnalysisRow;
  getAnalysisByResponse(response_id: number): AnalysisRow | null;
  listAnalyses(): AnalysisRow[];
  getSerpCache(paramsHash: string): SerpCacheRow | null;
  putSerpCache(input: {
    engine: string;
    params_hash: string;
    params_json: string;
    raw_json: string;
    credits_charged: number;
  }): SerpCacheRow;
  upsertOrganic(input: Omit<SerpOrganicRow, "id">): SerpOrganicRow;
  getOrganic(prompt_id: number): SerpOrganicRow | null;
  listOrganic(): SerpOrganicRow[];
  logSerpEvent(input: Omit<SerpEventRow, "id">): void;
  listSerpEvents(limit?: number): SerpEventRow[];
  chargeCredits(n: number): AppConfig;
  coverage(): CoverageRow[];
  putTrend(term_key: string, data_type: string, raw_json: string): void;
  listTrends(): Array<{ id: number; term_key: string; data_type: string; raw_json: string; fetched_at: string }>;
  putAutocomplete(term: string, raw_json: string): void;
  listAutocomplete(): Array<{ id: number; term: string; raw_json: string; fetched_at: string }>;
};

export type CoverageRow = {
  prompt: PromptRow;
  cells: Record<string, number[]>;
  filled: number;
  total: number;
};

export function dataDir(): string {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

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
