import { asArray, asRecord, httpJson, num, sleep, str } from "../http";
import { BRIGHTDATA_PER_RECORD } from "../pricing";
import { regionHonored } from "../regions";
import { errorResult, type CaptureCitation, type CaptureRequest, type CaptureResult, type ProviderAdapter } from "../types";
import { depsOf, httpFailure, missingVars, type AdapterDeps } from "./common";

const BASE = "https://api.brightdata.com/datasets/v3";
export const PERPLEXITY_DATASET_ID = "gd_m7dhdot1vw9a7gc1n";

/** Polling a snapshot is a free GET, not a new paid request. Bounded so a stuck job ends as an error draw. */
const POLL_MAX_MS = 8 * 60_000;

type Deps = AdapterDeps & { sleep?: (ms: number) => Promise<void> };

export function parseBrightDataRecords(req: CaptureRequest, records: unknown, latencyMs: number, raw: unknown): CaptureResult {
  const list = asArray(records);
  const rec = asRecord(list[0]);
  if (!rec) return errorResult("Bright Data returned no records", { raw, latencyMs, costUsd: 0 });
  const recError = str(rec.error) ?? str(rec.error_code);
  if (recError) return errorResult(`Bright Data record error: ${recError}`, { raw, latencyMs, costUsd: 0 });

  const text = str(rec.answer_text_markdown) ?? str(rec.answer_text) ?? "";
  const citations: CaptureCitation[] = [];
  for (const s of asArray(rec.sources)) {
    const r = asRecord(s);
    const url = str(r?.url);
    if (!url) continue;
    citations.push({ url, position: num(r?.position) ?? citations.length + 1, linked: true, title: str(r?.title) });
  }
  return {
    status: text.trim() ? "ok" : "empty",
    answerText: text,
    citations,
    fanoutQueries: [],
    modelBuild: "unknown",
    regionHonored: regionHonored(req.region, req.region.country ? "country" : "none", "native"),
    raw,
    costUnits: list.length,
    costUsd: list.length * BRIGHTDATA_PER_RECORD,
    latencyMs,
  };
}

export function createBrightDataAdapter(deps: Deps = {}): ProviderAdapter {
  const { env, fetch: fetchImpl } = depsOf(deps);
  const wait = deps.sleep ?? sleep;
  const missingConfig = () => missingVars(env(), ["BRIGHTDATA_API_KEY"]);

  return {
    id: "brightdata",
    supports: (engine, runner) => engine === "perplexity" && runner === "ui_provider",
    missingConfig,
    estimate: () => ({ units: 1, usd: BRIGHTDATA_PER_RECORD, note: "list price; the 5,000 free records per month are not deducted" }),
    async capture(req) {
      if (req.engine !== "perplexity" || req.runner !== "ui_provider") return errorResult(`brightdata does not support ${req.engine} via ${req.runner}`);
      const missing = missingConfig();
      if (missing.length) return errorResult(`Missing ${missing.join(", ")}`, { status: "blocked" });
      const headers = { Authorization: `Bearer ${env().BRIGHTDATA_API_KEY}`, "Content-Type": "application/json" };
      const started = Date.now();
      const input = { url: "https://www.perplexity.ai", prompt: req.prompt, country: req.region.country ?? "US", index: req.drawIndex };
      const res = await httpJson(fetchImpl, `${BASE}/scrape?dataset_id=${PERPLEXITY_DATASET_ID}&format=json&include_errors=true`, {
        method: "POST",
        headers,
        body: JSON.stringify({ input: [input] }),
        timeoutMs: 120_000,
      });
      const failed = httpFailure(res);
      if (failed) return failed;
      if (res.status !== 202) return parseBrightDataRecords(req, res.json, Date.now() - started, res.json);

      const snapshotId = str(asRecord(res.json)?.snapshot_id);
      if (!snapshotId) return errorResult("Bright Data 202 without snapshot_id", { raw: res.json, latencyMs: Date.now() - started, costUsd: null });
      let lastProgress: unknown = null;
      while (Date.now() - started < POLL_MAX_MS) {
        await wait(10_000);
        const p = await httpJson(fetchImpl, `${BASE}/progress/${snapshotId}`, { headers, timeoutMs: 30_000 });
        lastProgress = p.json ?? p.text;
        const state = str(asRecord(p.json)?.status);
        if (state === "failed" || state === "canceled") {
          return errorResult(`Bright Data snapshot ${snapshotId} ${state}`, { raw: { snapshot_id: snapshotId, progress: lastProgress }, latencyMs: Date.now() - started, costUsd: 0 });
        }
        if (state !== "ready") continue;
        const dl = await httpJson(fetchImpl, `${BASE}/snapshot/${snapshotId}?format=json`, { headers, timeoutMs: 60_000 });
        const dlFailed = httpFailure(dl);
        if (dlFailed) return { ...dlFailed, costUsd: null };
        return parseBrightDataRecords(req, dl.json, Date.now() - started, { snapshot_id: snapshotId, records: dl.json });
      }
      return errorResult(`Bright Data snapshot ${snapshotId} not ready after ${POLL_MAX_MS / 60_000} min`, {
        raw: { snapshot_id: snapshotId, progress: lastProgress },
        latencyMs: Date.now() - started,
        costUsd: null,
      });
    },
  };
}
