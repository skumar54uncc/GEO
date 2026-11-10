import { describe, expect, it } from "vitest";
import { highlightGapTermsHtml } from "@/lib/analysis/highlightTerms";

describe("highlightGapTermsHtml", () => {
  it("escapes markup and still wraps a gap term", () => {
    const text = 'Guide: <script>alert(1)</script> Energy programs';
    const { html, matched } = highlightGapTermsHtml(text, ["Energy"]);
    expect(matched).toBe(1);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('<mark class="mention-gap-term" data-label="Energy">Energy</mark>');
  });

  it("applies offsets on raw text before escaping (& and < before the term)", () => {
    const term = "Demo University";
    const text = `A & B < C ${term} end`;
    const { html } = highlightGapTermsHtml(text, [term]);
    expect(html.startsWith("A &amp; B &lt; C ")).toBe(true);
    expect(html).toContain(`>${term}</mark>`);
  });

  it("skips empty terms and returns escaped text when nothing matches", () => {
    const { html, matched } = highlightGapTermsHtml("Hello world", ["", "  ", "zzz"]);
    expect(matched).toBe(0);
    expect(html).toBe("Hello world");
  });

  it("does not nest overlapping matches; longer term wins when sorted first", () => {
    const { html, matched } = highlightGapTermsHtml("Demo University Energy", ["Demo University", "Demo"]);
    expect(matched).toBe(1);
    expect(html).toContain('data-label="Demo University"');
    expect(html).not.toContain('data-label="Demo"');
  });
});
