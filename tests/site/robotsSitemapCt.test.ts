import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { ALL_AI_BOT_NAMES, CORE_AI_BOTS, matchAiBot } from "@/lib/site/aiBots";
import { parseCrtSh } from "@/lib/site/crtsh";
import { crawlDelayFor, decide, isAllowed, parseRobots } from "@/lib/site/net/robots";
import { parseSitemap } from "@/lib/site/sitemap";

const FIX = path.join(__dirname, "../fixtures/site");
const read = (p: string) => fs.readFileSync(path.join(FIX, p), "utf8");

describe("robots.txt", () => {
  const robots = parseRobots(read("site/robots.txt"));

  it("reads sitemap lines", () => {
    expect(robots.sitemaps).toEqual(["http://www.fixture.test:{{PORT}}/sitemap_index.xml"]);
  });

  it("blocks GPTBot everywhere through its own group", () => {
    const d = decide(robots, "GPTBot", "/");
    expect(d.allowed).toBe(false);
    expect(d.rule?.pattern).toBe("/");
    expect(d.matchedAgents).toContain("gptbot");
  });

  it("lets OAI-SearchBot in, and the longest rule wins", () => {
    expect(decide(robots, "OAI-SearchBot", "/").allowed).toBe(true);
    expect(decide(robots, "OAI-SearchBot", "/private/").allowed).toBe(false);
    expect(decide(robots, "OAI-SearchBot", "/private/public-note.html").allowed).toBe(true);
  });

  it("falls back to the * group for unknown agents", () => {
    expect(isAllowed(robots, "UNCCGEOAudit", "http://www.fixture.test/admin/settings")).toBe(false);
    expect(isAllowed(robots, "UNCCGEOAudit", "http://www.fixture.test/programs/")).toBe(true);
  });

  it("supports * and $ patterns", () => {
    expect(isAllowed(robots, "UNCCGEOAudit", "http://www.fixture.test/files/report.pdf")).toBe(false);
    expect(isAllowed(robots, "UNCCGEOAudit", "http://www.fixture.test/files/report.pdf?x=1")).toBe(true);
    expect(isAllowed(robots, "UNCCGEOAudit", "http://www.fixture.test/search?q=test")).toBe(false);
  });

  it("allow wins a tie of equal length", () => {
    const r = parseRobots("User-agent: *\nDisallow: /page\nAllow: /page\n");
    expect(decide(r, "x", "/page").allowed).toBe(true);
  });

  it("merges consecutive user-agent lines into one group and reads crawl-delay", () => {
    const r = parseRobots("User-agent: a\nUser-agent: b\nDisallow: /x\nCrawl-delay: 4\n");
    expect(decide(r, "b", "/x").allowed).toBe(false);
    expect(crawlDelayFor(r, "a")).toBe(4);
  });

  it("treats an empty Disallow as allow all", () => {
    expect(decide(parseRobots("User-agent: *\nDisallow:\n"), "x", "/anything").allowed).toBe(true);
  });
});

describe("sitemaps", () => {
  it("parses a sitemap index", () => {
    const s = parseSitemap(read("site/sitemap_index.xml"));
    expect(s.kind).toBe("index");
    expect(s.entries.map((e) => e.loc)).toEqual([
      "http://www.fixture.test:{{PORT}}/sitemap-pages.xml",
      "http://www.fixture.test:{{PORT}}/sitemap-admissions.xml.gz",
    ]);
  });

  it("parses a urlset with lastmod", () => {
    const s = parseSitemap(read("site/sitemap-pages.xml"));
    expect(s.kind).toBe("urlset");
    expect(s.entries.find((e) => e.loc.endsWith("/programs/computer-science/"))?.lastmod).toBe("2021-01-15");
  });

  it("accepts plain text sitemaps", () => {
    expect(parseSitemap("https://a.example/1\nhttps://a.example/2\n").entries).toHaveLength(2);
  });
});

describe("crt.sh parser", () => {
  // A stored crt.sh response for %.charlotte.edu (fetched 2026-11-03, trimmed to 50 rows).
  const body = read("external/crtsh_charlotte_edu.json");

  it("extracts hosts under the root domain, wildcards reduced to their base", () => {
    const hosts = parseCrtSh(body, "charlotte.edu");
    expect(hosts.length).toBeGreaterThan(10);
    expect(hosts).toContain("api.sonia.charlotte.edu");
    expect(hosts.every((h) => h === "charlotte.edu" || h.endsWith(".charlotte.edu"))).toBe(true);
    expect(hosts.some((h) => h.includes("*"))).toBe(false);
    expect(hosts).toEqual([...hosts].sort());
  });

  it("splits multi name certificates and ignores other domains", () => {
    const hosts = parseCrtSh(
      [{ name_value: "*.www.charlotte.edu\nfoo.charlotte.edu\nevil.example.com\ncharlotte.edu.evil.com" }],
      "charlotte.edu",
    );
    expect(hosts).toEqual(["foo.charlotte.edu", "www.charlotte.edu"]);
  });

  it("returns nothing for malformed input", () => {
    expect(parseCrtSh("<html>rate limited</html>", "charlotte.edu")).toEqual([]);
  });
});

describe("AI user agents", () => {
  it("tracks at least 40 named AI agents for robots checks, all present in the vendored list", () => {
    expect(CORE_AI_BOTS.length).toBeGreaterThanOrEqual(40);
    const names = new Set(ALL_AI_BOT_NAMES);
    for (const b of CORE_AI_BOTS) expect(names.has(b.name), b.name).toBe(true);
    for (const required of ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "Google-Extended", "Applebot-Extended", "Bytespider", "CCBot", "meta-externalagent", "Amazonbot"]) {
      expect(CORE_AI_BOTS.some((b) => b.name === required), required).toBe(true);
    }
  });

  it("matches real user agent strings", () => {
    expect(matchAiBot("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot")).toBe("GPTBot");
    expect(matchAiBot("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)")).toBe("ClaudeBot");
    expect(matchAiBot("Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)")).toBe("OAI-SearchBot");
    expect(matchAiBot("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)")).toBe("PerplexityBot");
  });

  it("does not match ordinary browsers or search crawlers by accident", () => {
    expect(matchAiBot("Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)")).toBeNull();
    expect(matchAiBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15")).toBeNull();
    expect(matchAiBot("")).toBeNull();
  });

  it("never matches robots-only tokens in a User-Agent", () => {
    expect(matchAiBot("Mozilla/5.0 Google-Extended")).toBeNull();
  });
});
