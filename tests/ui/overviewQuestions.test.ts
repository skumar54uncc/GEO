import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "../..");

describe("Overview Questions table", () => {
  it("does not render the placeholder row text", () => {
    const page = fs.readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
    expect(page).not.toContain("Open the full prompt list for this campaign");
    expect(page).toMatch(/overview-questions/);
  });
});
