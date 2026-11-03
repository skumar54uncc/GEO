import { describe, expect, it } from "vitest";
import { acronymOf, extractEntityCandidates, nameFromHomeTitle, type EntityPage } from "@/lib/site/entities";
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

  it("cleans home page titles into a name", () => {
    expect(nameFromHomeTitle("The University of North Carolina at Charlotte Homepage")).toBe("University of North Carolina at Charlotte");
    expect(nameFromHomeTitle("Home | Example State University")).toBe("Example State University");
    expect(nameFromHomeTitle("Welcome")).toBeNull();
  });

  it("filters real site noise: people, fund names, headlines, street fragments, degree codes", () => {
    const noisy: EntityPage = {
      url: "https://www.example.edu/people/",
      title: "People",
      headings: { h2: ["Ph.D. student Sina Gholami eyes a future in research", "A Best-Value College", "Computer Science, Ph.D."] },
      schemaRaw: [],
      links: [
        { url: "https://www.example.edu/a", text: "Angelica Martins, Ph.D." },
        { url: "https://www.example.edu/b", text: "Belk College of Business Dean’s Excellence Fund" },
        { url: "https://www.example.edu/c", text: "M.S. in Economics Faculty + Staff" },
        { url: "https://www.example.edu/d", text: "UNC Charlotte Launches National Defense and Intelligence Innovation Institute" },
        { url: "https://www.example.edu/e", text: "Respiratory Care, MS" },
      ],
      text: "9201 University City Blvd Charlotte, NC 28223. Respiratory Care, MS program.",
    };
    const c = extractEntityCandidates([noisy, { ...noisy, url: "https://www.example.edu/people/2" }]);
    const values = c.map((x) => `${x.kind}:${x.value}`);
    expect(values).toContain("program:Computer Science, Ph.D.");
    expect(values).toContain("program:Respiratory Care, MS");
    expect(values).toContain("location:Charlotte, NC");
    for (const bad of [
      "program:Angelica Martins, Ph.D.",
      "program:M.S. in Economics Faculty + Staff",
      "college:A Best-Value College",
      "college:Belk College of Business Dean’s Excellence Fund",
      "location:Respiratory Care, MS",
      "location:City Blvd Charlotte, NC",
    ]) {
      expect(values, bad).not.toContain(bad);
    }
    expect(c.some((x) => x.kind === "program" && /student/.test(x.value))).toBe(false);
    expect(c.some((x) => x.kind === "research_center" && /Launches/.test(x.value))).toBe(false);
  });

  it("names the institution only from the main host, and treats unit Organization names as colleges", () => {
    const org = (url: string, name: string, title: string): EntityPage => ({ url, title, headings: {}, schemaRaw: [{ "@type": "Organization", name }], links: [], text: "" });
    const c = extractEntityCandidates(
      [
        org("https://www.example.edu/", "The Example State University Homepage", "The Example State University Homepage"),
        org("https://engineering.example.edu/", "Smith College of Engineering", "Home | Smith College of Engineering"),
      ],
      { primaryHost: "www.example.edu" },
    );
    expect(c.filter((x) => x.kind === "name").map((x) => x.value)).toEqual(["Example State University"]);
    expect(c.find((x) => x.kind === "college")).toMatchObject({ value: "Smith College of Engineering", method: "schema" });
  });

  it("every candidate has a source URL", () => {
    expect(candidates.length).toBeGreaterThan(8);
    for (const c of candidates) expect(c.sourceUrl).toMatch(/^http:\/\/www\.fixture\.test/);
  });
});
