import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { competitorForDomain, isTargetDomain } from "@/lib/domain";
import { chargeUnits, recordCall } from "@/lib/cost/guard";
import { getRawText, putRaw } from "@/lib/rawstore";
import type {
  AnalysisRow,
  AppConfig,
  Audience,
  JudgeJson,
  PromptRow,
  ResponseRow,
  SerpCacheRow,
  SerpEventRow,
  SerpOrganicRow,
  SourceType,
  Surface,
} from "@/lib/types";
import { hydrateConfig, type CoverageRow, type Store, type UpsertResponseInput } from "../types";
import { ensureLegacyPersonas, ensureRegion, legacyContext, type LegacyContext } from "./bootstrap";
import type { Db } from "./client";
import { readConfig, writeConfig } from "./config";
import { ImmutableViolation } from "./immutable";
import {
  citations,
  competitors,
  costLedger,
  demandSignals,
  draws,
  judgeRuns,
  mentions,
  personas,
  prompts,
  promptSetItems,
  promptSets,
  providerCache,
  serpSnapshots,
} from "./schema";

export const LEGACY_JUDGE_PROMPT_VERSION = process.env.JUDGE_PROMPT_VERSION || "legacy-v1";
const PROMINENCES = new Set(["headline", "first_paragraph", "body", "footnote_only"]);

type ResponseSqlRow = {
  id: number;
  prompt_id: number;
  surface: Surface;
  run_number: number;
  raw_text: string;
  runner: string;
  location_note: string;
  captured_at: Date;
  analyzed: boolean;
  error_flag: number | null;
};

function sourceTypeForRunner(runner: string): SourceType {
  return runner === "manual_paste" ? "manual" : "serpapi";
}

function toResponse(r: ResponseSqlRow): ResponseRow {
  return {
    id: Number(r.id),
    prompt_id: Number(r.prompt_id),
    surface: r.surface,
    run_number: Number(r.run_number),
    raw_text: r.raw_text,
    source_type: sourceTypeForRunner(r.runner),
    location_note: r.location_note,
    captured_at: new Date(r.captured_at).toISOString(),
  };
}

export function isBrandedText(text: string, aliases: string[]): boolean {
  const lower = text.toLowerCase();
  return aliases.some((alias) => {
    const a = alias.trim().toLowerCase();
    if (!a || a === "charlotte") return false;
    const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(lower);
  });
}

/** Mentions and first-seen citations derived from legacy judge JSON. Spans are null for legacy rows. */
export async function deriveFromJudge(
  db: Db,
  ctx: Pick<LegacyContext, "orgId" | "brandId">,
  judgeRunId: string,
  drawId: string,
  judge: JudgeJson,
  config: AppConfig,
): Promise<void> {
  const mentionRows: Array<typeof mentions.$inferInsert> = [];
  if (judge.brand_mentioned) {
    mentionRows.push({
      judgeRunId,
      entityType: "brand",
      entityId: ctx.brandId,
      aliasMatched: judge.brand_aliases_found?.[0] ?? null,
      listPosition: typeof judge.mention_rank === "number" ? judge.mention_rank : null,
      prominence: PROMINENCES.has(judge.mention_prominence)
        ? (judge.mention_prominence as "headline" | "first_paragraph" | "body" | "footnote_only")
        : null,
    });
  }
  const compRows = await db
    .select({ id: competitors.id, name: competitors.name })
    .from(competitors)
    .where(eq(competitors.orgId, ctx.orgId));
  const compByName = new Map(compRows.map((c) => [c.name, c.id]));
  for (const c of judge.competitors ?? []) {
    const entityId = compByName.get(c.name);
    if (!entityId) continue;
    mentionRows.push({
      judgeRunId,
      entityType: "competitor",
      entityId,
      aliasMatched: c.name,
      listPosition: typeof c.rank === "number" ? c.rank : null,
    });
  }
  if (mentionRows.length) await db.insert(mentions).values(mentionRows);

  const [existing] = await db.select({ id: citations.id }).from(citations).where(eq(citations.drawId, drawId)).limit(1);
  if (existing) return;
  const citationRows = (judge.citations ?? [])
    .filter((c) => c.domain)
    .map((c, i) => ({
      drawId,
      url: c.domain,
      canonicalUrl: null,
      domain: c.domain,
      position: i + 1,
      linked: null,
      sourceClass: (isTargetDomain(c.domain, config)
        ? "owned"
        : competitorForDomain(c.domain, config)
          ? "competitor"
          : "other") as "owned" | "competitor" | "other",
    }));
  if (citationRows.length) await db.insert(citations).values(citationRows);
}

export function parseJudgeLoose(raw: string): JudgeJson | null {
  try {
    const parsed = JSON.parse(raw) as JudgeJson;
    return typeof parsed.brand_mentioned === "boolean" ? parsed : null;
  } catch {
    return null;
  }
}

export class PgStore implements Store {
  backend = "postgres" as const;

  constructor(private db: Db) {}

  private ctx(): Promise<LegacyContext> {
    return legacyContext(this.db);
  }

  async getConfig(): Promise<AppConfig> {
    return hydrateConfig(await readConfig(this.db, await this.ctx()));
  }

  async saveConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
    await writeConfig(this.db, await this.ctx(), patch);
    return this.getConfig();
  }

  private async promptRows(where: ReturnType<typeof and>): Promise<PromptRow[]> {
    const rows = await this.db
      .select({
        seq: prompts.seq,
        text: prompts.text,
        tags: prompts.tags,
        version: prompts.version,
        status: prompts.status,
        legacyKey: personas.legacyKey,
      })
      .from(prompts)
      .leftJoin(personas, eq(personas.id, prompts.personaId))
      .where(where)
      .orderBy(asc(prompts.seq));
    return rows.map((r) => ({
      id: r.seq,
      text: r.text,
      audience: (r.legacyKey ?? "undergrad") as Audience,
      subtopics: r.tags,
      version: r.version,
      active: r.status === "approved" ? 1 : 0,
    }));
  }

  async listPrompts(opts?: { activeOnly?: boolean }): Promise<PromptRow[]> {
    const ctx = await this.ctx();
    return this.promptRows(
      opts?.activeOnly
        ? and(eq(prompts.campaignId, ctx.campaignId), eq(prompts.status, "approved"))
        : and(eq(prompts.campaignId, ctx.campaignId)),
    );
  }

  async getPrompt(id: number): Promise<PromptRow | null> {
    const ctx = await this.ctx();
    const [row] = await this.promptRows(and(eq(prompts.campaignId, ctx.campaignId), eq(prompts.seq, id)));
    return row ?? null;
  }

  private async promptUuid(seq: number): Promise<string | null> {
    const ctx = await this.ctx();
    const [row] = await this.db
      .select({ id: prompts.id })
      .from(prompts)
      .where(and(eq(prompts.campaignId, ctx.campaignId), eq(prompts.seq, seq)));
    return row?.id ?? null;
  }

  async createPrompt(input: { text: string; audience: Audience; subtopics: string[] }): Promise<PromptRow> {
    const ctx = await this.ctx();
    const personaMap = await ensureLegacyPersonas(this.db, ctx.orgId);
    const config = await this.getConfig();
    const [row] = await this.db
      .insert(prompts)
      .values({
        campaignId: ctx.campaignId,
        text: input.text,
        personaId: personaMap[input.audience] ?? null,
        provenance: "custom",
        branded: isBrandedText(input.text, config.aliases),
        status: "approved",
        tags: input.subtopics,
        version: 1,
      })
      .returning({ seq: prompts.seq });
    return (await this.getPrompt(row.seq))!;
  }

  async updatePrompt(
    id: number,
    patch: Partial<Pick<PromptRow, "text" | "audience" | "subtopics" | "active" | "version">>,
  ): Promise<PromptRow | null> {
    const ctx = await this.ctx();
    const current = await this.getPrompt(id);
    if (!current) return null;
    const set: Partial<typeof prompts.$inferInsert> = { updatedAt: new Date() };
    if (patch.text !== undefined) {
      set.text = patch.text;
      set.branded = isBrandedText(patch.text, (await this.getConfig()).aliases);
    }
    if (patch.subtopics !== undefined) set.tags = patch.subtopics;
    if (patch.version !== undefined) set.version = patch.version;
    if (patch.active !== undefined) set.status = patch.active ? "approved" : "draft";
    if (patch.audience !== undefined) {
      const personaMap = await ensureLegacyPersonas(this.db, ctx.orgId);
      set.personaId = personaMap[patch.audience] ?? null;
    }
    await this.db
      .update(prompts)
      .set(set)
      .where(and(eq(prompts.campaignId, ctx.campaignId), eq(prompts.seq, id)));
    return this.getPrompt(id);
  }

  /** Latest frozen prompt set of the campaign that contains this prompt, if any. */
  private async frozenSetFor(promptId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: promptSets.id })
      .from(promptSetItems)
      .innerJoin(promptSets, eq(promptSets.id, promptSetItems.promptSetId))
      .where(and(eq(promptSetItems.promptId, promptId), isNotNull(promptSets.frozenAt)))
      .orderBy(desc(promptSets.version))
      .limit(1);
    return row?.id ?? null;
  }

  async upsertResponses(rows: UpsertResponseInput[]): Promise<ResponseRow[]> {
    const ctx = await this.ctx();
    const planned: Array<{ input: UpsertResponseInput; promptId: string }> = [];
    const unchanged: number[] = [];
    for (const input of rows) {
      const promptId = await this.promptUuid(input.prompt_id);
      if (!promptId) throw new Error(`Unknown prompt ${input.prompt_id}`);
      const [existing] = await this.db
        .select({ seq: draws.seq, answerText: draws.answerText })
        .from(draws)
        .where(
          and(
            eq(draws.scanId, ctx.scanId),
            eq(draws.promptId, promptId),
            eq(draws.engine, input.surface),
            eq(draws.drawIndex, input.run_number),
          ),
        );
      if (existing) {
        if (existing.answerText === input.raw_text) {
          unchanged.push(existing.seq);
          continue;
        }
        throw new ImmutableViolation(
          `run ${input.run_number} of ${input.surface} for prompt ${input.prompt_id} is already captured. Stored answers are never overwritten.`,
        );
      }
      planned.push({ input, promptId });
    }

    const inserted: number[] = [];
    await this.db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as Db;
      for (const { input, promptId } of planned) {
        const regionId = await ensureRegion(tx, input.location_note);
        const rawId = await putRaw(tx, input.raw_text, "text/plain; charset=utf-8");
        const manual = input.source_type === "manual";
        const [row] = await tx
          .insert(draws)
          .values({
            scanId: ctx.scanId,
            promptId,
            promptSetId: await this.frozenSetFor(promptId),
            engine: input.surface,
            runner: manual ? "manual_paste" : "serp_provider",
            fidelity: "high",
            provider: manual ? "manual" : "serpapi",
            modelBuild: "unknown",
            regionId,
            regionHonored: "unknown",
            drawIndex: input.run_number,
            status: input.raw_text.trim() === "no AI Overview shown" ? "empty" : "ok",
            answerText: input.raw_text,
            rawPayloadId: rawId,
            costUnits: "0",
            capturedAt: new Date(),
          })
          .returning({ seq: draws.seq });
        inserted.push(row.seq);
      }
    });

    const out: ResponseRow[] = [];
    for (const seq of [...unchanged, ...inserted]) {
      const r = await this.getResponse(seq);
      if (r) out.push(r);
    }
    return out;
  }

  private responseSql(extraWhere: ReturnType<typeof sql>) {
    return sql`
      SELECT d.seq::int AS id, p.seq::int AS prompt_id, d.engine AS surface, d.draw_index AS run_number,
             d.answer_text AS raw_text, d.runner AS runner, r.label AS location_note, d.captured_at AS captured_at,
             (jr.id IS NOT NULL) AS analyzed,
             CASE WHEN jr.id IS NULL THEN NULL WHEN jr.error IS NULL THEN 0 ELSE 1 END AS error_flag
      FROM draws d
      JOIN prompts p ON p.id = d.prompt_id
      JOIN regions r ON r.id = d.region_id
      LEFT JOIN LATERAL (
        SELECT j.id, j.error FROM judge_runs j WHERE j.draw_id = d.id ORDER BY j.created_at DESC, j.seq DESC LIMIT 1
      ) jr ON true
      WHERE ${extraWhere}
      ORDER BY p.seq, d.engine::text COLLATE "C", d.draw_index`;
  }

  async listResponses(filter?: {
    prompt_id?: number;
    surface?: Surface;
    unanalyzedOnly?: boolean;
  }): Promise<Array<ResponseRow & { analyzed: boolean; error_flag: number | null }>> {
    const ctx = await this.ctx();
    const conds = [sql`d.scan_id = ${ctx.scanId}`];
    if (filter?.prompt_id) conds.push(sql`p.seq = ${filter.prompt_id}`);
    if (filter?.surface) conds.push(sql`d.engine = ${filter.surface}`);
    if (filter?.unanalyzedOnly) conds.push(sql`jr.id IS NULL`);
    const res = await this.db.execute(this.responseSql(sql.join(conds, sql` AND `)));
    return (res.rows as ResponseSqlRow[]).map((r) => ({
      ...toResponse(r),
      analyzed: Boolean(r.analyzed),
      error_flag: r.error_flag === null ? null : Number(r.error_flag),
    }));
  }

  async getResponse(id: number): Promise<ResponseRow | null> {
    const res = await this.db.execute(this.responseSql(sql`d.seq = ${id}`));
    const row = (res.rows as ResponseSqlRow[])[0];
    return row ? toResponse(row) : null;
  }

  private toAnalysis(row: typeof judgeRuns.$inferSelect, drawSeq: number): AnalysisRow {
    return {
      id: row.seq,
      response_id: drawSeq,
      judge_json: row.rawOutput,
      judge_model: row.judgeModel,
      analyzed_at: row.createdAt.toISOString(),
      error_flag: row.error === null ? 0 : 1,
      manual_override: row.manualOverride === null ? 0 : 1,
    };
  }

  async upsertAnalysis(input: {
    response_id: number;
    judge_json: string;
    judge_model: string;
    error_flag: boolean;
    manual_override?: boolean;
    repair_used?: boolean;
  }): Promise<AnalysisRow> {
    const ctx = await this.ctx();
    const [draw] = await this.db.select({ id: draws.id }).from(draws).where(eq(draws.seq, input.response_id));
    if (!draw) throw new Error(`Unknown response ${input.response_id}`);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(input.judge_json);
    } catch {
      parsed = null;
    }
    const errorText = input.error_flag
      ? String((parsed as { error?: string } | null)?.error ?? ((parsed as { parse_error?: boolean } | null)?.parse_error ? "parse_error" : "judge_error"))
      : null;
    const [row] = await this.db
      .insert(judgeRuns)
      .values({
        drawId: draw.id,
        judgeModel: input.judge_model,
        judgePromptVersion: LEGACY_JUDGE_PROMPT_VERSION,
        rawOutput: input.judge_json,
        parsed: parsed as object | null,
        repairUsed: Boolean(input.repair_used),
        error: errorText,
        manualOverride: input.manual_override ? (parsed as object) : null,
      })
      .returning();
    const judge = input.error_flag ? null : parseJudgeLoose(input.judge_json);
    if (judge) await deriveFromJudge(this.db, ctx, row.id, draw.id, judge, await this.getConfig());
    return this.toAnalysis(row, input.response_id);
  }

  async getAnalysisByResponse(response_id: number): Promise<AnalysisRow | null> {
    const [row] = await this.db
      .select({ run: judgeRuns })
      .from(judgeRuns)
      .innerJoin(draws, eq(draws.id, judgeRuns.drawId))
      .where(eq(draws.seq, response_id))
      .orderBy(desc(judgeRuns.createdAt), desc(judgeRuns.seq))
      .limit(1);
    return row ? this.toAnalysis(row.run, response_id) : null;
  }

  async listAnalyses(): Promise<AnalysisRow[]> {
    const ctx = await this.ctx();
    const rows = await this.db
      .select({ run: judgeRuns, drawSeq: draws.seq })
      .from(judgeRuns)
      .innerJoin(draws, eq(draws.id, judgeRuns.drawId))
      .where(eq(draws.scanId, ctx.scanId))
      .orderBy(asc(judgeRuns.seq));
    const latest = new Map<number, AnalysisRow>();
    for (const r of rows) latest.set(r.drawSeq, this.toAnalysis(r.run, r.drawSeq));
    return Array.from(latest.values()).sort((a, b) => a.id - b.id);
  }

  async getSerpCache(paramsHash: string): Promise<SerpCacheRow | null> {
    const [row] = await this.db
      .select()
      .from(providerCache)
      .where(and(eq(providerCache.provider, "serpapi"), eq(providerCache.paramsHash, paramsHash)))
      .orderBy(desc(providerCache.createdAt))
      .limit(1);
    if (!row) return null;
    const raw = await getRawText(this.db, row.rawPayloadId);
    if (raw === null) return null;
    return {
      id: 0,
      engine: row.engine,
      params_hash: row.paramsHash,
      params_json: JSON.stringify(row.params),
      raw_json: raw,
      credits_charged: Number(row.units),
      created_at: row.createdAt.toISOString(),
    };
  }

  async putSerpCache(input: {
    engine: string;
    params_hash: string;
    params_json: string;
    raw_json: string;
    credits_charged: number;
  }): Promise<SerpCacheRow> {
    const rawId = await putRaw(this.db, input.raw_json, "application/json");
    await this.db.insert(providerCache).values({
      provider: "serpapi",
      engine: input.engine,
      paramsHash: input.params_hash,
      params: JSON.parse(input.params_json),
      rawPayloadId: rawId,
      units: String(input.credits_charged),
    });
    return (await this.getSerpCache(input.params_hash))!;
  }

  private organicFromRow(promptSeq: number, organic: Record<string, unknown>, fetchedAt: Date): SerpOrganicRow {
    return {
      id: promptSeq,
      prompt_id: promptSeq,
      target_ranked: Number(organic.target_ranked ?? 0),
      target_position: (organic.target_position as number | null) ?? null,
      competitor_domains: JSON.stringify(organic.competitor_domains ?? []),
      paa: JSON.stringify(organic.paa ?? []),
      related_searches: JSON.stringify(organic.related_searches ?? []),
      aio_shown: organic.aio_shown === null || organic.aio_shown === undefined ? null : Number(organic.aio_shown),
      fetched_at: fetchedAt.toISOString(),
    };
  }

  async upsertOrganic(input: Omit<SerpOrganicRow, "id">): Promise<SerpOrganicRow> {
    const ctx = await this.ctx();
    const [prompt] = await this.db
      .select({ id: prompts.id, text: prompts.text })
      .from(prompts)
      .where(and(eq(prompts.campaignId, ctx.campaignId), eq(prompts.seq, input.prompt_id)));
    if (!prompt) throw new Error(`Unknown prompt ${input.prompt_id}`);
    await this.db.insert(serpSnapshots).values({
      query: prompt.text,
      promptId: prompt.id,
      engine: "google",
      fetchedAt: new Date(input.fetched_at),
      organic: {
        target_ranked: input.target_ranked,
        target_position: input.target_position,
        competitor_domains: JSON.parse(input.competitor_domains),
        paa: JSON.parse(input.paa),
        related_searches: JSON.parse(input.related_searches),
        aio_shown: input.aio_shown,
      },
    });
    return (await this.getOrganic(input.prompt_id))!;
  }

  async getOrganic(prompt_id: number): Promise<SerpOrganicRow | null> {
    const ctx = await this.ctx();
    const [row] = await this.db
      .select({ organic: serpSnapshots.organic, fetchedAt: serpSnapshots.fetchedAt })
      .from(serpSnapshots)
      .innerJoin(prompts, eq(prompts.id, serpSnapshots.promptId))
      .where(and(eq(prompts.campaignId, ctx.campaignId), eq(prompts.seq, prompt_id)))
      .orderBy(desc(serpSnapshots.createdAt))
      .limit(1);
    return row ? this.organicFromRow(prompt_id, row.organic as Record<string, unknown>, row.fetchedAt) : null;
  }

  async listOrganic(): Promise<SerpOrganicRow[]> {
    const ctx = await this.ctx();
    const rows = await this.db
      .select({ seq: prompts.seq, organic: serpSnapshots.organic, fetchedAt: serpSnapshots.fetchedAt })
      .from(serpSnapshots)
      .innerJoin(prompts, eq(prompts.id, serpSnapshots.promptId))
      .where(eq(prompts.campaignId, ctx.campaignId))
      .orderBy(asc(prompts.seq), asc(serpSnapshots.createdAt));
    const latest = new Map<number, SerpOrganicRow>();
    for (const r of rows) latest.set(r.seq, this.organicFromRow(r.seq, r.organic as Record<string, unknown>, r.fetchedAt));
    return Array.from(latest.values());
  }

  async logSerpEvent(input: Omit<SerpEventRow, "id">): Promise<void> {
    const ctx = await this.ctx();
    const promptId = input.prompt_id ? await this.promptUuid(input.prompt_id) : null;
    await recordCall(this.db, {
      orgId: ctx.orgId,
      provider: "serpapi",
      units: input.credits_charged,
      ok: Boolean(input.ok),
      cached: Boolean(input.cached),
      engine: input.engine,
      paramsHash: input.params_hash,
      error: input.error,
      promptId,
      at: new Date(input.created_at),
    });
  }

  async listSerpEvents(limit = 50): Promise<SerpEventRow[]> {
    const ctx = await this.ctx();
    const rows = await this.db
      .select({ ledger: costLedger, promptSeq: prompts.seq })
      .from(costLedger)
      .leftJoin(prompts, eq(prompts.id, costLedger.promptId))
      .where(and(eq(costLedger.orgId, ctx.orgId), eq(costLedger.provider, "serpapi")))
      .orderBy(desc(costLedger.at), desc(costLedger.createdAt))
      .limit(limit);
    return rows.map((r, i) => ({
      id: rows.length - i,
      created_at: r.ledger.at.toISOString(),
      engine: r.ledger.engine,
      ok: r.ledger.ok ? 1 : 0,
      cached: r.ledger.cached ? 1 : 0,
      credits_charged: Number(r.ledger.units),
      error: r.ledger.error,
      prompt_id: r.promptSeq ?? null,
      params_hash: r.ledger.paramsHash,
    }));
  }

  async chargeCredits(n: number): Promise<AppConfig> {
    const ctx = await this.ctx();
    await chargeUnits(this.db, ctx.orgId, "serpapi", n);
    return this.getConfig();
  }

  async coverage(): Promise<CoverageRow[]> {
    const ctx = await this.ctx();
    const promptList = await this.listPrompts();
    const res = await this.db.execute(sql`
      SELECT p.seq::int AS prompt_id, d.engine AS surface, d.draw_index AS run_number
      FROM draws d JOIN prompts p ON p.id = d.prompt_id
      WHERE d.scan_id = ${ctx.scanId}`);
    const map = new Map<string, Set<number>>();
    for (const r of res.rows as Array<{ prompt_id: number; surface: string; run_number: number }>) {
      const key = `${r.prompt_id}::${r.surface}`;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(Number(r.run_number));
    }
    const surfaces = ["chatgpt", "gemini", "claude", "perplexity", "google_aio", "google_ai_mode"];
    return promptList.map((prompt) => {
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

  private async putSignal(source: "google_trends" | "autocomplete", term: string, value: object, rawJson: string) {
    const ctx = await this.ctx();
    const rawId = await putRaw(this.db, rawJson, "application/json");
    await this.db.insert(demandSignals).values({
      campaignId: ctx.campaignId,
      source,
      term,
      value,
      rawPayloadId: rawId,
      fetchedAt: new Date(),
    });
  }

  private async latestSignals(source: "google_trends" | "autocomplete") {
    const ctx = await this.ctx();
    const rows = await this.db
      .select()
      .from(demandSignals)
      .where(and(eq(demandSignals.campaignId, ctx.campaignId), eq(demandSignals.source, source)))
      .orderBy(asc(demandSignals.fetchedAt), asc(demandSignals.createdAt));
    const byKey = new Map<string, { order: number; row: (typeof rows)[number] }>();
    rows.forEach((row) => {
      const v = (row.value ?? {}) as { data_type?: string };
      const key = `${row.term}::${v.data_type ?? ""}`;
      const prev = byKey.get(key);
      byKey.set(key, { order: prev?.order ?? byKey.size + 1, row });
    });
    const out: Array<{ id: number; row: (typeof rows)[number]; raw: string }> = [];
    for (const { order, row } of Array.from(byKey.values()).sort((a, b) => a.order - b.order)) {
      out.push({ id: order, row, raw: row.rawPayloadId ? ((await getRawText(this.db, row.rawPayloadId)) ?? "") : "" });
    }
    return out;
  }

  async putTrend(term_key: string, data_type: string, raw_json: string): Promise<void> {
    await this.putSignal("google_trends", term_key, { data_type }, raw_json);
  }

  async listTrends() {
    return (await this.latestSignals("google_trends")).map(({ id, row, raw }) => ({
      id,
      term_key: row.term,
      data_type: String((row.value as { data_type?: string } | null)?.data_type ?? ""),
      raw_json: raw,
      fetched_at: row.fetchedAt.toISOString(),
    }));
  }

  async putAutocomplete(term: string, raw_json: string): Promise<void> {
    await this.putSignal("autocomplete", term, {}, raw_json);
  }

  async listAutocomplete() {
    return (await this.latestSignals("autocomplete")).map(({ id, row, raw }) => ({
      id,
      term: row.term,
      raw_json: raw,
      fetched_at: row.fetchedAt.toISOString(),
    }));
  }
}