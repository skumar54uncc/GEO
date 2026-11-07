import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "../..");

describe("Scout motion respects prefers-reduced-motion", () => {
  it("globals.css disables rise/grow/hover motion under reduced-motion", () => {
    const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/\.scout-rise/);
    expect(css).toMatch(/animation:\s*none\s*!important/);
  });

  it("ScoutCard and CountUp consult useReducedMotion", () => {
    const prim = fs.readFileSync(path.join(ROOT, "components/scout/primitives.tsx"), "utf8");
    expect(prim).toMatch(/useReducedMotion/);
    expect(prim).toMatch(/initial=\{reduce \? false/);
    expect(prim).toMatch(/if \(reduce\) return/);
  });
});
