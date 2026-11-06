import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { citations, citedPages } from "@/lib/db/pg/schema";
import { putRawFile } from "@/lib/rawstore";
import { extractPage } from "@/lib/site/extract";
import { guardedFetch, type FetchOptions, type FetchResult, type NetPolicy } from "@/lib/site/net/ssrf";
import { crawlDelayFor, decide, parseRobots } from "@/lib/site/net/robots";
import { CRAWLER_TOKEN, crawlerUserAgent } from "@/lib/site/net/userAgent";
import { canonicalizeCitationUrl } from "./canonical";
import { extractCitationFeatures, inferContentType } from "./features";

const MAX_PAGE_BYTES = 5 * 1024 * 1024;
const MIN_HOST_DELAY_MS = 1_000;

export type CitationFetchData = { canonical_url: string };
export type JobSender = { send(queue: string, data: CitationFetchData, options: object): Promise<string | null> };
export type CitationFetchDeps = {
  fetch?: (url: string, options: FetchOptions) => Promise<FetchResult>;
  policy?: NetPolicy;
  wait?: (ms: number) => Promise<void>;
  userAgent?: string;
  minHostDelayMs?: number;
};

type DocumentResult =
  | { status: "fetched"; statusCode: number; finalUrl: string; html: Buffer; robotsResult: object }
  | { status: "blocked" | "error"; statusCode: number | null; error: string; robotsResult: object };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Robots and page requests both use guardedFetch; no redirect can bypass the SSRF checks. */
export async function fetchCitationDocument(url: string, deps: CitationFetchDeps = {}): Promise<DocumentResult> {
  const canonical = canonicalizeCitationUrl(url);
  if (!canonical) {
    return { status: "blocked", statusCode: null, error: "citation URL must use HTTP(S) without credentials", robotsResult: { allowed: false, reason: "invalid_url" } };
  }
  const userAgent = deps.userAgent ?? crawlerUserAgent();
  const fetcher = deps.fetch ?? guardedFetch;
  const options = { userAgent, policy: deps.policy, maxRedirects: 0, maxBytes: MAX_PAGE_BYTES, timeoutMs: 20_000 };
  const robotsByOrigin = new Map<string, { robots: ReturnType<typeof parseRobots> | null; status: number }>();
  const checks: object[] = [];
  let current = new URL(canonical);

  for (let hop = 0; hop <= 5; hop++) {
    const origin = current.origin;
    let robotsEntry = robotsByOrigin.get(origin);
    if (!robotsEntry) {
      const robotsResponse = await fetcher(`${origin}/robots.txt`, {
        ...options,
        maxRedirects: 5,
        accept: "text/plain",
      });
      if (robotsResponse.blocked || robotsResponse.error || robotsResponse.status === null || robotsResponse.status >= 500) {
        const error = robotsResponse.blocked ?? robotsResponse.error ?? `robots.txt returned ${robotsResponse.status ?? "no status"}`;
        return {
          status: robotsResponse.blocked ? "blocked" : "error",
          statusCode: robotsResponse.status,
          error: `robots.txt unavailable: ${error}`,
          robotsResult: { allowed: false, checks, status: robotsResponse.status, error },
        };
      }
      robotsEntry = {
        robots: robotsResponse.ok ? parseRobots(robotsResponse.body.toString("utf8")) : null,
        status: robotsResponse.status,
      };
      robotsByOrigin.set(origin, robotsEntry);
    }

    const decision = decide(robotsEntry.robots, CRAWLER_TOKEN, current.pathname + current.search);
    const check = {
      url: current.toString(),
      allowed: decision.allowed,
      status: robotsEntry.status,
      rule: decision.rule,
      matchedAgents: decision.matchedAgents,
    };
    checks.push(check);
    const robotsResult = { allowed: decision.allowed, checks };
    if (!decision.allowed) {
      return { status: "blocked", statusCode: null, error: "robots.txt disallows this citation URL", robotsResult };
    }

    const delayMs = Math.max(
      deps.minHostDelayMs ?? MIN_HOST_DELAY_MS,
      (crawlDelayFor(robotsEntry.robots, CRAWLER_TOKEN) ?? 0) * 1_000,
    );
    await (deps.wait ?? sleep)(delayMs);
    const response = await fetcher(current.toString(), {
      ...options,
      followRedirects: false,
      accept: "text/html,application/xhtml+xml",
    });
    if (response.blocked) return { status: "blocked", statusCode: response.status, error: response.blocked, robotsResult };
    if (response.error) return { status: "error", statusCode: response.status, error: response.error, robotsResult };
    const location = response.headers.location;
    if (response.status !== null && response.status >= 300 && response.status < 400 && location) {
      if (hop === 5) {
        return { status: "blocked", statusCode: response.status, error: "more than 5 redirects", robotsResult };
      }
      try {
        current = new URL(location, current);
      } catch {
        return { status: "error", statusCode: response.status, error: `bad redirect location ${location}`, robotsResult };
      }
      continue;
    }
    if (!response.ok) return { status: "error", statusCode: response.status, error: `page returned HTTP ${response.status}`, robotsResult };
    if (response.truncated) return { status: "error", statusCode: response.status, error: `page exceeded ${MAX_PAGE_BYTES} bytes`, robotsResult };
    const contentType = response.headers["content-type"] ?? "";
    if (contentType && !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType)) {
      return { status: "error", statusCode: response.status, error: `not an HTML page (${contentType.split(";")[0]})`, robotsResult };
    }
    return { status: "fetched", statusCode: response.status!, finalUrl: current.toString(), html: response.body, robotsResult };
  }
  return { status: "blocked", statusCode: null, error: "more than 5 redirects", robotsResult: { allowed: false, checks } };
}

/**
 * Canonicalizes citation rows and inserts one pending cache row. Only the insert
 * winner enqueues work, so repeated citations cannot create repeated page fetches.
 */
export async function enqueueCitationFetches(
  db: Db,
  boss: JobSender,
  queue: string,
  drawIds: string[],
  jobOptions: object,
): Promise<{ queued: number; skipped: number }> {
  if (!drawIds.length) return { queued: 0, skipped: 0 };
  const rows = await db
    .select({ id: citations.id, url: citations.url, canonicalUrl: citations.canonicalUrl })
    .from(citations)
    .where(inArray(citations.drawId, drawIds));
  let queued = 0;
  let skipped = 0;
  for (const row of rows) {
    const canonical = canonicalizeCitationUrl(row.canonicalUrl ?? row.url);
    if (!canonical) {
      skipped++;
      continue;
    }
    if (row.canonicalUrl !== canonical) {
      await db.update(citations).set({ canonicalUrl: canonical }).where(eq(citations.id, row.id));
    }
    const inserted = await db
      .insert(citedPages)
      .values({ canonicalUrl: canonical, fetchStatus: "pending" })
      .onConflictDoNothing({ target: citedPages.canonicalUrl })
      .returning({ canonicalUrl: citedPages.canonicalUrl });
    if (!inserted.length) {
      skipped++;
      continue;
    }
    try {
      const jobId = await boss.send(queue, { canonical_url: canonical }, jobOptions);
      if (!jobId) throw new Error("queue did not return a job id");
      queued++;
    } catch (error) {
      await db
        .update(citedPages)
        .set({ fetchStatus: "error", fetchError: `queue failed: ${error instanceof Error ? error.message : String(error)}` })
        .where(eq(citedPages.canonicalUrl, canonical));
      skipped++;
    }
  }
  return { queued, skipped };
}

/** Claims a pending row once, records every outcome, and never retries. */
export async function processCitationFetch(db: Db, canonicalUrl: string, deps: CitationFetchDeps = {}) {
  const canonical = canonicalizeCitationUrl(canonicalUrl);
  if (!canonical) return { status: "blocked" as const, error: "invalid canonical URL" };
  const claimed = await db
    .update(citedPages)
    .set({ fetchStatus: "skipped", fetchError: "fetch claimed", fetchedAt: new Date() })
    .where(sql`${citedPages.canonicalUrl} = ${canonical} and ${citedPages.fetchStatus} = 'pending'`)
    .returning({ id: citedPages.id });
  if (!claimed.length) return { status: "skipped" as const };

  let userAgent: string;
  try {
    userAgent = deps.userAgent ?? crawlerUserAgent();
    const result = await fetchCitationDocument(canonical, { ...deps, userAgent });
    if (result.status !== "fetched") {
      await db
        .update(citedPages)
        .set({
          fetchedAt: new Date(),
          statusCode: result.statusCode,
          fetchStatus: result.status,
          fetchError: result.error,
          robotsResult: result.robotsResult,
          fetchUserAgent: userAgent,
        })
        .where(eq(citedPages.canonicalUrl, canonical));
      return result;
    }

    const html = result.html.toString("utf8");
    const page = extractPage(html, result.finalUrl);
    const features = extractCitationFeatures(html, result.finalUrl, page);
    // Buffer forces local file storage even for short third-party text; it is never inline or committed.
    const textRef = await putRawFile(db, page.text, "text/plain; charset=utf-8");
    const date = (value: string | null) => (value ? new Date(value) : null);
    await db
      .update(citedPages)
      .set({
        fetchedAt: new Date(),
        statusCode: result.statusCode,
        title: page.title,
        h1: page.h1,
        h2s: page.headings.h2,
        publishedAt: date(features.freshness.published),
        updatedAt: date(features.freshness.updated ?? features.freshness.latestDate),
        wordCount: page.wordCount,
        schemaTypes: page.schemaTypes,
        faq: page.faq,
        contentType: inferContentType(result.finalUrl, page, features),
        fetchStatus: "fetched",
        fetchError: null,
        robotsResult: result.robotsResult,
        fetchUserAgent: userAgent,
        outboundLinks: features.credibleOutboundLinks,
        structuredFeatures: features,
        textRef,
      })
      .where(eq(citedPages.canonicalUrl, canonical));
    return { status: "fetched" as const, textRef };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(citedPages)
      .set({ fetchedAt: new Date(), fetchStatus: "error", fetchError: message, fetchUserAgent: deps.userAgent ?? null })
      .where(eq(citedPages.canonicalUrl, canonical));
    return { status: "error" as const, error: message };
  }
}
