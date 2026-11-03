import { describe, expect, it } from "vitest";
import { findingsFingerprint, sortFindings } from "@/lib/site/audit/run";
import { evaluateRules, RULE_BY_ID, RULES, type AuditHost, type AuditInput, type AuditPage } from "@/lib/site/audit/rules";
import { fixture } from "../fixtures/site/server";

const asOf = new Date("2026-11-03T00:00:00Z");
const host: AuditHost = { id: "h1", host: "www.fixture.test", isPrimary: true, robotsStatus: 200, robotsText: "User-agent: *\nAllow: /\n", llmsTxtStatus: 200 };

let n = 0;
function page(patch: Partial<AuditPage> = {}): AuditPage {
  n++;
  return {
    id: `p${n}`,
    hostId: "h1",
    url: `http://www.fixture.test/page-${n}/`,
    canonical: null,
    statusCode: 200,
    title: `Page ${n}`,
    h1: `Heading ${n}`,
    metaDescription: "A description.",
    wordCount: 600,
    rawWordCount: 600,
    lastmod: new Date("2026-06-01T00:00:00Z"),
    schemaTypes: ["CollegeOrUniversity"],
    schemaRaw: [{ "@type": "CollegeOrUniversity", name: "X", sameAs: ["https://en.wikipedia.org/wiki/X"] }],
    faq: [{ q: "Q?", a: "A", source: "schema" }],
    renderMode: "static",
    visibleDates: [],
    robotsMeta: null,
    contentType: "text/html",
    fetchError: null,
    ...patch,
  };
}

function run(patch: Partial<AuditInput>) {
  return evaluateRules({ asOf, siteHosts: ["www.fixture.test"], hosts: [host], pages: [page()], pagespeed: [], entityChecks: [], ...patch });
}
const ids = (fs: ReturnType<typeof run>) => fs.map((f) => f.ruleId);

describe("audit rules", () => {
  it("every rule has why and evidence strength, llms.txt is speculative", () => {
    for (const r of RULES) {
      expect(r.why.length).toBeGreaterThan(40);
      expect(["strong", "moderate", "weak", "speculative"]).toContain(r.evidence_strength);
    }
    expect(RULE_BY_ID.get("llms_txt_missing")?.evidence_strength).toBe("speculative");
    expect(RULE_BY_ID.get("llms_txt_missing")?.title).toMatch(/low evidence of impact/);
  });

  it("a clean page and host produce no findings", () => {
    expect(run({})).toEqual([]);
  });

  it("ai_crawler_blocked: search bots high, training bots info, per bot per host", () => {
    const robotsText = fixture("robots.txt", 1);
    const fs = run({ hosts: [{ ...host, robotsText }] });
    const blocked = fs.filter((f) => f.ruleId === "ai_crawler_blocked");
    const byBot = Object.fromEntries(blocked.map((f) => [f.detail.bot, f.severity]));
    expect(byBot.GPTBot).toBe("info");
    expect(byBot.CCBot).toBe("info");
    expect(byBot.Bytespider).toBe("info");
    expect(byBot["OAI-SearchBot"]).toBeUndefined();
    const partial = fs.find((f) => f.ruleId === "ai_crawler_partially_blocked" && f.detail.bot === "OAI-SearchBot");
    expect(partial?.severity).toBe("low");
    expect(partial?.detail.disallow).toEqual(["/private/"]);
    const search = run({ hosts: [{ ...host, robotsText: "User-agent: PerplexityBot\nDisallow: /\n" }] });
    expect(search.find((f) => f.ruleId === "ai_crawler_blocked")).toMatchObject({ severity: "high", detail: { bot: "PerplexityBot", category: "search", rule: "Disallow: /" } });
  });

  it("robots_txt_unavailable: 5xx is high, 404 is info", () => {
    expect(run({ hosts: [{ ...host, robotsStatus: 503, robotsText: null }] }).find((f) => f.ruleId === "robots_txt_unavailable")?.severity).toBe("high");
    expect(run({ hosts: [{ ...host, robotsStatus: 404, robotsText: null }] }).find((f) => f.ruleId === "robots_txt_unavailable")?.severity).toBe("info");
  });

  it("llms_txt_missing", () => {
    expect(ids(run({ hosts: [{ ...host, llmsTxtStatus: 404 }] }))).toContain("llms_txt_missing");
  });

  it("schema_collegeoruniversity_missing on the primary host only", () => {
    const p = page({ schemaTypes: [], schemaRaw: [] });
    expect(ids(run({ pages: [p] }))).toContain("schema_collegeoruniversity_missing");
    expect(ids(run({ pages: [p], hosts: [{ ...host, isPrimary: false }] }))).not.toContain("schema_collegeoruniversity_missing");
  });

  it("schema_org_sameas_missing", () => {
    const p = page({ schemaRaw: [{ "@type": "CollegeOrUniversity", name: "X" }] });
    expect(ids(run({ pages: [p] }))).toContain("schema_org_sameas_missing");
  });

  it("schema_program_missing and faq_absent on program pages", () => {
    const p = page({ url: "http://www.fixture.test/programs/cs/", h1: "Computer Science, B.S.", faq: [] });
    const fs = ids(run({ pages: [page(), p] }));
    expect(fs).toContain("schema_program_missing");
    expect(fs).toContain("faq_absent");
    const ok = page({ url: "http://www.fixture.test/programs/ds/", schemaTypes: ["EducationalOccupationalProgram", "CollegeOrUniversity"] });
    expect(ids(run({ pages: [ok] }))).not.toContain("schema_program_missing");
  });

  it("schema_course_missing and schema_event_missing", () => {
    expect(ids(run({ pages: [page(), page({ url: "http://www.fixture.test/courses/itcs-1212/", h1: "ITCS 1212 Programming" })] }))).toContain("schema_course_missing");
    expect(ids(run({ pages: [page(), page({ url: "http://www.fixture.test/events/homecoming-2026/", visibleDates: ["2026-10-24"] })] }))).toContain("schema_event_missing");
  });

  it("schema_faqpage_missing needs two HTML FAQ items", () => {
    const faq = [
      { q: "A?", a: "a", source: "details" as const },
      { q: "B?", a: "b", source: "heading" as const },
    ];
    expect(ids(run({ pages: [page({ faq })] }))).toContain("schema_faqpage_missing");
    expect(ids(run({ pages: [page({ faq: faq.slice(0, 1) })] }))).not.toContain("schema_faqpage_missing");
  });

  it("content_stale over 24 months and freshness_unknown", () => {
    const stale = run({ pages: [page({ lastmod: new Date("2021-01-15T00:00:00Z") })] }).find((f) => f.ruleId === "content_stale");
    expect(stale?.detail).toMatchObject({ newest: "2021-01-15", source: "lastmod" });
    expect(ids(run({ pages: [page({ lastmod: new Date("2021-01-15T00:00:00Z"), visibleDates: ["2026-01-01"] })] }))).not.toContain("content_stale");
    expect(ids(run({ pages: [page({ lastmod: null })] }))).toContain("freshness_unknown");
  });

  it("js_only_content", () => {
    expect(run({ pages: [page({ renderMode: "js", rawWordCount: 2 })] }).find((f) => f.ruleId === "js_only_content")?.severity).toBe("high");
  });

  it("thin_page, except the home page", () => {
    expect(ids(run({ pages: [page({ wordCount: 40 })] }))).toContain("thin_page");
    expect(ids(run({ pages: [page({ wordCount: 40, url: "http://www.fixture.test/" })] }))).not.toContain("thin_page");
  });

  it("duplicate_title and duplicate_h1 within a host", () => {
    const a = page({ title: "About | X", h1: "About" });
    const b = page({ title: "About | X", h1: "About" });
    const fs = run({ pages: [a, b] });
    expect(fs.filter((f) => f.ruleId === "duplicate_title")).toHaveLength(2);
    expect(fs.filter((f) => f.ruleId === "duplicate_h1")).toHaveLength(2);
    expect(fs.find((f) => f.ruleId === "duplicate_title" && f.pageId === a.id)?.detail.other_urls).toEqual([b.url]);
  });

  it("meta_description_missing", () => {
    expect(ids(run({ pages: [page({ metaDescription: null })] }))).toContain("meta_description_missing");
  });

  it("canonical_broken: malformed, to an error page, or off site", () => {
    const gone = page({ url: "http://www.fixture.test/gone/", statusCode: 404 });
    const toGone = page({ canonical: gone.url });
    const offsite = page({ canonical: "https://elsewhere.example/x" });
    const malformed = page({ canonical: "http://[bad" });
    const fine = page({ canonical: "http://www.fixture.test/" });
    const fs = run({ pages: [gone, toGone, offsite, malformed, fine] }).filter((f) => f.ruleId === "canonical_broken");
    expect(fs.map((f) => f.pageId).sort()).toEqual([toGone.id, offsite.id, malformed.id].sort());
    expect(fs.find((f) => f.pageId === toGone.id)?.detail.reason).toBe("target returns HTTP 404");
  });

  it("noindex pages skip content rules but still get js_only_content", () => {
    const p = page({ robotsMeta: "noindex", metaDescription: null, wordCount: 10, renderMode: "js" });
    const fs = ids(run({ pages: [page(), p] }));
    expect(fs).toContain("js_only_content");
    expect(fs).not.toContain("thin_page");
    expect(fs).not.toContain("meta_description_missing");
  });

  it("pagespeed_poor and pagespeed_unavailable from stored results", () => {
    const fs = run({
      pagespeed: [
        { pageId: "p1", hostId: "h1", url: "u1", strategy: "mobile", ok: true, score: 0.42, error: null },
        { pageId: "p1", hostId: "h1", url: "u2", strategy: "mobile", ok: true, score: 0.7, error: null },
        { pageId: "p1", hostId: "h1", url: "u3", strategy: "mobile", ok: true, score: 0.95, error: null },
        { pageId: null, hostId: "h1", url: "u4", strategy: "mobile", ok: false, score: null, error: "quota" },
      ],
    });
    expect(fs.filter((f) => f.ruleId === "pagespeed_poor").map((f) => f.severity).sort()).toEqual(["low", "medium"]);
    expect(ids(fs)).toContain("pagespeed_unavailable");
  });

  it("entity_mismatch and entity_missing", () => {
    const fs = run({
      entityChecks: [
        { source: "wikidata", field: "founding_year", status: "mismatch", observed: { value: 1965 }, expected: { value: 1946 } },
        { source: "knowledge_graph", field: "name", status: "missing", observed: { value: null }, expected: { value: "X" } },
        { source: "ipeds", field: "city", status: "match", observed: { value: "Charlotte" }, expected: { value: "Charlotte" } },
      ],
    });
    expect(fs.filter((f) => f.ruleId.startsWith("entity_")).map((f) => f.ruleId).sort()).toEqual(["entity_mismatch", "entity_missing"]);
  });

  it("is deterministic: same input, same fingerprint regardless of input order", () => {
    const pages = [page({ metaDescription: null }), page({ wordCount: 10 }), page({ renderMode: "js" })];
    const a = run({ pages });
    const b = run({ pages: [...pages].reverse() });
    expect(findingsFingerprint(a)).toBe(findingsFingerprint(b));
    expect(sortFindings(a)).toEqual(sortFindings(b));
  });
});
