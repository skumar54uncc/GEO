import { describe, expect, it } from "vitest";
import { safeHref } from "@/lib/url/safeHref";

describe("safeHref", () => {
  it("allows same-origin paths and http(s)", () => {
    expect(safeHref("/campaigns/x")).toBe("/campaigns/x");
    expect(safeHref("https://example.edu/a")).toBe("https://example.edu/a");
    expect(safeHref("http://example.edu/a")).toBe("http://example.edu/a");
  });

  it("rejects javascript, data, and protocol-relative URLs", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("//evil.example/phish")).toBeNull();
    expect(safeHref("vbscript:msg")).toBeNull();
  });
});
