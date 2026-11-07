import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "../..");
const DIRS = ["app", "components", "lib/ui"];
const HEX = /#[0-9A-Fa-f]{3,8}\b/;
const ALLOW_EXT = new Set([".tsx", ".ts", ".jsx", ".js"]);

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(full, out);
    } else if (ALLOW_EXT.has(path.extname(name))) {
      out.push(full);
    }
  }
  return out;
}

describe("Scout UI: no raw hex in components", () => {
  it("keeps hex only in globals.css / tokens, not in app or components TSX", () => {
    const offenders: Array<{ file: string; line: number; text: string }> = [];
    for (const rel of DIRS) {
      for (const file of walk(path.join(ROOT, rel))) {
        // globals.css is the token source; skip if accidentally under app
        if (file.endsWith(`${path.sep}globals.css`)) continue;
        const text = fs.readFileSync(file, "utf8");
        const lines = text.split("\n");
        lines.forEach((line, i) => {
          // Allow comments that mention hex for documentation, and SVG data URLs are rare.
          if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return;
          if (HEX.test(line)) {
            offenders.push({ file: path.relative(ROOT, file), line: i + 1, text: line.trim() });
          }
        });
      }
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });

  it("never uses brand-accent / Niner Gold as a text color utility in TSX", () => {
    const goldText = /text-scout-accent|text-uncc-gold|color:\s*var\(--brand-accent\)|color:\s*var\(--org-accent\)/;
    const offenders: string[] = [];
    for (const rel of ["app", "components"]) {
      for (const file of walk(path.join(ROOT, rel))) {
        if (!file.endsWith(".tsx")) continue;
        const text = fs.readFileSync(file, "utf8");
        if (goldText.test(text)) offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
