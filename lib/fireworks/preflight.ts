import { recordCall } from "@/lib/cost/guard";
import type { Db } from "@/lib/db/pg/client";
import { judgeModel } from "@/lib/fireworks";

export const FIREWORKS_MODELS_URL = "https://api.fireworks.ai/inference/v1/models";
export const FIREWORKS_CHAT_URL = "https://api.fireworks.ai/inference/v1/chat/completions";

export const MODEL_UNAVAILABLE = (id: string) => `Model retired or unavailable on Fireworks: ${id}`;

export type PreflightResult = { ok: true; method: "list" | "probe" | "skip" } | { ok: false; reason: string; method: "list" | "probe" | "skip" };

export type PreflightFn = (
  db: Db,
  opts: { orgId: string; modelIds: string[]; fetchImpl?: typeof fetch },
) => Promise<PreflightResult>;

let testOverride: PreflightFn | null = null;

/** Test-only hook so capture/schedule suites do not hit Fireworks. */
export function __setPreflightForTests(fn: PreflightFn | null): void {
  testOverride = fn;
}

/** Models that must be served before a scan may be approved (judge always; CONTENT_MODEL when set). */
export function modelsForScanPreflight(): string[] {
  const ids = [judgeModel()];
  const content = process.env.CONTENT_MODEL?.trim();
  if (content) ids.push(content);
  return [...new Set(ids)];
}

async function listServedModelIds(fetchImpl: typeof fetch, apiKey: string): Promise<{ ok: true; ids: Set<string> } | { ok: false; status: number; error: string }> {
  const res = await fetchImpl(FIREWORKS_MODELS_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) {
    return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  }
  const json = (await res.json()) as { data?: Array<{ id?: string }>; object?: string };
  const ids = new Set((json.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string" && id.length > 0));
  return { ok: true, ids };
}

/** One-token completion used only when the models list endpoint is unavailable. */
async function probeModel(
  db: Db,
  opts: { orgId: string; modelId: string; apiKey: string; fetchImpl: typeof fetch },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const res = await opts.fetchImpl(FIREWORKS_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      model: opts.modelId,
      max_tokens: 1,
      temperature: 0,
      messages: [{ role: "user", content: "." }],
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const promptTokens = typeof json.usage?.prompt_tokens === "number" ? json.usage.prompt_tokens : null;
  const completionTokens = typeof json.usage?.completion_tokens === "number" ? json.usage.completion_tokens : null;
  const units =
    promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : 1;
  await recordCall(db, {
    orgId: opts.orgId,
    provider: "fireworks",
    units,
    ok: res.ok,
    engine: "model_preflight",
    error: res.ok ? null : json.error?.message || `HTTP ${res.status}`,
    usageEstimated: promptTokens === null || completionTokens === null,
  });
  if (!res.ok) {
    return { ok: false, status: res.status, error: json.error?.message || `HTTP ${res.status}` };
  }
  return { ok: true };
}

/**
 * Confirm model IDs are currently served on Fireworks.
 * Prefers OpenAI-compatible GET /inference/v1/models (verified 200 + object=list).
 * Falls back to a 1-token completion recorded under engine model_preflight.
 */
export async function preflightFireworksModels(
  db: Db,
  opts: { orgId: string; modelIds: string[]; fetchImpl?: typeof fetch },
): Promise<PreflightResult> {
  if (testOverride) return testOverride(db, opts);
  const ids = opts.modelIds.filter(Boolean);
  if (!ids.length) return { ok: true, method: "skip" };

  const apiKey = process.env.FIREWORKS_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "FIREWORKS_API_KEY is not set", method: "skip" };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const listed = await listServedModelIds(fetchImpl, apiKey);
  if (listed.ok) {
    for (const id of ids) {
      if (!listed.ids.has(id)) {
        return { ok: false, reason: MODEL_UNAVAILABLE(id), method: "list" };
      }
    }
    return { ok: true, method: "list" };
  }

  for (const id of ids) {
    const probed = await probeModel(db, { orgId: opts.orgId, modelId: id, apiKey, fetchImpl });
    if (!probed.ok) {
      return { ok: false, reason: MODEL_UNAVAILABLE(id), method: "probe" };
    }
  }
  return { ok: true, method: "probe" };
}
