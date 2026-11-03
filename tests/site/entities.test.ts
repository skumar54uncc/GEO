import { describe, expect, it } from "vitest";
import { acronymOf, extractEntityCandidates, type EntityPage } from "@/lib/site/entities";
import { extractPage } from "@/lib/site/extract";
import { fixture } from "../fixtures/site/server";

const PORT = 4321;
const base = `http://www.fixture.test:${PORT}`;
const pages: EntityPage[] = [
  ["home.html", "/"],
  ["computer-science.html", "/programs/computer-science/"],
  ["data-science.html", "/programs/data-science/"],
  ["about.html", "/about/"],
  ["history.html", "/about/history/"],
  ["canonical-broken.html", "/canonical-broken/"],
].map(([file, path]) => {
  const url = `${base}${path}`;
  const ex = extractPage(fixture(file, PORT), url);
  return { url, title: ex.title, headings: { h1: ex.h1All, h2: ex.headings.h2, h3: ex.headings.h3 }, schemaRaw: ex.schemaRaw, links: ex.links, text: ex.text };
});

const candidates = extractEntityCandidates(pages);
const of = (kind: string) => candidates.filter((c) => c.kind === kind);
const find = (kind: string, value: string) => candidates.find((c) => c.kind === kind && c.value === value);

describe("entity extraction", () => {
  it("builds acronyms from official names", () => {
    expect(acronymOf("University of North Carolina at Charlotte")).toBe("UNCC");
  });

  it("proposes the institution name from schema with its source URL", () => {
    expect(find("name", "University of North Carolina at Charlotte")).toMatchObject({ method: "schema", sourceUrl: `${base}/` });
  });

  it("proposes aliases seen on the site", () => {
    expect(find("alias", "UNC Charlotte")).toBeTruthy();
    expect(find("alias", "UNCC")).toMatchObject({ requiresContext: false });
    expect(find("alias", "Charlotte 49ers")).toMatchObject({ requiresContext: false });
  });

  it('stores "Charlotte" alone with requires_context = true', () => {
    const bare = find("alias", "Charlotte");
    expect(bare).toBeTruthy();
    expect(bare?.requiresContext).toBe(true);
  });

  it("finds colleges and research centers in navigation, and skips service centers", () => {
    expect(of("college").map((c) => c.value).sort()).toEqual(["Belk College of Business", "College of Computing and Informatics"]);
    expect(find("research_center", "Energy Production and Infrastructure Center (EPIC)")).toMatchObject({ method: "navigation" });
    expect(find("research_center", "Career Center")).toBeUndefined();
  });

  it("finds programs from headings and schema, deduplicated by field and degree", () => {
    const cs = of("program").find((c) => c.normalized === "computer science|bs");
    expect(cs?.details).toMatchObject({ field: "Computer Science", degree: "B.S." });
    expect(cs?.sourceUrls.length).toBeGreaterThanOrEqual(2);
    expect(find("program", "Data Science (M.S.)")).toBeTruthy();
  });

  it("captures ranking claims as the site's own words", () => {
    const claim = of("ranking_claim")[0];
    expect(claim.value).toMatch(/U\.S\. News/);
    expect(claim.evidence).toMatch(/not verified/);
    expect(claim.sourceUrl).toBe(`${base}/about/`);
  });

  it("finds locations from schema and repeated city, state text", () => {
    expect(find("location", "9201 University City Blvd, Charlotte, NC, 28223")).toMatchObject({ method: "schema" });
    expect(find("location", "Charlotte, NC")).toMatchObject({ method: "text" });
  });

  it("every candidate has a source URL", () => {
    expect(candidates.length).toBeGreaterThan(8);
    for (const c of candidates) expect(c.sourceUrl).toMatch(/^http:\/\/www\.fixture\.test/);
  });
});
