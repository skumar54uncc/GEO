import { describe, expect, it } from "vitest";
import { csvEscape } from "@/lib/strategy/export";

describe("csvEscape", () => {
  it("quotes commas and escapes quotes", () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it("prefixes formula metacharacters with apostrophe before quoting when needed", () => {
    expect(csvEscape("=cmd")).toBe("'=cmd");
    expect(csvEscape("+1")).toBe("'+1");
    expect(csvEscape("-2")).toBe("'-2");
    expect(csvEscape("@user")).toBe("'@user");
  });

  it("prefixes leading formula chars in values that also need quoting", () => {
    expect(csvEscape("=a,b")).toBe('"\'=a,b"');
  });
});
