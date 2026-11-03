import { describe, expect, it } from "vitest";
import { extractPage, visibleText } from "@/lib/site/extract";
import { detectRenderMode } from "@/lib/site/render";
import { fixture, words } from "../fixtures/site/server";

const PORT = 4321;
const URL_BASE = `http://www.fixture.test:${PORT}`;

describe("extractPage", () => {
  const home = extractPage(fixture("home.html", PORT), `${URL_BASE}/`);

  it("reads title, h1, meta, canonical and schema types", () => {
    expect(home.title).toBe("Home | UNC Charlotte");
    expect(home.h1).toBe("Welcome to UNC Charlotte");
    expect(home.metaDescription).toBe("Fixture home page for the audit tests.");
    expect(home.canonical).toBe(`${URL_BASE}/`);
    expect(home.schemaTypes).toEqual(["CollegeOrUniversity", "PostalAddress"]);
  });

  it("lists links with internal flags and drops fragments", () => {
    const pdf = home.links.find((l) => l.url.endsWith("/files/brochure.pdf"));
    expect(pdf?.internal).toBe(true);
    expect(home.links.find((l) => l.url.startsWith("https://www.example.com"))?.internal).toBe(false);
    expect(home.links.every((l) => !l.url.includes("#"))).toBe(true);
  });

  it("finds FAQ blocks in details elements and visible dates", () => {
    const ds = extractPage(fixture("data-science.html", PORT), `${URL_BASE}/programs/data-science/`);
    expect(ds.faq.map((f) => f.q)).toEqual(["How long does the program take?", "Can I study part time?"]);
    expect(ds.faq.every((f) => f.source === "details")).toBe(true);
    expect(ds.visibleDates).toEqual(["2026-10-01"]);
    const event = extractPage(fixture("homecoming.html", PORT), `${URL_BASE}/events/homecoming-2026/`);
    expect(event.visibleDates).toEqual(["2026-10-24"]);
  });

  it("collects types inside @graph", () => {
    expect(extractPage(fixture("about.html", PORT), `${URL_BASE}/about/`).schemaTypes).toEqual(["Organization"]);
  });

  it("counts schema parse errors instead of throwing", () => {
    const p = extractPage('<html><head><script type="application/ld+json">{bad json</script></head><body>x</body></html>', `${URL_BASE}/`);
    expect(p.schemaParseErrors).toBe(1);
    expect(p.schemaTypes).toEqual([]);
  });
});

describe("render mode", () => {
  it("calls a server rendered page static", () => {
    const html = fixture("computer-science.html", PORT);
    const v = detectRenderMode(visibleText(html), extractPage(html, `${URL_BASE}/`).text);
    expect(v.mode).toBe("static");
    expect(v.overlap).toBe(1);
  });

  it("calls a page whose text only appears after JavaScript js", () => {
    const raw = fixture("js-app.html", PORT);
    // What the browser shows after the inline script runs.
    const rendered = `<html><body><div id="app"><h1>Campus news</h1><p>${words(260)}</p></div></body></html>`;
    const v = detectRenderMode(visibleText(raw), extractPage(rendered, `${URL_BASE}/news/js-app/`).text);
    expect(v.mode).toBe("js");
    expect(v.rawWords).toBeLessThan(5);
    expect(v.renderedWords).toBeGreaterThan(250);
  });

  it("does not call a tiny page js", () => {
    expect(detectRenderMode("", "Just a few words here").mode).toBe("static");
  });
});
