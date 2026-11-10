import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("F16 worker-ping retryLimit", () => {
  it("scripts/worker-ping.ts sends with retryLimit: 0", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../scripts/worker-ping.ts"), "utf8");
    expect(src).toMatch(/retryLimit:\s*0/);
  });
});
