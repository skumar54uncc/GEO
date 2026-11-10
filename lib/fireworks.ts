const FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions";

export class WriterModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriterModelConfigError";
  }
}

export function judgeModel(): string {
  return process.env.JUDGE_MODEL || "accounts/fireworks/models/deepseek-v4-pro";
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

export async function fireworksChat(opts: {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  json?: boolean;
}): Promise<{ ok: boolean; text: string; error: string | null }> {
  const key = process.env.FIREWORKS_API_KEY;
  if (!key) return { ok: false, text: "", error: "FIREWORKS_API_KEY is not set" };

  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature ?? 0,
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
      choices?: Array<{ message?: { content?: string } }>;
    };
    if (!res.ok) {
      return { ok: false, text: "", error: json.error?.message || `HTTP ${res.status}` };
    }
    const text = json.choices?.[0]?.message?.content ?? "";
    return { ok: true, text, error: null };
  } catch (err) {
    return { ok: false, text: "", error: err instanceof Error ? err.message : String(err) };
  }
}
