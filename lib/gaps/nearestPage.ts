/**
 * Nearest owned page for a lost prompt via crawl_pages embeddings (ARCHITECTURE §9 step 4).
 *
 * If the embedder is disabled, returns an explicit disabled status/message.
 * Below GAP_PAGE_SIMILARITY_THRESHOLD → "no matching page, consider a new page".
 */
import { cosineSimilarity, type Embedder } from "@/lib/prompts/embeddings";
import {
  EMBEDDINGS_DISABLED_MESSAGE,
  GAP_PAGE_SIMILARITY_THRESHOLD,
  NO_MATCHING_PAGE_MESSAGE,
  type NearestPageMatch,
} from "./types";

export type CrawlPageEmbedding = {
  id: string;
  url: string;
  /** Precomputed crawl_pages.embedding; null when not embedded. */
  embedding: number[] | null;
  /** Optional text used when the page has no stored embedding and the embedder is enabled. */
  text?: string | null;
};

/**
 * Find the closest owned crawl page to `promptText`.
 * Prefer stored page embeddings; otherwise embed page text when the embedder is enabled.
 */
export async function findNearestOwnedPage(input: {
  promptText: string;
  pages: readonly CrawlPageEmbedding[];
  embedder: Embedder;
  threshold?: number;
}): Promise<NearestPageMatch> {
  const threshold = input.threshold ?? GAP_PAGE_SIMILARITY_THRESHOLD;

  if (input.embedder.status !== "enabled") {
    return { status: "disabled", message: EMBEDDINGS_DISABLED_MESSAGE };
  }

  const [promptVec] = await input.embedder.embed([input.promptText]);
  if (!promptVec?.length) {
    return {
      status: "no_match",
      message: NO_MATCHING_PAGE_MESSAGE,
      bestSimilarity: null,
      bestPageId: null,
      bestUrl: null,
    };
  }

  const needText: CrawlPageEmbedding[] = [];
  const ready: Array<{ page: CrawlPageEmbedding; embedding: number[] }> = [];
  for (const page of input.pages) {
    if (page.embedding && page.embedding.length === promptVec.length) {
      ready.push({ page, embedding: page.embedding });
    } else if (page.text?.trim()) {
      needText.push(page);
    }
  }

  if (needText.length > 0) {
    const vectors = await input.embedder.embed(needText.map((p) => p.text!.trim()));
    for (let i = 0; i < needText.length; i++) {
      const embedding = vectors[i];
      if (embedding && embedding.length === promptVec.length) {
        ready.push({ page: needText[i]!, embedding });
      }
    }
  }

  let best: { page: CrawlPageEmbedding; similarity: number } | null = null;
  for (const { page, embedding } of ready) {
    const similarity = cosineSimilarity(promptVec, embedding);
    if (!best || similarity > best.similarity) best = { page, similarity };
  }

  if (!best) {
    return {
      status: "no_match",
      message: NO_MATCHING_PAGE_MESSAGE,
      bestSimilarity: null,
      bestPageId: null,
      bestUrl: null,
    };
  }

  if (best.similarity < threshold) {
    return {
      status: "no_match",
      message: NO_MATCHING_PAGE_MESSAGE,
      bestSimilarity: best.similarity,
      bestPageId: best.page.id,
      bestUrl: best.page.url,
    };
  }

  return {
    status: "matched",
    pageId: best.page.id,
    url: best.page.url,
    similarity: best.similarity,
    threshold,
  };
}
