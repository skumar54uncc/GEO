import fs from "fs";
import path from "path";
import {
  dataDir,
  defaultSeedConfig,
  hydrateConfig,
  seedPromptRows,
  type CoverageRow,
  type Store,
  type UpsertResponseInput,
} from "./types";
import type {
  AnalysisRow,
  AppConfig,
  Audience,
  PromptRow,
  ResponseRow,
  SerpCacheRow,
  SerpEventRow,
  SerpOrganicRow,
  Surface,
} from "../types";
import { nowIso } from "../domain";

type JsonDb = {
  next: Record<string, number>;
  config: AppConfig;
  prompts: PromptRow[];
  responses: ResponseRow[];
  analyses: AnalysisRow[];
  serp_cache: SerpCacheRow[];
  serp_organic: SerpOrganicRow[];
  serp_events: SerpEventRow[];
  trends: Array<{ id: number; term_key: string; data_type: string; raw_json: string; fetched_at: string }>;
  autocomplete: Array<{ id: number; term: string; raw_json: string; fetched_at: string }>;
};

function filePath(): string {
  return path.join(dataDir(), "store.json");
}

function emptyDb(): JsonDb {
  const prompts = seedPromptRows().map((p, i) => ({ id: i + 1, ...p }));
  return {
    next: {
      prompts: prompts.length + 1,
      responses: 1,
      analyses: 1,
      serp_cache: 1,
      serp_organic: 1,
      serp_events: 1,
      trends: 1,
      autocomplete: 1,
    },
    config: defaultSeedConfig(),
    prompts,
    responses: [],
    analyses: [],
    serp_cache: [],
    serp_organic: [],
    serp_events: [],
    trends: [],
    autocomplete: [],
  };
}

export function openJsonStore(): Store {
  return new JsonStore();
}

class JsonStore implements Store {
  backend = "json" as const;
  private db: JsonDb;

  constructor() {
    const fp = filePath();
    if (fs.existsSync(fp)) {
      this.db = JSON.parse(fs.readFileSync(fp, "utf8")) as JsonDb;
    } else {
      this.db = emptyDb();
      this.persist();
    }
  }

  private persist() {
    fs.writeFileSync(filePath(), JSON.stringify(this.db, null, 2));
  }

  getConfig(): AppConfig {
    return hydrateConfig(this.db.config);
  }

  saveConfig(patch: Partial<AppConfig>): AppConfig {
    this.db.config = { ...this.db.config, ...patch };
    this.persist();
    return this.getConfig();
  }

  listPrompts(opts?: { activeOnly?: boolean }): PromptRow[] {
    const rows = this.db.prompts.slice().sort((a, b) => a.id - b.id);
    return opts?.activeOnly ? rows.filter((p) => p.active) : rows;
  }

  getPrompt(id: number): PromptRow | null {
    return this.db.prompts.find((p) => p.id === id) ?? null;
  }

  createPrompt(input: { text: string; audience: Audience; subtopics: string[] }): PromptRow {
    const row: PromptRow = {
      id: this.db.next.prompts++,
      text: input.text,
      audience: input.audience,
      subtopics: input.subtopics,
      version: 1,
      active: 1,
    };
    this.db.prompts.push(row);
    this.persist();
    return row;
  }

  updatePrompt(
    id: number,
    patch: Partial<Pick<PromptRow, "text" | "audience" | "subtopics" | "active" | "version">>,
  ): PromptRow | null {
    const row = this.getPrompt(id);
    if (!row) return null;
    Object.assign(row, patch);
    this.persist();
    return row;
  }

  upsertResponses(rows: UpsertResponseInput[]): ResponseRow[] {
    const captured_at = nowIso();
    const out: ResponseRow[] = [];
    for (const r of rows) {
      const existing = this.db.responses.find(
        (x) => x.prompt_id === r.prompt_id && x.surface === r.surface && x.run_number === r.run_number,
      );
      if (existing) {
        existing.raw_text = r.raw_text;
        existing.source_type = r.source_type;
        existing.location_note = r.location_note;
        existing.captured_at = captured_at;
        out.push(existing);
      } else {
        const created: ResponseRow = { id: this.db.next.responses++, captured_at, ...r };
        this.db.responses.push(created);
        out.push(created);
      }
    }
    this.persist();
    return out;
  }

  listResponses(filter?: {
    prompt_id?: number;
    surface?: Surface;
    unanalyzedOnly?: boolean;
  }): Array<ResponseRow & { analyzed: boolean; error_flag: number | null }> {
    return this.db.responses
      .filter((r) => (filter?.prompt_id ? r.prompt_id === filter.prompt_id : true))
      .filter((r) => (filter?.surface ? r.surface === filter.surface : true))
      .map((r) => {
        const a = this.db.analyses.find((x) => x.response_id === r.id);
        return { ...r, analyzed: Boolean(a), error_flag: a?.error_flag ?? null };
      })
      .filter((r) => (filter?.unanalyzedOnly ? !r.analyzed : true))
      .sort((a, b) => a.prompt_id - b.prompt_id || a.surface.localeCompare(b.surface) || a.run_number - b.run_number);
  }

  getResponse(id: number): ResponseRow | null {
    return this.db.responses.find((r) => r.id === id) ?? null;
  }

  upsertAnalysis(input: {
    response_id: number;
    judge_json: string;
    judge_model: string;
    error_flag: boolean;
    manual_override?: boolean;
  }): AnalysisRow {
    const existing = this.db.analyses.find((a) => a.response_id === input.response_id);
    const row: AnalysisRow = {
      id: existing?.id ?? this.db.next.analyses++,
      response_id: input.response_id,
      judge_json: input.judge_json,
      judge_model: input.judge_model,
      analyzed_at: nowIso(),
      error_flag: input.error_flag ? 1 : 0,
      manual_override: input.manual_override ? 1 : 0,
    };
    if (existing) Object.assign(existing, row);
    else this.db.analyses.push(row);
    this.persist();
    return row;
  }

  getAnalysisByResponse(response_id: number): AnalysisRow | null {
    return this.db.analyses.find((a) => a.response_id === response_id) ?? null;
  }

  listAnalyses(): AnalysisRow[] {
    return this.db.analyses.slice().sort((a, b) => a.id - b.id);
  }

  getSerpCache(paramsHash: string): SerpCacheRow | null {
    return this.db.serp_cache.find((r) => r.params_hash === paramsHash) ?? null;
  }

  putSerpCache(input: {
    engine: string;
    params_hash: string;
    params_json: string;
    raw_json: string;
    credits_charged: number;
  }): SerpCacheRow {
    const existing = this.getSerpCache(input.params_hash);
    const row: SerpCacheRow = {
      id: existing?.id ?? this.db.next.serp_cache++,
      created_at: existing?.created_at ?? nowIso(),
      ...input,
    };
    if (existing) Object.assign(existing, row);
    else this.db.serp_cache.push(row);
    this.persist();
    return row;
  }

  upsertOrganic(input: Omit<SerpOrganicRow, "id">): SerpOrganicRow {
    const existing = this.getOrganic(input.prompt_id);
    const row: SerpOrganicRow = { id: existing?.id ?? this.db.next.serp_organic++, ...input };
    if (existing) Object.assign(existing, row);
    else this.db.serp_organic.push(row);
    this.persist();
    return row;
  }

  getOrganic(prompt_id: number): SerpOrganicRow | null {
    return this.db.serp_organic.find((r) => r.prompt_id === prompt_id) ?? null;
  }

  listOrganic(): SerpOrganicRow[] {
    return this.db.serp_organic.slice().sort((a, b) => a.prompt_id - b.prompt_id);
  }

  logSerpEvent(input: Omit<SerpEventRow, "id">): void {
    this.db.serp_events.push({ id: this.db.next.serp_events++, ...input });
    this.persist();
  }

  listSerpEvents(limit = 50): SerpEventRow[] {
    return this.db.serp_events.slice().sort((a, b) => b.id - a.id).slice(0, limit);
  }

  chargeCredits(n: number): AppConfig {
    if (n <= 0) return this.getConfig();
    return this.saveConfig({ serpapi_credits_remaining: this.db.config.serpapi_credits_remaining - n });
  }

  coverage(): CoverageRow[] {
    const surfaces = ["chatgpt", "gemini", "claude", "perplexity", "google_aio", "google_ai_mode"];
    return this.listPrompts().map((prompt) => {
      const cells: Record<string, number[]> = {};
      let filled = 0;
      let total = 0;
      for (const surface of surfaces) {
        const runs = this.db.responses
          .filter((r) => r.prompt_id === prompt.id && r.surface === surface)
          .map((r) => r.run_number)
          .sort((a, b) => a - b);
        cells[surface] = runs;
        const cap = surface.startsWith("google") ? 1 : 3;
        total += cap;
        filled += Math.min(runs.length, cap);
      }
      return { prompt, cells, filled, total };
    });
  }

  putTrend(term_key: string, data_type: string, raw_json: string): void {
    const existing = this.db.trends.find((t) => t.term_key === term_key && t.data_type === data_type);
    if (existing) {
      existing.raw_json = raw_json;
      existing.fetched_at = nowIso();
    } else {
      this.db.trends.push({
        id: this.db.next.trends++,
        term_key,
        data_type,
        raw_json,
        fetched_at: nowIso(),
      });
    }
    this.persist();
  }

  listTrends() {
    return this.db.trends.slice();
  }

  putAutocomplete(term: string, raw_json: string): void {
    const existing = this.db.autocomplete.find((t) => t.term === term);
    if (existing) {
      existing.raw_json = raw_json;
      existing.fetched_at = nowIso();
    } else {
      this.db.autocomplete.push({ id: this.db.next.autocomplete++, term, raw_json, fetched_at: nowIso() });
    }
    this.persist();
  }

  listAutocomplete() {
    return this.db.autocomplete.slice();
  }
}
