import crypto from "crypto";
import fs from "fs";
import Database from "better-sqlite3";
import os from "os";
import path from "path";
import { and, count, eq, sql } from "drizzle-orm";
import type { AppConfig, JudgeJson } from "../lib/types";
import { ensureLegacyPersonas, ensureRegion, legacyContext, DEFAULT_ORG_SLUG } from "../lib/db/pg/bootstrap";
import { closeDb, getDb, type Db } from "../lib/db/pg/client";
import { readConfig, writeConfig, type CampaignSettings } from "../lib/db/pg/config";
import {
  campaignEngines,
  campaignPersonas,
  campaignRegions,
  campaigns,
  costLedger,
  demandSignals,
  draws,
  judgeRuns,
  organizations,
  prompts,
  providerCache,
  recommendations,
  scans,
  serpSnapshots,
} from "../lib/db/pg/schema";
import { deriveFromJudge, isBrandedText, LEGACY_JUDGE_PROMPT_VERSION, parseJudgeLoose } from "../lib/db/pg/store";
import { freezePromptSet } from "../lib/promptSets";
import { putRaw } from "../lib/rawstore";
import { loadEnv } from "./env";

type Row = Record<string, unknown>;
type LegacyData = {
  prompts: Row[];
  responses: Row[];
  analyses: Row[];
  serp_cache: Row[];
  serp_organic: Row[];
  trends: Row[];
  autocomplete: Row[];
  config: Row[];
  serp_events: Row[];
  recommendations: Row[];
};
const TABLES: Array<keyof LegacyData> = [
  "prompts",
  "responses",
  "analyses",
  "serp_cache",
  "serp_organic",
  "trends",
  "autocomplete",
  "config",
  "serp_events",
  "recommendations",
];

export type TableReport = { legacy: string; target: string; source: number; target_count: number | null };
export type MigrationReport = {
  mode: "dry-run" | "apply";
  status: "planned" | "migrated" | "already-migrated" | "refused";
  message: string;
  source_sha256: string;
  tables: TableReport[];
  ok: boolean;
};

const TARGET_OF: Record<keyof LegacyData, string> = {
  prompts: "prompts",
  responses: "draws",
  analyses: "judge_runs",
  serp_cache: "provider_cache",
  serp_organic: "serp_snapshots",
  trends: "demand_signals (google_trends)",
  autocomplete: "demand_signals (autocomplete)",
  config: "brands (config split across brand, aliases, competitors, facts, campaign settings)",
  serp_events: "cost_ledger",
  recommendations: "recommendations",
};

function fileSha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Reads a temporary copy of the SQLite database so the original is never opened for writing. */
export function readLegacy(sqlitePath: string): LegacyData {
  if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite file not found: ${sqlitePath}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-migrate-"));
  const copy = path.join(dir, "tracker.db");
  fs.copyFileSync(sqlitePath, copy);
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(sqlitePath + suffix)) fs.copyFileSync(sqlitePath + suffix, copy + suffix);
  }
  const db = new Database(copy);
  try {
    const out = {} as LegacyData;
    for (const t of TABLES) {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
      out[t] = exists ? (db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all() as Row[]) : [];
    }
    return out;
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function findMigratedCampaign(db: Db) {
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, DEFAULT_ORG_SLUG));
  if (!org) return { org: null, campaign: null };
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.orgId, org.id), sql`${campaigns.settings}->>'legacy' = 'true'`))
    .limit(1);
  return { org, campaign: campaign ?? null };
}

async function targetCounts(db: Db): Promise<Record<keyof LegacyData, number | null>> {
  const { org, campaign } = await findMigratedCampaign(db);
  const empty = Object.fromEntries(TABLES.map((t) => [t, null])) as Record<keyof LegacyData, number | null>;
  if (!org || !campaign) return empty;
  const [scan] = await db.select().from(scans).where(eq(scans.campaignId, campaign.id)).limit(1);
  const one = async (q: Promise<Array<{ n: number }>>) => (await q)[0]?.n ?? 0;
  const drawIds = scan
    ? sql`(SELECT id FROM draws WHERE scan_id = ${scan.id})`
    : sql`(SELECT NULL::uuid)`;
  return {
    prompts: await one(db.select({ n: count() }).from(prompts).where(eq(prompts.campaignId, campaign.id))),
    responses: scan ? await one(db.select({ n: count() }).from(draws).where(eq(draws.scanId, scan.id))) : 0,
    analyses: await one(db.select({ n: count() }).from(judgeRuns).where(sql`${judgeRuns.drawId} IN ${drawIds}`)),
    serp_cache: await one(db.select({ n: count() }).from(providerCache).where(eq(providerCache.provider, "serpapi"))),
    serp_organic: await one(
      db
        .select({ n: count() })
        .from(serpSnapshots)
        .where(sql`${serpSnapshots.promptId} IN (SELECT id FROM prompts WHERE campaign_id = ${campaign.id})`),
    ),
    trends: await one(
      db
        .select({ n: count() })
        .from(demandSignals)
        .where(and(eq(demandSignals.campaignId, campaign.id), eq(demandSignals.source, "google_trends"))),
    ),
    autocomplete: await one(
      db
        .select({ n: count() })
        .from(demandSignals)
        .where(and(eq(demandSignals.campaignId, campaign.id), eq(demandSignals.source, "autocomplete"))),
    ),
    config: 1,
    serp_events: await one(
      db
        .select({ n: count() })
        .from(costLedger)
        .where(and(eq(costLedger.orgId, org.id), eq(costLedger.provider, "serpapi"))),
    ),
    recommendations: await one(
      db.select({ n: count() }).from(recommendations).where(eq(recommendations.campaignId, campaign.id)),
    ),
  };
}

function report(
  mode: MigrationReport["mode"],
  status: MigrationReport["status"],
  message: string,
  sha: string,
  legacy: LegacyData,
  target: Record<keyof LegacyData, number | null>,
): MigrationReport {
  const tables = TABLES.map((t) => ({
    legacy: t,
    target: TARGET_OF[t],
    source: legacy[t].length,
    target_count: target[t],
  }));
  const ok =
    status === "planned" || status === "refused"
      ? status === "planned"
      : tables.every((r) => r.target_count === r.source);
  return { mode, status, message, source_sha256: sha, tables, ok };
}

const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const n = (v: unknown) => Number(v);

export async function migrateSqlite(
  db: Db,
  sqlitePath: string,
  opts: { apply: boolean },
): Promise<MigrationReport> {
  const legacy = readLegacy(sqlitePath);
  const sha = fileSha256(sqlitePath);
  const mode = opts.apply ? "apply" : "dry-run";

  const existing = await findMigratedCampaign(db);
  const settings = (existing.campaign?.settings ?? {}) as CampaignSettings;
  if (settings.migrated_from_sqlite) {
    return report(
      mode,
      "already-migrated",
      `Already migrated at ${settings.migrated_from_sqlite.at}. Nothing changed.`,
      sha,
      legacy,
      await targetCounts(db),
    );
  }
  if (existing.campaign) {
    const [{ c }] = await db.select({ c: count() }).from(prompts).where(eq(prompts.campaignId, existing.campaign.id));
    if (c > 0) {
      return report(
        mode,
        "refused",
        "The Energy campaign already has prompts that did not come from this migration. Migrate into an empty database.",
        sha,
        legacy,
        await targetCounts(db),
      );
    }
  }
  if (!opts.apply) {
    return report(mode, "planned", "Dry run. Nothing was written. Re-run with --apply.", sha, legacy, await targetCounts(db));
  }

  const ctx = await legacyContext(db);
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const cfgRow = legacy.config[0];
    if (cfgRow) await writeConfig(tx, ctx, JSON.parse(String(cfgRow.payload)) as AppConfig);
    const config = await readConfig(tx, ctx);
    const personaMap = await ensureLegacyPersonas(tx, ctx.orgId);

    const regionByNote = new Map<string, string>();
    for (const r of legacy.responses) {
      const note = String(r.location_note);
      if (!regionByNote.has(note)) regionByNote.set(note, await ensureRegion(tx, note));
    }

    const promptUuid = new Map<number, string>();
    for (const p of legacy.prompts) {
      const [row] = await tx
        .insert(prompts)
        .values({
          seq: n(p.id),
          campaignId: ctx.campaignId,
          text: String(p.text),
          personaId: personaMap[String(p.audience)] ?? null,
          provenance: "synthesized",
          branded: isBrandedText(String(p.text), config.aliases),
          status: n(p.active) === 1 ? "approved" : "draft",
          tags: JSON.parse(String(p.subtopics)) as string[],
          version: n(p.version),
        })
        .returning({ id: prompts.id });
      promptUuid.set(n(p.id), row.id);
    }

    let setId: string | null = null;
    const activeIds = new Set(legacy.prompts.filter((p) => n(p.active) === 1).map((p) => n(p.id)));
    if (activeIds.size) {
      const frozen = await freezePromptSet(tx, ctx.orgId, ctx.campaignId);
      setId = frozen.set.id;
      await tx.update(scans).set({ promptSetId: setId }).where(eq(scans.id, ctx.scanId));
    }

    const drawUuid = new Map<number, string>();
    for (const r of legacy.responses) {
      const raw = String(r.raw_text);
      const rawId = await putRaw(tx, raw, "text/plain; charset=utf-8");
      const manual = r.source_type === "manual";
      const [row] = await tx
        .insert(draws)
        .values({
          seq: n(r.id),
          scanId: ctx.scanId,
          promptId: promptUuid.get(n(r.prompt_id))!,
          promptSetId: activeIds.has(n(r.prompt_id)) ? setId : null,
          engine: String(r.surface) as typeof draws.$inferInsert.engine,
          runner: manual ? "manual_paste" : "serp_provider",
          fidelity: "high",
          provider: manual ? "manual" : "serpapi",
          modelBuild: "unknown",
          regionId: regionByNote.get(String(r.location_note))!,
          regionHonored: "unknown",
          drawIndex: n(r.run_number),
          status: raw.trim() === "no AI Overview shown" ? "empty" : "ok",
          answerText: raw,
          rawPayloadId: rawId,
          costUnits: "0",
          capturedAt: new Date(String(r.captured_at)),
        })
        .returning({ id: draws.id });
      drawUuid.set(n(r.id), row.id);
    }

    for (const a of legacy.analyses) {
      const drawId = drawUuid.get(n(a.response_id));
      if (!drawId) throw new Error(`analysis ${a.id} points at missing response ${a.response_id}`);
      const judgeJson = String(a.judge_json);
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(judgeJson);
      } catch {
        parsed = null;
      }
      const errorFlag = n(a.error_flag) === 1;
      const [row] = await tx
        .insert(judgeRuns)
        .values({
          seq: n(a.id),
          drawId,
          judgeModel: String(a.judge_model),
          judgePromptVersion: LEGACY_JUDGE_PROMPT_VERSION,
          rawOutput: judgeJson,
          parsed: parsed as object | null,
          repairUsed: false,
          error: errorFlag ? "legacy error flag" : null,
          manualOverride: n(a.manual_override) === 1 ? (parsed as object) : null,
          createdAt: new Date(String(a.analyzed_at)),
        })
        .returning({ id: judgeRuns.id });
      const judge: JudgeJson | null = errorFlag ? null : parseJudgeLoose(judgeJson);
      if (judge) await deriveFromJudge(tx, ctx, row.id, drawId, judge, config);
    }

    for (const c of legacy.serp_cache) {
      const rawId = await putRaw(tx, String(c.raw_json), "application/json");
      await tx.insert(providerCache).values({
        provider: "serpapi",
        engine: String(c.engine),
        paramsHash: String(c.params_hash),
        params: JSON.parse(String(c.params_json)),
        rawPayloadId: rawId,
        units: String(n(c.credits_charged)),
        createdAt: new Date(String(c.created_at)),
      });
    }

    for (const e of legacy.serp_events) {
      await tx.insert(costLedger).values({
        orgId: ctx.orgId,
        provider: "serpapi",
        units: String(n(e.credits_charged)),
        usd: null,
        at: new Date(String(e.created_at)),
        engine: s(e.engine),
        paramsHash: s(e.params_hash),
        ok: n(e.ok) === 1,
        cached: n(e.cached) === 1,
        error: s(e.error),
        promptId: e.prompt_id === null || e.prompt_id === undefined ? null : (promptUuid.get(n(e.prompt_id)) ?? null),
        createdAt: new Date(String(e.created_at)),
      });
    }

    for (const o of legacy.serp_organic) {
      const promptId = promptUuid.get(n(o.prompt_id))!;
      const prompt = legacy.prompts.find((p) => n(p.id) === n(o.prompt_id));
      await tx.insert(serpSnapshots).values({
        query: String(prompt?.text ?? ""),
        promptId,
        engine: "google",
        fetchedAt: new Date(String(o.fetched_at)),
        organic: {
          target_ranked: n(o.target_ranked),
          target_position: o.target_position === null ? null : n(o.target_position),
          competitor_domains: JSON.parse(String(o.competitor_domains)),
          paa: JSON.parse(String(o.paa)),
          related_searches: JSON.parse(String(o.related_searches)),
          aio_shown: o.aio_shown === null ? null : n(o.aio_shown),
        },
        createdAt: new Date(String(o.fetched_at)),
      });
    }

    for (const t of legacy.trends) {
      const rawId = await putRaw(tx, String(t.raw_json), "application/json");
      await tx.insert(demandSignals).values({
        campaignId: ctx.campaignId,
        source: "google_trends",
        term: String(t.term_key),
        value: { data_type: String(t.data_type) },
        rawPayloadId: rawId,
        fetchedAt: new Date(String(t.fetched_at)),
        createdAt: new Date(String(t.fetched_at)),
      });
    }
    for (const a of legacy.autocomplete) {
      const rawId = await putRaw(tx, String(a.raw_json), "application/json");
      await tx.insert(demandSignals).values({
        campaignId: ctx.campaignId,
        source: "autocomplete",
        term: String(a.term),
        value: {},
        rawPayloadId: rawId,
        fetchedAt: new Date(String(a.fetched_at)),
        createdAt: new Date(String(a.fetched_at)),
      });
    }

    for (const r of legacy.recommendations) {
      let payload: unknown = r.payload;
      try {
        payload = JSON.parse(String(r.payload));
      } catch {
        /* keep text */
      }
      await tx.insert(recommendations).values({
        campaignId: ctx.campaignId,
        kind: "content",
        payload: { legacy_kind: r.kind, legacy_prompt_id: r.prompt_id, model: r.model, payload },
        createdAt: new Date(String(r.created_at)),
      });
    }

    const engineRunners = new Set(
      legacy.responses.map((r) => `${r.surface}:${r.source_type === "manual" ? "manual_paste" : "serp_provider"}`),
    );
    for (const er of Array.from(engineRunners)) {
      const [engine, runner] = er.split(":");
      await tx
        .insert(campaignEngines)
        .values({
          campaignId: ctx.campaignId,
          engine: engine as typeof campaignEngines.$inferInsert.engine,
          runner: runner as typeof campaignEngines.$inferInsert.runner,
        })
        .onConflictDoNothing();
    }
    for (const regionId of Array.from(new Set(regionByNote.values()))) {
      await tx.insert(campaignRegions).values({ campaignId: ctx.campaignId, regionId }).onConflictDoNothing();
    }
    for (const personaId of Object.values(personaMap)) {
      await tx.insert(campaignPersonas).values({ campaignId: ctx.campaignId, personaId }).onConflictDoNothing();
    }

    for (const table of ["prompts", "draws", "judge_runs"]) {
      await tx.execute(
        sql.raw(
          `SELECT setval(pg_get_serial_sequence('${table}', 'seq'), GREATEST((SELECT COALESCE(MAX(seq), 0) FROM ${table}), 1))`,
        ),
      );
    }

    const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, ctx.campaignId));
    const next: CampaignSettings = {
      ...((campaign.settings ?? {}) as CampaignSettings),
      migrated_from_sqlite: { at: new Date().toISOString(), source_sha256: sha },
    };
    await tx.update(campaigns).set({ settings: next, updatedAt: new Date() }).where(eq(campaigns.id, ctx.campaignId));
  });

  const counts = await targetCounts(db);
  const result = report(mode, "migrated", "Migration applied.", sha, legacy, counts);
  if (!result.ok) result.message = "Migration applied, but some counts do not match. See the table.";
  return result;
}

export function printReport(r: MigrationReport): void {
  console.log(`\nSQLite migration (${r.mode}): ${r.status}`);
  console.log(r.message);
  console.log(`source sha256: ${r.source_sha256}\n`);
  const w = Math.max(...r.tables.map((t) => t.legacy.length));
  for (const t of r.tables) {
    const target = t.target_count === null ? "-" : String(t.target_count);
    const flag = t.target_count === null ? "" : t.target_count === t.source ? "ok" : "MISMATCH";
    console.log(`${t.legacy.padEnd(w)}  ${String(t.source).padStart(5)} -> ${target.padStart(5)}  ${flag.padEnd(8)} ${t.target}`);
  }
  console.log("");
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const fileArg = args.find((a) => !a.startsWith("--"));
  const sqlitePath = path.resolve(fileArg ?? path.join(process.cwd(), "data", "tracker.db"));
  const result = await migrateSqlite(getDb(), sqlitePath, { apply });
  printReport(result);
  await closeDb();
  if (!result.ok && result.status !== "already-migrated") process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch(async (err) => {
    console.error(err instanceof Error ? err.stack : err);
    await closeDb();
    process.exit(1);
  });
}