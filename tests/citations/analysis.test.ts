import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { canonicalizeCitationUrl } from "@/lib/citations/canonical";
import { extractCitationFeatures, inferContentType } from "@/lib/citations/features";
import { classifySource } from "@/lib/citations/sourceClass";
import { extractPage } from "@/lib/site/extract";

const html = fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "citations", "feature-rich.html"), "utf8");

describe("citation URL canonicalization", () => {
  it("drops tracking and fragments, sorts query parameters, and trims trailing slashes", () => {
    expect(canonicalizeCitationUrl("HTTPS://Example.COM/program/?utm_source=ai&b=2&a=1#sources")).toBe(
      "https://example.com/program?a=1&b=2",
    );
  });

  it("rejects non-web and credentialed URLs", () => {
    expect(canonicalizeCitationUrl("file:///etc/passwd")).toBeNull();
    expect(canonicalizeCitationUrl("http://user:secret@example.com/")).toBeNull();
  });
});

describe("source taxonomy", () => {
  it.each([
    ["https://www.usnews.com/best-colleges", "ranking", "ranking"],
    ["https://bigfuture.collegeboard.org/college-search", "editorial", "listing"],
    ["https://en.wikipedia.org/wiki/University", "reference", "wikipedia"],
    ["https://www.reddit.com/r/college/", "ugc", "reddit"],
    ["https://youtube.com/watch?v=1", "ugc", "video"],
    ["https://www.reuters.com/world/", "editorial", "news"],
    ["https://data.ed.gov/report", "gov", "government"],
    ["https://www.charlotteobserver.com/news/", "editorial", "news"],
    ["https://www.wfae.org/education", "editorial", "news"],
    ["https://joinhandshake.com/explore", "editorial", "listing"],
    ["https://www.indeed.com/q-internships.html", "editorial", "listing"],
    ["https://www.ratemyprofessors.com/school", "ugc", "review"],
    ["https://www.collegevine.com/schools", "ugc", "review"],
  ] as const)("%s is %s/%s", (url, sourceClass, kind) => {
    expect(classifySource(url)).toEqual({ sourceClass, kind });
  });

  it("keeps an edu peer in the approved competitor class and exposes its subtype", () => {
    expect(classifySource("https://admissions.peer.edu/programs", { competitorDomains: ["peer.edu"] })).toEqual({
      sourceClass: "competitor",
      kind: "edu_peer",
    });
    expect(classifySource("https://research.other.edu/paper")).toEqual({ sourceClass: "editorial", kind: "education" });
  });

  it("applies org overrides before built-in lists", () => {
    expect(
      classifySource("https://www.charlotteobserver.com/x", {
        overrides: { "charlotteobserver.com": { sourceClass: "ugc", kind: "forum" } },
      }),
    ).toEqual({ sourceClass: "ugc", kind: "forum" });
  });
});

describe("GEO Playbook cited-page features", () => {
  const pageUrl = "https://news.example.org/rankings/energy";
  const page = extractPage(html, pageUrl);
  const features = extractCitationFeatures(html, pageUrl, page);

  it("extracts each feature from a saved HTML fixture", () => {
    expect(features.source).toEqual({ sourceClass: "other", kind: "other" });
    expect(features.listicle).toEqual({ present: true, itemCount: 3 });
    expect(features.answerCapsule).toMatchObject({
      present: true,
      nearCapsule: true,
      question: "What makes this energy program distinctive?",
    });
    expect(features.answerCapsule.wordCount).toBeGreaterThanOrEqual(20);
    expect(features.answerCapsule.wordCount).toBeLessThanOrEqual(25);
    expect(features.statisticsCount).toBe(3);
    expect(features.namedQuotes).toEqual([
      expect.objectContaining({ name: "Dr. Jane Smith", quote: expect.stringContaining("Applied research") }),
    ]);
    expect(features.credibleOutboundLinks.map((link) => link.url)).toEqual([
      "https://energy.gov/data",
      "https://research.example.edu/study",
    ]);
    expect(features.freshness).toMatchObject({
      published: "2026-01-15T12:00:00.000Z",
      updated: "2026-10-20T09:30:00.000Z",
      latestDate: "2026-10-20T09:30:00.000Z",
    });
    expect(features.schema).toEqual({ present: true, types: ["NewsArticle"] });
    expect(inferContentType(pageUrl, page, features)).toBe("ranking_list");
  });

  it("flags near capsules outside the strict 20-25 band and still stores word count", () => {
    const nearHtml = `<html><body><h2>Why choose this program?</h2><p>${Array.from({ length: 18 }, (_, i) => `word${i + 1}`).join(" ")}</p></body></html>`;
    const near = extractCitationFeatures(nearHtml, "https://example.org/near");
    expect(near.answerCapsule).toMatchObject({ present: false, nearCapsule: true, wordCount: 18 });
  });
});
