import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/pg/client";
import { botHits, brands, siteHosts, sites } from "@/lib/db/pg/schema";
import { detectFormat, importBotLog, parseClfDate, parseLine } from "@/lib/site/botlog";
import { resetDatabase } from "../helpers";

const COMBINED = [
  '203.0.113.9 - - [03/Nov/2026:10:15:32 -0500] "GET /programs/computer-science/?utm_source=x&email=a@b.edu HTTP/1.1" 200 5123 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot"',
  '198.51.100.4 - - [03/Nov/2026:10:16:01 -0500] "GET /about/ HTTP/1.1" 200 812 "https://www.google.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"',
  '192.0.2.77 - - [03/Nov/2026:10:17:44 -0500] "GET /robots.txt HTTP/1.1" 404 0 "-" "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)"',
  "this line is garbage",
];
const VHOST = 'www.fixture.test:443 203.0.113.10 - - [03/Nov/2026:11:00:00 +0000] "GET /news/ HTTP/2.0" 301 0 "-" "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)"';
const COMMON = '203.0.113.9 - frank [10/Oct/2026:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326';
const CLOUDFLARE = [
  JSON.stringify({ ClientIP: "203.0.113.50", ClientRequestHost: "admissions.fixture.test", ClientRequestURI: "/apply/?ref=x", ClientRequestUserAgent: "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)", EdgeResponseStatus: 200, EdgeStartTimestamp: "2026-11-02T08:00:00Z" }),
  JSON.stringify({ ClientIP: "203.0.113.51", ClientRequestHost: "www.fixture.test", ClientRequestURI: "/", ClientRequestUserAgent: "Mozilla/5.0 Firefox/131.0", EdgeResponseStatus: 200, EdgeStartTimestamp: 1762070400000000000 }),
  JSON.stringify({ ClientIP: "203.0.113.52", ClientRequestHost: "www.fixture.test", ClientRequestURI: "/about/", ClientRequestUserAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)", EdgeResponseStatus: 304, EdgeStartTimestamp: 1762070400 }),
];

describe("log line parsing", () => {
  it("parses CLF dates with offsets", () => {
    expect(parseClfDate("03/Nov/2026:10:15:32 -0500")?.toISOString()).toBe("2026-11-03T15:15:32.000Z");
  });

  it("parses combined lines and strips query strings", () => {
    const l = parseLine(COMBINED[0], "combined");
    expect(l).toMatchObject({ path: "/programs/computer-science/", status: 200, host: null });
    expect(l?.userAgent).toMatch(/GPTBot/);
    expect(JSON.stringify(l)).not.toMatch(/203\.0\.113\.9|email|utm_source/);
  });

  it("reads a leading vhost", () => {
    expect(parseLine(VHOST, "combined")).toMatchObject({ host: "www.fixture.test", path: "/news/", status: 301 });
  });

  it("parses common format, which has no user agent", () => {
    expect(parseLine(COMMON, "common")).toMatchObject({ path: "/apache_pb.gif", status: 200, userAgent: null });
  });

  it("parses Cloudflare JSON with string, nanosecond and second timestamps", () => {
    const [a, b, c] = CLOUDFLARE.map((l) => parseLine(l, "cloudflare_json"));
    expect(a).toMatchObject({ host: "admissions.fixture.test", path: "/apply/", status: 200 });
    expect(b?.at.toISOString()).toBe("2025-11-02T08:00:00.000Z");
    expect(c?.at.toISOString()).toBe("2025-11-02T08:00:00.000Z");
    expect(JSON.stringify([a, b, c])).not.toMatch(/203\.0\.113/);
  });

  it("detects the format", () => {
    expect(detectFormat(COMBINED)).toBe("combined");
    expect(detectFormat([COMMON])).toBe("common");
    expect(detectFormat(CLOUDFLARE)).toBe("cloudflare_json");
  });

  it("returns null for garbage", () => {
    expect(parseLine("this line is garbage", "combined")).toBeNull();
    expect(parseLine("{not json", "cloudflare_json")).toBeNull();
  });
});

describe("importBotLog", () => {
  let siteId: string;
  beforeAll(async () => {
    await resetDatabase();
    const db = getDb();
    const [org] = await db.execute(sql`INSERT INTO organizations (name, slug) VALUES ('T', 't') RETURNING id`).then((r) => r.rows as Array<{ id: string }>);
    const [brand] = await db.insert(brands).values({ orgId: org.id, name: "Fixture", rootDomain: "fixture.test" }).returning();
    const [site] = await db.insert(sites).values({ brandId: brand.id, rootUrl: "http://fixture.test/" }).returning();
    await db.insert(siteHosts).values([
      { siteId: site.id, host: "www.fixture.test", discoveredVia: "manual" },
      { siteId: site.id, host: "admissions.fixture.test", discoveredVia: "sitemap" },
    ]);
    siteId = site.id;
  });

  it("stores only AI bot rows, never an IP, and maps hosts", async () => {
    const db = getDb();
    const content = Buffer.from([...COMBINED, VHOST].join("\n"));
    const res = await importBotLog(db, { siteId, content, fileName: "access.log", defaultHost: "www.fixture.test" });
    expect(res).toMatchObject({ format: "combined", lines_total: 5, lines_unparsed: 1, bot_lines: 3, already_imported: false });
    const rows = await db.select().from(botHits).where(eq(botHits.siteId, siteId));
    expect(rows.map((r) => r.botName).sort()).toEqual(["ClaudeBot", "GPTBot", "PerplexityBot"]);
    expect(rows.every((r) => r.hostId !== null)).toBe(true);
    const cols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'bot_hits'`);
    expect((cols.rows as Array<{ column_name: string }>).map((c) => c.column_name).some((c) => /ip/i.test(c) && c !== "bot_name")).toBe(false);
    expect(JSON.stringify(rows)).not.toMatch(/203\.0\.113|198\.51\.100|192\.0\.2\./);
  });

  it("is idempotent per file hash", async () => {
    const db = getDb();
    const content = Buffer.from([...COMBINED, VHOST].join("\n"));
    const again = await importBotLog(db, { siteId, content });
    expect(again.already_imported).toBe(true);
    expect((await db.select().from(botHits).where(eq(botHits.siteId, siteId))).length).toBe(3);
  });

  it("imports Cloudflare JSON and notes that common format cannot identify bots", async () => {
    const db = getDb();
    const cf = await importBotLog(db, { siteId, content: Buffer.from(CLOUDFLARE.join("\n")) });
    expect(cf).toMatchObject({ format: "cloudflare_json", bot_lines: 2 });
    const common = await importBotLog(db, { siteId, content: Buffer.from(COMMON) });
    expect(common.bot_lines).toBe(0);
    expect(common.note).toMatch(/no user agent/);
  });
});
