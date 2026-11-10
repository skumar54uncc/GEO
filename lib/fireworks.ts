const FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions";

/** Safety ceiling only — not a quality target. Hitting it is an error, not a retry. */
export const FIREWORKS_MAX_TOKENS = 8192;

export class WriterModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriterModelConfigError";
  }
}

/** Required. Never falls back to a hardcoded model id. */
export function judgeModel(): string {
  const model = process.env.JUDGE_MODEL?.trim();
  if (!model) {
    throw new Error("JUDGE_MODEL is not set");
  }
  return model;
}

/**
 * Writer model for recommendations / content briefs.
 * Must be set explicitly via CONTENT_MODEL and must differ from the resolved judge model —
 * never fall back to JUDGE_MODEL (ARCHITECTURE: the writer never grades itself).
 */
export function contentModel(): string {
  const content = process.env.CONTENT_MODEL?.trim();
  if (!content) {
    throw new WriterModelConfigError("CONTENT_MODEL is required and must differ from JUDGE_MODEL.");
  }
  const judge = judgeModel();
  if (content === judge) {
    throw new WriterModelConfigError("CONTENT_MODEL must differ from JUDGE_MODEL.");
  }
  return content;
}

export type FireworksChatResult = {
  ok: boolean;
  text: string;
  error: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  /** True when the model stopped because it hit FIREWORKS_MAX_TOKENS. */
  hitTokenCeiling: boolean;
};

export async function fireworksChat(opts: {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  json?: boolean;
}): Promise<FireworksChatResult> {
  const key = process.env.FIREWORKS_API_KEY;
  if (!key) {
    return { ok: false, text: "", error: "FIREWORKS_API_KEY is not set", promptTokens: null, completionTokens: null, hitTokenCeiling: false };
  }

  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature ?? 0,
    max_tokens: FIREWORKS_MAX_TOKENS,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };
  if (opts.json !== false) {
    body.response_format = { type: "json_object" };
  }

  try {
    const res = await fetch(FIREWORKS_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string }; finish_reason?: string | null }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const promptTokens = typeof json.usage?.prompt_tokens === "number" ? json.usage.prompt_tokens : null;
    const completionTokens = typeof json.usage?.completion_tokens === "number" ? json.usage.completion_tokens : null;
    const finishReason = json.choices?.[0]?.finish_reason ?? null;
    const hitTokenCeiling = finishReason === "length";

    if (!res.ok) {
      return {
        ok: false,
        text: "",
        error: json.error?.message || `HTTP ${res.status}`,
        promptTokens,
        completionTokens,
        hitTokenCeiling: false,
      };
    }

    const text = json.choices?.[0]?.message?.content ?? "";
    if (hitTokenCeiling) {
      return {
        ok: false,
        text,
        error: `Response hit max_tokens ceiling (${FIREWORKS_MAX_TOKENS}); not retried.`,
        promptTokens,
        completionTokens,
        hitTokenCeiling: true,
      };
    }
    return { ok: true, text, error: null, promptTokens, completionTokens, hitTokenCeiling: false };
  } catch (err) {
    return {
      ok: false,
      text: "",
      error: err instanceof Error ? err.message : String(err),
      promptTokens: null,
      completionTokens: null,
      hitTokenCeiling: false,
    };
  }
}
