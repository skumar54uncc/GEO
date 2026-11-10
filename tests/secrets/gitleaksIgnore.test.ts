import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("F01 gitleaks fixture allowlist", () => {
  it(".gitleaksignore lists nine recorded-fixture fingerprints (not scrubbed fixtures)", () => {
    const p = path.join(__dirname, "../../.gitleaksignore");
    expect(fs.existsSync(p), ".gitleaksignore must exist").toBe(true);
    const text = fs.readFileSync(p, "utf8");
    const lines = text.split("\n").filter((l) => l.includes("tests/fixtures/capture/") && l.includes("generic-api-key"));
    expect(lines.length).toBe(9);
    expect(text).not.toMatch(/api_key|password|SERPAPI_API_KEY/i);
  });
});
