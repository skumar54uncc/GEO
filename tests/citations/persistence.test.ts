import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { enqueueCitationFetches, processCitationFetch } from "@/lib/citations/fetch";
import { citations, citedPages, rawPayloads } from "@/lib/db/pg/schema";
import type { FetchResult } from "@/lib/site/net/ssrf";
import { resetDatabase } from "../helpers";
import { addDraw, newScan, seed } from "../metrics/dbFixtures";

const html = fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "citations", "feature-rich.html"));
const UA = "Mozilla/5.0 (compatible; UNCCGEOAudit/0.2; +https://example.edu/crawler)";

function response(url: string, body: Buffer, contentType: string): FetchResult {
  return {
    ok: true,
    status: 200,
    url,
    finalUrl: url,
    redirects: [],
    headers: { "content-type": contentType },
    body,
    truncated: false,
    blocked: null,
    error: null,
  };
}

describe("citation fetch persistence", () => {
  beforeEach(resetDatabase);

  it("queues one fetch per canonical URL and keeps third-party text file-backed", async () => {
    const context = await seed(1);
    const scanId = await newScan(context, context.promptSetId, "running");
    const drawId = await addDraw(context, scanId, context.promptIds[0]);
    await context.db.insert(citations).values([
      {
        drawId,
        url: "https://example.org/article/?utm_source=chatgpt",
        domain: "example.org",
        sourceClass: "other",
        position: 1,
      },
      {
        drawId,
        url: "https://example.org/article",
        domain: "example.org",
        sourceClass: "other",
        position: 2,
      },
    ]);
    const sent: string[] = [];
    const sentOptions: object[] = [];
    const boss = {
      send: async (_queue: string, data: { canonical_url: string }, options: object) => {
        sent.push(data.canonical_url);
        sentOptions.push(options);
        return "job-id";
      },
    };

    const queued = await enqueueCitationFetches(context.db, boss, "citation.fetch", [drawId], { retryLimit: 0 });
    expect(queued).toEqual({ queued: 1, skipped: 1 });
    expect(sent).toEqual(["https://example.org/article"]);
    expect(sentOptions).toEqual([{ retryLimit: 0 }]);

    const result = await processCitationFetch(context.db, sent[0], {
      userAgent: UA,
      minHostDelayMs: 0,
      wait: async () => {},
      fetch: async (url) =>
        url.endsWith("/robots.txt")
          ? response(url, Buffer.from("User-agent: *\nAllow: /\n"), "text/plain")
          : response(url, html, "text/html"),
    });
    expect(result.status).toBe("fetched");
    const [page] = await context.db.select().from(citedPages).where(eq(citedPages.canonicalUrl, sent[0]));
    expect(page).toMatchObject({ fetchStatus: "fetched", title: "7 Best Clean Energy Programs", contentType: "news" });
    expect(page.textRef).toBeTruthy();
    const [raw] = await context.db.select().from(rawPayloads).where(eq(rawPayloads.sha256, page.textRef!));
    expect(raw).toMatchObject({ storage: "file", content: null, mediaType: "text/plain; charset=utf-8" });
    expect(raw.path).toBeTruthy();

    const failedUrl = "https://failed.example.org/article";
    await context.db.insert(citedPages).values({ canonicalUrl: failedUrl });
    const failed = await processCitationFetch(context.db, failedUrl, {
      userAgent: UA,
      fetch: async (url) => ({
        ...response(url, Buffer.alloc(0), "text/plain"),
        ok: false,
        status: null,
        error: "fixture network failure",
      }),
    });
    expect(failed.status).toBe("error");
    const [failedPage] = await context.db.select().from(citedPages).where(eq(citedPages.canonicalUrl, failedUrl));
    expect(failedPage).toMatchObject({
      fetchStatus: "error",
      fetchError: expect.stringContaining("fixture network failure"),
    });
  });
});
