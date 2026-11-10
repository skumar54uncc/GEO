import { describe, expect, it } from "vitest";
import { highlightAnswerHtml } from "@/lib/analysis/answerExplorer";

describe("highlightAnswerHtml", () => {
  it("renders script, img onerror, and javascript: URLs as inert escaped text", () => {
    const text =
      'Hello <script>alert(1)</script> <img src=x onerror=alert(1)> <a href="javascript:alert(1)">x</a> done';
    const { html, skipped } = highlightAnswerHtml(text, []);
    expect(skipped).toBe(0);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a ");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;a href=&quot;javascript:alert(1)&quot;&gt;x&lt;/a&gt;");
    // No live attribute — only the escaped entity form remains.
    expect(html).not.toMatch(/<[^>]*href\s*=/i);
  });

  it("applies spans on raw text then escapes segments (ampersand and angle before brand)", () => {
    const brand = "UNC Charlotte";
    const text = `A & B < C ${brand} end`;
    const start = text.indexOf(brand);
    const end = start + brand.length;
    const { html } = highlightAnswerHtml(text, [{ start, end, kind: "brand", label: brand }]);
    expect(html.startsWith("A &amp; B &lt; C ")).toBe(true);
    expect(html).toContain('<mark class="mention-brand"');
    expect(html).toContain(`<span class="answer-hl-tag">us</span>${brand}</mark>`);
    expect(html).toContain(" end");
    // Brand string itself unchanged (no entities inside the name).
    expect(html).toMatch(new RegExp(`answer-hl-tag">us</span>${brand}</mark>`));
  });

  it("wraps a brand span with mention-brand", () => {
    const text = "UNC Charlotte leads the region.";
    const start = text.indexOf("UNC Charlotte");
    const end = start + "UNC Charlotte".length;
    const { html } = highlightAnswerHtml(text, [{ start, end, kind: "brand", label: "UNC Charlotte" }]);
    expect(html).toContain('<mark class="mention-brand"');
    expect(html).toContain('<span class="answer-hl-tag">us</span>');
    expect(html).toContain("UNC Charlotte");
  });

  it("wraps citation spans with mention-citation", () => {
    const text = "See example.edu for details.";
    const start = text.indexOf("example.edu");
    const end = start + "example.edu".length;
    const { html } = highlightAnswerHtml(text, [{ start, end, kind: "citation", label: "example.edu" }]);
    expect(html).toContain('<mark class="mention-citation"');
    expect(html).toContain('<span class="answer-hl-tag">cite</span>example.edu');
  });

  it("brand inside a citation span produces sibling marks, not broken nesting", () => {
    const text = "See UNC Charlotte page";
    const citeStart = 0;
    const citeEnd = text.length;
    const brandStart = text.indexOf("UNC Charlotte");
    const brandEnd = brandStart + "UNC Charlotte".length;
    const { html } = highlightAnswerHtml(text, [
      { start: citeStart, end: citeEnd, kind: "citation", label: "example.edu" },
      { start: brandStart, end: brandEnd, kind: "brand", label: "UNC Charlotte" },
    ]);
    expect(html).toContain('class="mention-citation"');
    expect(html).toContain('class="mention-brand"');
    // No nested mark inside mark.
    expect(html).not.toMatch(/<mark[^>]*>[^<]*<mark/);
    expect(html.match(/<\/mark>/g)?.length).toBe(html.match(/<mark /g)?.length);
  });

  it("adjacent brand and competitor spans are valid siblings", () => {
    const text = "UsThem rest";
    const { html } = highlightAnswerHtml(text, [
      { start: 0, end: 2, kind: "brand", label: "Us" },
      { start: 2, end: 6, kind: "competitor", label: "Them" },
    ]);
    expect(html).toContain('mention-brand');
    expect(html).toContain('mention-competitor');
    expect(html).toContain(" rest");
    expect(html.match(/<\/mark>/g)?.length).toBe(2);
  });

  it("prefers brand over citation and competitor on full overlap", () => {
    const text = "ABC region";
    const { html } = highlightAnswerHtml(text, [
      { start: 0, end: 3, kind: "competitor", label: "Other" },
      { start: 0, end: 3, kind: "citation", label: "example.edu" },
      { start: 0, end: 3, kind: "brand", label: "Us" },
    ]);
    expect(html).toMatch(/^<mark class="mention-brand"/);
    expect(html).not.toContain("mention-citation");
    expect(html).not.toContain("mention-competitor");
  });

  it("skips and counts out-of-range or null-like offsets without throwing", () => {
    const text = "Hello world";
    const { html, skipped } = highlightAnswerHtml(text, [
      { start: null, end: 3, kind: "brand", label: "x" },
      { start: 0, end: null, kind: "brand", label: "x" },
      { start: null, end: null, kind: "citation", label: "x" },
      { start: Number.NaN, end: 3, kind: "brand", label: "x" },
      { start: -1, end: 2, kind: "brand", label: "x" },
      { start: 0, end: 999, kind: "brand", label: "x" },
      { start: 5, end: 5, kind: "brand", label: "x" },
      { start: 0, end: 5, kind: "brand", label: "  " },
      { start: 0, end: 5, kind: "brand", label: "Hello" },
    ]);
    expect(skipped).toBe(8);
    expect(html).toContain("mention-brand");
    expect(html).toContain("Hello");
  });
});
