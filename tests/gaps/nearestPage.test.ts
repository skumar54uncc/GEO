import { describe, expect, it } from "vitest";
import { findNearestOwnedPage } from "@/lib/gaps/nearestPage";
import {
  EMBEDDINGS_DISABLED_MESSAGE,
  GAP_PAGE_SIMILARITY_THRESHOLD,
  NO_MATCHING_PAGE_MESSAGE,
} from "@/lib/gaps/types";
import { disabledEmbedder, fixtureEmbedder } from "@/lib/prompts/embeddings";

describe("nearest owned page", () => {
  it("returns explicit disabled status when embeddings are unavailable", async () => {
    const result = await findNearestOwnedPage({
      promptText: "best energy engineering programs",
      pages: [{ id: "p1", url: "https://charlotte.edu/energy", embedding: null, text: "energy engineering" }],
      embedder: disabledEmbedder(),
    });
    expect(result).toEqual({
      status: "disabled",
      message: EMBEDDINGS_DISABLED_MESSAGE,
    });
  });

  it("matches the closest crawl page above the similarity threshold", async () => {
    const embedder = fixtureEmbedder(8);
    const [energyVec, housingVec] = await embedder.embed([
      "energy engineering grid research programs",
      "campus housing meal plans residence life",
    ]);
    const result = await findNearestOwnedPage({
      promptText: "energy engineering grid research programs",
      pages: [
        { id: "energy", url: "https://charlotte.edu/energy", embedding: energyVec },
        { id: "housing", url: "https://charlotte.edu/housing", embedding: housingVec },
      ],
      embedder,
      threshold: GAP_PAGE_SIMILARITY_THRESHOLD,
    });
    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.pageId).toBe("energy");
    expect(result.url).toBe("https://charlotte.edu/energy");
    expect(result.similarity).toBeGreaterThanOrEqual(GAP_PAGE_SIMILARITY_THRESHOLD);
  });

  it("returns no matching page message when best similarity is below threshold", async () => {
    const embedder = fixtureEmbedder(8);
    const [housingVec] = await embedder.embed(["campus housing meal plans residence life"]);
    const result = await findNearestOwnedPage({
      promptText: "quantum photonics laser fabrication cleanroom",
      pages: [{ id: "housing", url: "https://charlotte.edu/housing", embedding: housingVec }],
      embedder,
      threshold: 0.99,
    });
    expect(result.status).toBe("no_match");
    if (result.status !== "no_match") return;
    expect(result.message).toBe(NO_MATCHING_PAGE_MESSAGE);
    expect(result.bestPageId).toBe("housing");
    expect(result.bestSimilarity).not.toBeNull();
    expect(result.bestSimilarity!).toBeLessThan(0.99);
  });

  it("embeds page text when stored embeddings are missing", async () => {
    const embedder = fixtureEmbedder(8);
    const result = await findNearestOwnedPage({
      promptText: "energy engineering programs",
      pages: [
        {
          id: "energy",
          url: "https://charlotte.edu/energy",
          embedding: null,
          text: "energy engineering programs",
        },
      ],
      embedder,
      threshold: 0.5,
    });
    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.pageId).toBe("energy");
  });
});
