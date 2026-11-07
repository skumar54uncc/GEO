import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "../..");

describe("Scout UI: no blended visibility index", () => {
  it("Overview and Visibility screens do not invent a blended score label", () => {
    const files = [
      path.join(ROOT, "app/page.tsx"),
      path.join(ROOT, "app/campaigns/[id]/dashboard/page.tsx"),
      path.join(ROOT, "app/overview/page.tsx"),
    ];
    const banned = /visibility index|blended score|overall visibility score/i;
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, "utf8");
      expect(text, path.relative(ROOT, file)).not.toMatch(banned);
    }
  });

  it("Overview KPI status helper lives in lib/ui (not ad-hoc in metrics)", () => {
    const helper = path.join(ROOT, "lib/ui/kpiStatus.ts");
    expect(fs.existsSync(helper)).toBe(true);
    const page = fs.readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
    expect(page).toMatch(/kpiStatusFromComparison/);
  });
});
