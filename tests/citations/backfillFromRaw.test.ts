import { describe, expect, it } from "vitest";
import { extractAioReferencesFromRaw } from "@/lib/citations/backfillFromRaw";

describe("extractAioReferencesFromRaw", () => {
  it("reads SerpAPI ai_overview.references", () => {
    const refs = extractAioReferencesFromRaw({
      ai_overview: {
        references: [
          { link: "https://charlotte.edu/ai", title: "AI at UNC Charlotte" },
          { link: "https://example.edu/x", title: "Peer" },
        ],
      },
    });
    expect(refs).toHaveLength(2);
    expect(refs[0].url).toBe("https://charlotte.edu/ai");
    expect(refs[0].position).toBe(1);
  });

  it("reads DataForSEO ai_overview item references", () => {
    const refs = extractAioReferencesFromRaw({
      tasks: [
        {
          result: [
            {
              items: [
                {
                  type: "ai_overview",
                  references: [{ url: "https://energy.gov/a", title: "DOE" }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(refs).toEqual([{ url: "https://energy.gov/a", title: "DOE", position: 1 }]);
  });

  it("dedupes by url and ignores empty", () => {
    const refs = extractAioReferencesFromRaw({
      references: [{ link: "https://a.edu" }, { url: "https://a.edu" }, { link: "" }],
    });
    expect(refs).toHaveLength(1);
  });
});
