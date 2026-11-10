import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { PROVIDER_IDS, ROUTES, allRoutes, createAdapter, isProviderId } from "@/lib/capture/registry";

const ROOT = path.join(__dirname, "../..");

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkTsFiles(p));
    else if (ent.isFile() && /\.(ts|tsx|js|mjs|json)$/.test(ent.name)) out.push(p);
  }
  return out;
}

describe("Bright Data is banned", () => {
  it("no adapter file, registry id, route, or package.json dependency references brightdata", () => {
    const adapterDir = path.join(ROOT, "lib/capture/adapters");
    const adapterNames = fs.readdirSync(adapterDir);
    expect(adapterNames.some((n) => /brightdata/i.test(n)), "adapter filename").toBe(false);

    expect(PROVIDER_IDS as readonly string[]).not.toContain("brightdata");
    expect(isProviderId("brightdata")).toBe(false);
    expect(() => createAdapter("brightdata" as unknown as (typeof PROVIDER_IDS)[number])).toThrow(/Unknown provider/);

    for (const route of allRoutes()) {
      expect(route.provider, `${route.engine}/${route.runner}`).not.toBe("brightdata");
    }
    for (const engine of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
      const r = ROUTES[engine];
      for (const route of [r.primary, r.fallback, r.parametric, ...r.parity]) {
        if (!route) continue;
        expect(route.provider, `${engine}`).not.toBe("brightdata");
      }
    }

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of Object.keys(deps)) {
      expect(name.toLowerCase(), name).not.toMatch(/brightdata|bright-data|bright_data/);
    }

    for (const file of walkTsFiles(adapterDir)) {
      const text = fs.readFileSync(file, "utf8");
      expect(text.toLowerCase(), path.relative(ROOT, file)).not.toMatch(/brightdata|bright.?data/);
    }

    const registry = fs.readFileSync(path.join(ROOT, "lib/capture/registry.ts"), "utf8");
    expect(registry.toLowerCase()).not.toMatch(/brightdata|bright.?data/);
  });
});
