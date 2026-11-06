import { describe, expect, it } from "vitest";
import { assembleLostEvidence } from "@/lib/gaps/collect";

describe("gap evidence collect", () => {
  it("links citations to cited_pages by canonical URL and sorts ids", () => {
    const evidence = assembleLostEvidence({
      citations: [
        {
          id: "c2",
          drawId: "d1",
          url: "https://example.com/a?utm_source=x",
          canonicalUrl: "https://example.com/a",
          domain: "example.com",
          sourceClass: "editorial",
          position: 1,
          title: "A",
        },
        {
          id: "c1",
          drawId: "d1",
          url: "https://other.edu/b",
          canonicalUrl: null,
          domain: "other.edu",
          sourceClass: "competitor",
          position: 2,
          title: null,
        },
      ],
      citedPages: [
        {
          id: "p-b",
          canonicalUrl: "https://other.edu/b",
          title: "B",
          h1: "B",
          h2s: ["Why B"],
          contentType: "article",
          wordCount: 400,
        },
        {
          id: "p-a",
          canonicalUrl: "https://example.com/a",
          title: "A",
          h1: "A",
          h2s: [],
          contentType: "listicle",
          wordCount: 800,
        },
        {
          id: "p-unused",
          canonicalUrl: "https://unused.example/z",
          title: "Z",
          h1: null,
          h2s: [],
          contentType: null,
          wordCount: null,
        },
      ],
      fanoutQueries: [
        { id: "f2", drawId: "d1", query: "best energy programs", source: "provider_field" },
        { id: "f1", drawId: "d1", query: "unc charlotte engineering", source: "provider_field" },
      ],
    });

    expect(evidence.citations.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(evidence.fanoutQueries.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(evidence.citedPages.map((p) => p.id)).toEqual(["p-a", "p-b"]);
    expect(evidence.citedPages.find((p) => p.id === "p-unused")).toBeUndefined();
  });

  it("dedupes the same cited page when multiple citations share a canonical URL", () => {
    const evidence = assembleLostEvidence({
      citations: [
        {
          id: "c1",
          drawId: "d1",
          url: "https://news.example/x",
          canonicalUrl: "https://news.example/x",
          domain: "news.example",
          sourceClass: "editorial",
          position: 1,
          title: null,
        },
        {
          id: "c2",
          drawId: "d2",
          url: "https://news.example/x?utm=1",
          canonicalUrl: "https://news.example/x",
          domain: "news.example",
          sourceClass: "editorial",
          position: 1,
          title: null,
        },
      ],
      citedPages: [
        {
          id: "p1",
          canonicalUrl: "https://news.example/x",
          title: "X",
          h1: "X",
          h2s: [],
          contentType: "article",
          wordCount: 100,
        },
      ],
      fanoutQueries: [],
    });
    expect(evidence.citedPages).toHaveLength(1);
  });
});
