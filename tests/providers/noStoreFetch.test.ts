import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "../..");

describe("F17 provider fetches use cache no-store", () => {
  it("fireworks, Exa, capture httpJson, and adapter default fetch set no-store", () => {
    const files = [
      "lib/fireworks.ts",
      "lib/demand/fetchSource.ts",
      "lib/capture/http.ts",
      "lib/capture/adapters/common.ts",
      "lib/serpapi.ts",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      expect(src, rel).toMatch(/["']no-store["']/);
    }
  });
});
