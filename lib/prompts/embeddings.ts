export type DedupeStatus = "enabled" | "disabled";

export type Embedder = {
  status: DedupeStatus;
  model: string | null;
  dimension: number | null;
  /** Returns one vector per input text. Only called when status is "enabled". */
  embed(texts: string[]): Promise<number[][]>;
};

export const DEFAULT_COSINE_THRESHOLD = 0.92;

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Local embedding model (Ollama-compatible). Unavailable by default when the
 * base URL or model is unset, or when the health check fails.
 */
export async function createLocalEmbedder(opts?: {
  baseUrl?: string | null;
  model?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<Embedder> {
  const baseUrl = (opts?.baseUrl ?? process.env.EMBEDDING_BASE_URL ?? process.env.OLLAMA_HOST ?? "").replace(/\/$/, "");
  const model = opts?.model ?? process.env.EMBEDDING_MODEL ?? "";
  if (!baseUrl || !model) {
    return disabledEmbedder();
  }
  const fetchImpl = opts?.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "ping" }),
    });
    if (!res.ok) return disabledEmbedder();
    const json = (await res.json()) as { embedding?: number[] };
    if (!Array.isArray(json.embedding) || json.embedding.length === 0) return disabledEmbedder();
    const dimension = json.embedding.length;
    return {
      status: "enabled",
      model,
      dimension,
      async embed(texts: string[]) {
        const out: number[][] = [];
        for (const text of texts) {
          const r = await fetchImpl(`${baseUrl}/api/embeddings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, prompt: text }),
          });
          if (!r.ok) throw new Error(`Embedding request failed: HTTP ${r.status}`);
          const body = (await r.json()) as { embedding?: number[] };
          if (!Array.isArray(body.embedding) || body.embedding.length !== dimension) {
            throw new Error("Embedding response missing or wrong dimension.");
          }
          out.push(body.embedding);
        }
        return out;
      },
    };
  } catch {
    return disabledEmbedder();
  }
}

export function disabledEmbedder(): Embedder {
  return {
    status: "disabled",
    model: null,
    dimension: null,
    async embed() {
      throw new Error("Local embedding model is unavailable; dedupe is disabled.");
    },
  };
}

/** Deterministic fixture embedder for tests (bag-of-words hash to fixed dim). */
export function fixtureEmbedder(dimension = 8): Embedder {
  return {
    status: "enabled",
    model: "fixture",
    dimension,
    async embed(texts: string[]) {
      return texts.map((t) => hashEmbed(t, dimension));
    },
  };
}

function hashEmbed(text: string, dimension: number): number[] {
  const v = Array.from({ length: dimension }, () => 0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const tok of tokens) {
    let h = 0;
    for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0;
    v[h % dimension]! += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
