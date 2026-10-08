import fs from "fs";
import path from "path";
import { SCHEMA_SQL } from "./schema";
import {
  dataDir,
  defaultSeedConfig,
  hydrateConfig,
  parsePrompt,
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

type SqliteDatabase = {
  pragma(src: string): unknown;
  exec(src: string): unknown;
  prepare(src: string): {
    get: (...args: unknown[]) => unknown;
    all: (...args: unknown[]) => unknown[];
    run: (...args: unknown[]) => { lastInsertRowid: number | bigint };
  };
  // better-sqlite3 transaction wraps a function of any arity.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction: (fn: (...args: any[]) => unknown) => (...args: any[]) => unknown;
};

type SqliteCtor = new (filename: string) => SqliteDatabase;

export function tryOpenSqlite(): Store | null {
  let DatabaseCtor: SqliteCtor;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    DatabaseCtor = require("better-sqlite3");
  } catch {
    return null;
  }
  const file = path.join(dataDir(), "tracker.db");
  let db: SqliteDatabase;
  try {
    db = new DatabaseCtor(file);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA_SQL);
  } catch (err) {
    console.warn("[db] better-sqlite3 opened then failed; falling back to JSON.", err);
    return null;
  }
  return new SqliteStore(db);
}

class SqliteStore implements Store {
  backend = "sqlite" as const;
  constructor(private db: SqliteDatabase) {
    this.ensureSeed();
  }

  private ensureSeed() {
    const cfg = this.db.prepare("SELECT COUNT(*) AS n FROM config").get() as { n: number };
    if (cfg.n === 0) {
      this.db.prepare("INSERT INTO config (id, payload) VALUES (1, ?)").run(JSON.stringify(defaultSeedConfig()));
    } else {
      const row = this.db.prepare("SELECT payload FROM config WHERE id = 1").get() as { payload: string };
      const hydrated = hydrateConfig(JSON.parse(row.payload) as AppConfig);
      this.db.prepare("UPDATE config SET payload = ? WHERE id = 1").run(JSON.stringify(hydrated));
    }
    const prompts = this.db.prepare("SELECT COUNT(*) AS n FROM prompts").get() as { n: number };
    if (prompts.n === 0) {
      const insert = this.db.prepare(
        "INSERT INTO prompts (text, audience, subtopics, version, active) VALUES (?, ?, ?, ?, ?)",
      );
      const tx = this.db.transaction(() => {
        for (const p of seedPromptRows()) {
          insert.run(p.text, p.audience, JSON.stringify(p.subtopics), p.version, p.active);
        }
      });
      tx();
    }
  }

  getConfig(): AppConfig {
    const row = this.db.prepare("SELECT payload FROM config WHERE id = 1").get() as { payload: string };
    return hydrateConfig(JSON.parse(row.payload) as AppConfig);
  }

  saveConfig(patch: Partial<AppConfig>): AppConfig {
    const next = { ...this.getConfig(), ...patch };
    this.db.prepare("UPDATE config SET payload = ? WHERE id = 1").run(JSON.stringify(next));
    return next;
  }

  listPrompts(opts?: { activeOnly?: boolean }): PromptRow[] {
    const rows = opts?.activeOnly
      ? (this.db.prepare("SELECT * FROM prompts WHERE active = 1 ORDER BY id").all() as Array<Parameters<typeof parsePrompt>[0]>)
      : (this.db.prepare("SELECT * FROM prompts ORDER BY id").all() as Array<Parameters<typeof parsePrompt>[0]>);
    return rows.map(parsePrompt);
  }

  getPrompt(id: number): PromptRow | null {
    const row = this.db.prepare("SELECT * FROM prompts WHERE id = ?").get(id) as Parameters<typeof parsePrompt>[0] | undefined;
    return row ? parsePrompt(row) : null;
  }

  createPrompt(input: { text: string; audience: Audience; subtopics: string[] }): PromptRow {
    const info = this.db
      .prepare("INSERT INTO prompts (text, audience, subtopics, version, active) VALUES (?, ?, ?, 1, 1)")
      .run(input.text, input.audience, JSON.stringify(input.subtopics));
    return this.getPrompt(Number(info.lastInsertRowid))!;
  }

  updatePrompt(
    id: number,
    patch: Partial<Pick<PromptRow, "text" | "audience" | "subtopics" | "active" | "version">>,
  ): PromptRow | null {
    const current = this.getPrompt(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    this.db
      .prepare("UPDATE prompts SET text = ?, audience = ?, subtopics = ?, version = ?, active = ? WHERE id = ?")
      .run(next.text, next.audience, JSON.stringify(next.subtopics), next.version, next.active, id);
    return this.getPrompt(id);
  }

  upsertResponses(rows: UpsertResponseInput[]): ResponseRow[] {
    const stmt = this.db.prepare(`
      INSERT INTO responses (prompt_id, surface, run_number, raw_text, source_type, location_note, captured_at)
      VALUES (@prompt_id, @surface, @run_number, @raw_text, @source_type, @location_note, @captured_at)
      ON CONFLICT(prompt_id, surface, run_number) DO UPDATE SET
        raw_text = excluded.raw_text,
        source_type = excluded.source_type,
        location_note = excluded.location_note,
        captured_at = excluded.captured_at
    `);
    const captured_at = nowIso();
    const tx = this.db.transaction((batch: UpsertResponseInput[]) => {
      for (const row of batch) {
        stmt.run({ ...row, captured_at });
      }
    });
    tx(rows);
    return rows.map((r) => this.findResponse(r.prompt_id, r.surface, r.run_number)!);
  }

  private findResponse(prompt_id: number, surface: Surface, run_number: number): ResponseRow | null {
    return (this.db
      .prepare("SELECT * FROM responses WHERE prompt_id = ? AND surface = ? AND run_number = ?")
      .get(prompt_id, surface, run_number) as ResponseRow | undefined) ?? null;
  }

  listResponses(filter?: {
    prompt_id?: number;
    surface?: Surface;
    unanalyzedOnly?: boolean;
  }): Array<ResponseRow & { analyzed: boolean; error_flag: number | null }> {
    let sql = `
      SELECT r.*,
        CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS analyzed,
        a.error_flag AS error_flag
      FROM responses r
      LEFT JOIN analyses a ON a.response_id = r.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (filter?.prompt_id) {
      sql += " AND r.prompt_id = ?";
      params.push(filter.prompt_id);
    }
    if (filter?.surface) {
      sql += " AND r.surface = ?";
      params.push(filter.surface);
    }
    if (filter?.unanalyzedOnly) sql += " AND a.id IS NULL";
    sql += " ORDER BY r.prompt_id, r.surface, r.run_number";
    const rows = this.db.prepare(sql).all(...params) as Array<
      ResponseRow & { analyzed: number; error_flag: number | null }
    >;
    return rows.map((r) => ({ ...r, analyzed: Boolean(r.analyzed) }));
  }

  getResponse(id: number): ResponseRow | null {
    return (this.db.prepare("SELECT * FROM responses WHERE id = ?").get(id) as ResponseRow | undefined) ?? null;
  }

  upsertAnalysis(input: {
    response_id: number;
    judge_json: string;
    judge_model: string;
    error_flag: boolean;
    manual_override?: boolean;
  }): AnalysisRow {
    const analyzed_at = nowIso();
    this.db
      .prepare(
        `
      INSERT INTO analyses (response_id, judge_json, judge_model, analyzed_at, error_flag, manual_override)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(response_id) DO UPDATE SET
        judge_json = excluded.judge_json,
        judge_model = excluded.judge_model,
        analyzed_at = excluded.analyzed_at,
        error_flag = excluded.error_flag,
        manual_override = excluded.manual_override
    `,
      )
      .run(
        input.response_id,
        input.judge_json,
        input.judge_model,
        analyzed_at,
        input.error_flag ? 1 : 0,
        input.manual_override ? 1 : 0,
      );
    return this.getAnalysisByResponse(input.response_id)!;
  }

  getAnalysisByResponse(response_id: number): AnalysisRow | null {
    return (
      (this.db.prepare("SELECT * FROM analyses WHERE response_id = ?").get(response_id) as AnalysisRow | undefined) ??
      null
    );
  }

  listAnalyses(): AnalysisRow[] {
    return this.db.prepare("SELECT * FROM analyses ORDER BY id").all() as AnalysisRow[];
  }

  getSerpCache(paramsHash: string): SerpCacheRow | null {
    return (
      (this.db.prepare("SELECT * FROM serp_cache WHERE params_hash = ?").get(paramsHash) as SerpCacheRow | undefined) ??
      null
    );
  }

  putSerpCache(input: {
    engine: string;
    params_hash: string;
    params_json: string;
    raw_json: string;
    credits_charged: number;
  }): SerpCacheRow {
    this.db
      .prepare(
        `
      INSERT INTO serp_cache (engine, params_hash, params_json, raw_json, credits_charged, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(params_hash) DO UPDATE SET
        raw_json = excluded.raw_json,
        credits_charged = excluded.credits_charged
    `,
      )
      .run(input.engine, input.params_hash, input.params_json, input.raw_json, input.credits_charged, nowIso());
    return this.getSerpCache(input.params_hash)!;
  }

  upsertOrganic(input: Omit<SerpOrganicRow, "id">): SerpOrganicRow {
    this.db
      .prepare(
        `
      INSERT INTO serp_organic (prompt_id, target_ranked, target_position, competitor_domains, paa, related_searches, aio_shown, fetched_at)
      VALUES (@prompt_id, @target_ranked, @target_position, @competitor_domains, @paa, @related_searches, @aio_shown, @fetched_at)
      ON CONFLICT(prompt_id) DO UPDATE SET
        target_ranked = excluded.target_ranked,
        target_position = excluded.target_position,
        competitor_domains = excluded.competitor_domains,
        paa = excluded.paa,
        related_searches = excluded.related_searches,
        aio_shown = excluded.aio_shown,
        fetched_at = excluded.fetched_at
    `,
      )
      .run(input);
    return this.getOrganic(input.prompt_id)!;
  }

  getOrganic(prompt_id: number): SerpOrganicRow | null {
    return (
      (this.db.prepare("SELECT * FROM serp_organic WHERE prompt_id = ?").get(prompt_id) as SerpOrganicRow | undefined) ??
      null
    );
  }

  listOrganic(): SerpOrganicRow[] {
    return this.db.prepare("SELECT * FROM serp_organic ORDER BY prompt_id").all() as SerpOrganicRow[];
  }

  logSerpEvent(input: Omit<SerpEventRow, "id">): void {
    this.db
      .prepare(
        `
      INSERT INTO serp_events (created_at, engine, ok, cached, credits_charged, error, prompt_id, params_hash)
      VALUES (@created_at, @engine, @ok, @cached, @credits_charged, @error, @prompt_id, @params_hash)
    `,
      )
      .run(input);
  }

  listSerpEvents(limit = 50): SerpEventRow[] {
    return this.db.prepare("SELECT * FROM serp_events ORDER BY id DESC LIMIT ?").all(limit) as SerpEventRow[];
  }

  chargeCredits(n: number): AppConfig {
    const cfg = this.getConfig();
    if (n <= 0) return cfg;
    return this.saveConfig({ serpapi_credits_remaining: cfg.serpapi_credits_remaining - n });
  }

  coverage(): CoverageRow[] {
    const prompts = this.listPrompts();
    const responses = this.db.prepare("SELECT prompt_id, surface, run_number FROM responses").all() as Array<{
      prompt_id: number;
      surface: string;
      run_number: number;
    }>;
    const map = new Map<string, Set<number>>();
    for (const r of responses) {
      const key = `${r.prompt_id}::${r.surface}`;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(r.run_number);
    }
    const surfaces = ["chatgpt", "gemini", "claude", "perplexity", "google_aio", "google_ai_mode"];
    return prompts.map((prompt) => {
      const cells: Record<string, number[]> = {};
      let filled = 0;
      let total = 0;
      for (const surface of surfaces) {
        const runs = Array.from(map.get(`${prompt.id}::${surface}`) ?? []).sort((a, b) => a - b);
        cells[surface] = runs;
        const cap = surface.startsWith("google") ? 1 : 3;
        total += cap;
        filled += Math.min(runs.length, cap);
      }
      return { prompt, cells, filled, total };
    });
  }

  putTrend(term_key: string, data_type: string, raw_json: string): void {
    this.db
      .prepare(
        `
      INSERT INTO trends (term_key, data_type, raw_json, fetched_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(term_key, data_type) DO UPDATE SET raw_json = excluded.raw_json, fetched_at = excluded.fetched_at
    `,
      )
      .run(term_key, data_type, raw_json, nowIso());
  }

  listTrends() {
    return this.db.prepare("SELECT * FROM trends ORDER BY id").all() as Array<{
      id: number;
      term_key: string;
      data_type: string;
      raw_json: string;
      fetched_at: string;
    }>;
  }

  putAutocomplete(term: string, raw_json: string): void {
    this.db
      .prepare(
        `
      INSERT INTO autocomplete (term, raw_json, fetched_at)
      VALUES (?, ?, ?)
      ON CONFLICT(term) DO UPDATE SET raw_json = excluded.raw_json, fetched_at = excluded.fetched_at
    `,
      )
      .run(term, raw_json, nowIso());
  }

  listAutocomplete() {
    return this.db.prepare("SELECT * FROM autocomplete ORDER BY id").all() as Array<{
      id: number;
      term: string;
      raw_json: string;
      fetched_at: string;
    }>;
  }
}

export function sqliteFileExists(): boolean {
  return fs.existsSync(path.join(dataDir(), "tracker.db"));
}
