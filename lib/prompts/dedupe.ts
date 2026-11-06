import {
  cosineSimilarity,
  DEFAULT_COSINE_THRESHOLD,
  type DedupeStatus,
  type Embedder,
} from "@/lib/prompts/embeddings";

export type DedupeCandidate<T> = T & { text: string };

export type DedupeResult<T> = {
  dedupeStatus: DedupeStatus;
  threshold: number;
  kept: Array<DedupeCandidate<T> & { embedding?: number[] }>;
  dropped: Array<{
    candidate: DedupeCandidate<T>;
    reason: "duplicate_of_existing" | "duplicate_in_batch";
    cosine: number;
    matchedText: string;
  }>;
};

/**
 * Cosine dedupe against existing campaign prompts and within the candidate batch.
 * When the embedder is disabled, every candidate is kept and status is "disabled"
 * (never silently skipped).
 */
export async function dedupeAgainstCampaign<T>(
  candidates: Array<DedupeCandidate<T>>,
  existing: Array<{ text: string; embedding: number[] | null }>,
  embedder: Embedder,
  threshold = DEFAULT_COSINE_THRESHOLD,
): Promise<DedupeResult<T>> {
  if (embedder.status === "disabled") {
    return {
      dedupeStatus: "disabled",
      threshold,
      kept: candidates.map((c) => ({ ...c })),
      dropped: [],
    };
  }

  const existingWithVectors = existing.filter(
    (e): e is { text: string; embedding: number[] } => Array.isArray(e.embedding) && e.embedding.length > 0,
  );
  const missingExisting = existing.filter((e) => !Array.isArray(e.embedding) || e.embedding.length === 0);
  const toEmbed = [...candidates.map((c) => c.text), ...missingExisting.map((e) => e.text)];
  const vectors = toEmbed.length ? await embedder.embed(toEmbed) : [];
  const candidateVectors = vectors.slice(0, candidates.length);
  const missingVectors = vectors.slice(candidates.length);

  const reference: Array<{ text: string; embedding: number[] }> = [
    ...existingWithVectors,
    ...missingExisting.map((e, i) => ({ text: e.text, embedding: missingVectors[i]! })),
  ];

  const kept: Array<DedupeCandidate<T> & { embedding?: number[] }> = [];
  const dropped: DedupeResult<T>["dropped"] = [];
  const batchKept: Array<{ text: string; embedding: number[] }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const embedding = candidateVectors[i]!;
    let best: { cosine: number; text: string; reason: "duplicate_of_existing" | "duplicate_in_batch" } | null = null;

    for (const ref of reference) {
      const cosine = cosineSimilarity(embedding, ref.embedding);
      if (cosine >= threshold && (!best || cosine > best.cosine)) {
        best = { cosine, text: ref.text, reason: "duplicate_of_existing" };
      }
    }
    for (const ref of batchKept) {
      const cosine = cosineSimilarity(embedding, ref.embedding);
      if (cosine >= threshold && (!best || cosine > best.cosine)) {
        best = { cosine, text: ref.text, reason: "duplicate_in_batch" };
      }
    }

    if (best) {
      dropped.push({ candidate, reason: best.reason, cosine: best.cosine, matchedText: best.text });
      continue;
    }
    kept.push({ ...candidate, embedding });
    batchKept.push({ text: candidate.text, embedding });
  }

  return { dedupeStatus: "enabled", threshold, kept, dropped };
}
