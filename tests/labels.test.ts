import { describe, expect, it } from "vitest";
import {
  answersChecked,
  enginePlain,
  fidelityPlain,
  formatScanDate,
  runnerPlain,
  searchIndexPlain,
  shortHash,
  sourceClassPlain,
} from "@/lib/ui/labels";

describe("lib/ui/labels", () => {
  it("maps runners to plain language; falls back to raw id", () => {
    expect(runnerPlain("ui_provider")).toMatch(/real app/i);
    expect(runnerPlain("unknown_runner")).toBe("unknown_runner");
  });

  it("maps fidelity and engines", () => {
    expect(fidelityPlain("high")).toMatch(/closest/i);
    expect(enginePlain("chatgpt")).toBe("ChatGPT");
  });

  it("shortHash and dates", () => {
    expect(shortHash("abcdef0123456789")).toBe("abcdef01");
    expect(shortHash(null)).toBe("unknown");
    expect(formatScanDate("not-a-date")).toBe("unknown date");
    expect(formatScanDate("2026-11-03T12:00:00.000Z")).toMatch(/2026/);
  });

  it("answersChecked pluralization", () => {
    expect(answersChecked(1)).toBe("1 AI answer checked");
    expect(answersChecked(3)).toBe("3 AI answers checked");
  });

  it("searchIndexPlain and sourceClassPlain", () => {
    expect(searchIndexPlain("chat")).toBe("Chat engines");
    expect(searchIndexPlain("google")).toBe("Google AI surfaces");
    expect(sourceClassPlain("owned")).toBe("Our site");
    expect(sourceClassPlain("custom_type")).toBe("custom type");
  });
});
