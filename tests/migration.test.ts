import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { count, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getStore } from "@/lib/db";
import { getDb } from "@/lib/db/pg/client";
import { organizations, judgeRuns, draws } from "@/lib/db/pg/schema";
import { computeMetrics } from "@/lib/metrics";
import { migrateSqlite, readLegacy } from "../scripts/migrate-sqlite";
import { computeMetrics as legacyComputeMetrics } from "./legacy/metrics";
import { setLegacyStore, tryOpenSqlite } from "./legacy/sqliteStore";
import { resetDatabase } from "./helpers";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function tempCopy(file: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-legacy-"));
  const copy = path.join(dir, "tracker.db");
  fs.copyFileSync(file, copy);
  for (const s of ["-wal", "-shm"]) if (fs.existsSync(file + s)) fs.copyFileSync(file + s, copy + s);
  return copy;
}

/** Legacy metrics computed by the frozen pre-Phase-1 code on a copy of the SQLite file. */
function legacyMetrics(file: string) {
  const store = tryOpenSqlite(tempCopy(file));
  if (!store) throw new Error("better-sqlite3 unavailable");
  setLegacyStore(store);
  return normalize(legacyComputeMetrics());
}

function normalize(m: Record<string, unknown>) {
  const copy = JSON.parse(JSON.stringify(m)) as Record<string, unknown>;
  delete copy.generated_at;
  delete copy.backend;
  return copy;
}

const judge = (o: Partial<Record<string, unknown>>) =>
  JSON.stringify({
    brand_mentioned: false,
    brand_aliases_found: [],
    mention_rank: null,
    total_entities_listed: null,
    mention_prominence: "absent",
    mention_sentiment: "absent",
    mention_context: "",
    competitors: [],
    citations: [],
    target_cited: false,
    subtopics_covered: [],
    assets_surfaced: [],
    answer_summary: "",
    hallucination_flags: [],
    ...o,
  });

/** Builds a legacy SQLite database with the original store code, covering every table and edge case. */
function buildFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-fixture-"));
  const file = path.join(dir, "tracker.db");
  const store = tryOpenSqlite(file)!;
  const prompts = store.listPrompts();
  store.updatePrompt(prompts[5].id, { active: 0 });
  const manual = "Charlotte NC, incognito";
  const aio = "United States (location pinned; not Charlotte-biased)";
  const resp = (pid: number, surface: string, run: number, text: string, source: "manual" | "serpapi", note: string) =>
    store.upsertResponses([
      { prompt_id: pid, surface: surface as never, run_number: run, raw_text: text, source_type: source, location_note: note },
    ])[0];

  const r1 = resp(prompts[0].id, "chatgpt", 1, "UNC Charlotte and NC State lead grid research. See charlotte.edu.", "manual", manual);
  const r2 = resp(prompts[0].id, "chatgpt", 2, "NC State and Duke lead.", "manual", manual);
  const r3 = resp(prompts[0].id, "chatgpt", 3, "Georgia Tech is strong; UNC Charlotte's EPIC too.", "manual", manual);
  const r4 = resp(prompts[0].id, "claude", 1, "Clemson leads.", "manual", "Raleigh NC, logged out");
  const r5 = resp(prompts[1].id, "google_aio", 1, "AI Overview text naming UNC Charlotte", "serpapi", aio);
  const r6 = resp(prompts[2].id, "google_aio", 1, "no AI Overview shown", "serpapi", aio);
  resp(prompts[5].id, "gemini", 1, "Answer for an inactive prompt — with unicode ✓", "manual", manual);
  resp(prompts[3].id, "perplexity", 1, "Unjudged answer.", "manual", manual);

  store.upsertAnalysis({
    response_id: r1.id,
    judge_model: "m",
    error_flag: false,
    judge_json: judge({
      brand_mentioned: true,
      brand_aliases_found: ["UNC Charlotte"],
      mention_rank: 1,
      mention_prominence: "first_paragraph",
      mention_sentiment: "positive",
      competitors: [{ name: "NC State", rank: 2, sentiment: "neutral" }],
      citations: [
        { domain: "charlotte.edu", is_target: true },
        { domain: "ncsu.edu", is_target: false },
        { domain: "wikipedia.org", is_target: false },
      ],
      target_cited: true,
      subtopics_covered: ["grid_technology"],
    }),
  });
  store.upsertAnalysis({
    response_id: r2.id,
    judge_model: "m",
    error_flag: false,
    judge_json: judge({ competitors: [{ name: "NC State", rank: 1, sentiment: "positive" }, { name: "Duke", rank: 2, sentiment: "neutral" }] }),
  });
  store.upsertAnalysis({
    response_id: r3.id,
    judge_model: "m",
    error_flag: false,
    judge_json: judge({ brand_mentioned: true, mention_rank: 2, mention_prominence: "body", competitors: [{ name: "Georgia Tech", rank: 1, sentiment: "positive" }] }),
  });
  store.upsertAnalysis({ response_id: r4.id, judge_model: "m", error_flag: true, judge_json: JSON.stringify({ parse_error: true, raw: "x" }) });
  store.upsertAnalysis({
    response_id: r5.id,
    judge_model: "m",
    error_flag: false,
    manual_override: true,
    judge_json: judge({ brand_mentioned: true, citations: [{ domain: "charlotte.edu", is_target: true }], target_cited: true }),
  });
  store.upsertAnalysis({ response_id: r6.id, judge_model: "m", error_flag: false, judge_json: judge({}) });

  store.putSerpCache({
    engine: "google",
    params_hash: "hash-google-1",
    params_json: JSON.stringify({ engine: "google", q: prompts[1].text }),
    raw_json: JSON.stringify({ organic_results: [{ position: 1, link: "https://charlotte.edu/x" }] }),
    credits_charged: 1,
  });
  store.putSerpCache({
    engine: "google_ai_overview",
    params_hash: "hash-aio-1",
    params_json: JSON.stringify({ engine: "google_ai_overview", page_token: "t" }),
    raw_json: JSON.stringify({ ai_overview: { references: [{ link: "https://charlotte.edu/" }] } }),
    credits_charged: 1,
  });
  store.logSerpEvent({ created_at: "2026-08-13T12:00:00.000Z", engine: "google", ok: 1, cached: 0, credits_charged: 1, error: null, prompt_id: prompts[1].id, params_hash: "hash-google-1" });
  store.logSerpEvent({ created_at: "2026-08-13T12:00:01.000Z", engine: "google_ai_overview", ok: 1, cached: 0, credits_charged: 1, error: null, prompt_id: prompts[1].id, params_hash: "hash-aio-1" });
  store.logSerpEvent({ created_at: "2026-08-13T12:00:02.000Z", engine: "google", ok: 0, cached: 0, credits_charged: 0, error: "HTTP 500", prompt_id: null, params_hash: null });
  store.chargeCredits(2);
  store.upsertOrganic({
    prompt_id: prompts[1].id,
    target_ranked: 1,
    target_position: 3,
    competitor_domains: JSON.stringify(["ncsu.edu"]),
    paa: JSON.stringify([{ question: "Is UNC Charlotte good for engineering?", snippet: "" }]),
    related_searches: JSON.stringify(["grid research universities"]),
    aio_shown: 1,
    fetched_at: "2026-08-13T12:00:00.000Z",
  });
  store.upsertOrganic({
    prompt_id: prompts[2].id,
    target_ranked: 0,
    target_position: null,
    competitor_domains: JSON.stringify([]),
    paa: JSON.stringify([]),
    related_searches: JSON.stringify([]),
    aio_shown: 0,
    fetched_at: "2026-08-13T12:00:00.000Z",
  });
  store.putTrend("electric grid::US", "TIMESERIES", JSON.stringify({ interest_over_time: { averages: [] } }));
  store.putAutocomplete("grid research", JSON.stringify({ suggestions: [{ value: "grid research universities" }] }));
  return file;
}

async function verifyMigration(file: string) {
  const db = getDb();
  const legacy = readLegacy(file);

  const dry = await migrateSqlite(db, file, { apply: false });
  expect(dry.status).toBe("planned");
  expect(await db.select().from(organizations)).toHaveLength(0);

  const applied = await migrateSqlite(db, file, { apply: true });
  expect(applied.status).toBe("migrated");
  for (const t of applied.tables) expect({ table: t.legacy, n: t.target_count }).toEqual({ table: t.legacy, n: t.source });
  expect(applied.ok).toBe(true);

  const again = await migrateSqlite(db, file, { apply: true });
  expect(again.status).toBe("already-migrated");
  expect(again.tables).toEqual(applied.tables);

  // 20 random answers: sha256 of legacy raw_text equals sha256 of draws.answer_text.
  const store = getStore();
  const sample = [...legacy.responses].sort(() => Math.random() - 0.5).slice(0, 20);
  for (const r of sample) {
    const migrated = await store.getResponse(Number(r.id));
    expect(migrated, `response ${r.id}`).not.toBeNull();
    expect(sha(migrated!.raw_text)).toBe(sha(String(r.raw_text)));
    expect(migrated!.surface).toBe(r.surface);
    expect(migrated!.run_number).toBe(Number(r.run_number));
    expect(migrated!.location_note).toBe(r.location_note);
  }

  const before = legacyMetrics(file);
  const after = normalize(await computeMetrics());
  expect(after).toEqual(before);
  return { legacy, applied };
}

describe("SQLite migration (fixture covering every legacy table)", () => {
  let fixture: string;
  beforeAll(async () => {
    await resetDatabase();
    fixture = buildFixture();
  });

  it("dry run writes nothing, apply matches counts, hashes and legacy metrics, re-apply is a no-op", async () => {
    const originalHash = crypto.createHash("sha256").update(fs.readFileSync(fixture)).digest("hex");
    await verifyMigration(fixture);
    const store = getStore();

    // Legacy ids, judge history, caches and ledgers survive.
    const prompts = await store.listPrompts();
    expect(prompts).toHaveLength(50);
    expect(prompts[5].active).toBe(0);
    const analyses = await store.listAnalyses();
    expect(analyses).toHaveLength(6);
    expect(analyses.filter((a) => a.error_flag)).toHaveLength(1);
    expect(analyses.filter((a) => a.manual_override)).toHaveLength(1);
    expect(JSON.parse((await store.getSerpCache("hash-google-1"))!.raw_json).organic_results[0].position).toBe(1);
    expect(await store.listSerpEvents(10)).toHaveLength(3);
    expect((await store.getConfig()).serpapi_credits_remaining).toBe(998);
    expect((await store.getOrganic(prompts[1].id))!.target_position).toBe(3);
    expect(await store.listTrends()).toHaveLength(1);
    expect(await store.listAutocomplete()).toHaveLength(1);

    // New rows continue after the migrated ids.
    const created = await store.createPrompt({ text: "brand new", audience: "grad", subtopics: [] });
    expect(created.id).toBe(51);

    // The SQLite source was not modified.
    expect(crypto.createHash("sha256").update(fs.readFileSync(fixture)).digest("hex")).toBe(originalHash);
  });

  it("re-judging adds a judge run and keeps history", async () => {
    const db = getDb();
    const store = getStore();
    const [{ n: beforeN }] = await db.select({ n: count() }).from(judgeRuns);
    const responses = await store.listResponses();
    const target = responses.find((r) => r.surface === "claude")!;
    await store.upsertAnalysis({ response_id: target.id, judge_json: judge({}), judge_model: "m2", error_flag: false });
    const [{ n: afterN }] = await db.select({ n: count() }).from(judgeRuns);
    expect(afterN).toBe(beforeN + 1);
    expect((await store.getAnalysisByResponse(target.id))!.judge_model).toBe("m2");
    const [draw] = await db.select().from(draws).where(eq(draws.seq, target.id));
    expect((await db.select().from(judgeRuns).where(eq(judgeRuns.drawId, draw.id))).length).toBe(2);
  });
});

const REAL_DB = path.join(process.cwd(), "data", "tracker.db");

describe.skipIf(!fs.existsSync(REAL_DB))("SQLite migration (real data/tracker.db)", () => {
  beforeAll(resetDatabase);

  it("migrates the real legacy database with matching counts, hashes and metrics", async () => {
    const originalHash = crypto.createHash("sha256").update(fs.readFileSync(REAL_DB)).digest("hex");
    const { applied } = await verifyMigration(REAL_DB);
    console.log(
      "real migration counts:",
      applied.tables.map((t) => `${t.legacy} ${t.source}->${t.target_count}`).join(", "),
    );
    expect(crypto.createHash("sha256").update(fs.readFileSync(REAL_DB)).digest("hex")).toBe(originalHash);
  });
});
