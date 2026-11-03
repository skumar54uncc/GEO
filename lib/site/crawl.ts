import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { crawlPages, crawlRuns, siteHosts } from "@/lib/db/pg/schema";
import { getRawText, putRaw, sha256 } from "@/lib/rawstore";
import { hostOrigin, siteContext } from "./context";
import { extractPage, visibleText } from "./extract";
import { crawlDelayFor, isAllowed, parseRobots, type Robots } from "./net/robots";
import { guardedFetch, type NetPolicy } from "./net/ssrf";
import { CRAWLER_TOKEN, crawlerUserAgent } from "./net/userAgent";
import { detectRenderMode } from "./render";
import { parseLastmod, type SitemapEntry } from "./sitemap";

export type CrawlDeps = {
  userAgent: string;
  policy: NetPolicy;
  /** Chromium flags, e.g. host resolver rules for local fixtures. */
  browserArgs: string[];
  maxConcurrency: number;
  maxRequestsPerMinute: number;
  navigationTimeoutSecs: number;
};

export function liveCrawlDeps(overrides: Partial<CrawlDeps> = {}): CrawlDeps {
  return {
    userAgent: crawlerUserAgent(),
    policy: {},
    browserArgs: [],
    maxConcurrency: 4,
    maxRequestsPerMinute: Number(process.env.CRAWL_REQUESTS_PER_MINUTE || 30),
    navigationTimeoutSecs: 30,
    ...overrides,
  };
}

const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|ico|zip|gz|tgz|rar|7z|mp[34]|mov|avi|wmv|webm|docx?|xlsx?|pptx?|csv|xml|json|rss|atom|ics|exe|dmg|css|js|woff2?|ttf|eot)$/i;
const TRACKERS = /(^|\.)(google-analytics\.com|googletagmanager\.com|doubleclick\.net|facebook\.net|hotjar\.com|clarity\.ms|siteimproveanalytics\.com|siteimprove\.com|connect\.facebook\.net|bat\.bing\.com|linkedin\.com|ads-twitter\.com|tiktok\.com)$/i;

/** Canonical form used for dedupe: no hash, default ports dropped, trailing slash kept as is. */
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    u.hash = "";
    if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) u.port = "";
    return u.toString();
  } catch {
    return null;
  }
}

export class ExcludedHostError extends Error {}

async function loadRobots(db: Db, host: typeof siteHosts.$inferSelect, origin: string, deps: CrawlDeps): Promise<Robots | null> {
  if (host.robotsRef) {
    const text = await getRawText(db, host.robotsRef);
    return text === null ? null : parseRobots(text);
  }
  const res = await guardedFetch(`${origin}/robots.txt`, { userAgent: deps.userAgent, policy: deps.policy, accept: "text/plain" });
  const patch: Partial<typeof siteHosts.$inferInsert> = { robotsStatus: res.status, updatedAt: new Date() };
  let robots: Robots | null = null;
  if (res.ok) {
    const text = res.body.toString("utf8");
    patch.robotsRef = await putRaw(db, text, "text/plain");
    robots = parseRobots(text);
  } else if (res.status !== null && res.status >= 500) {
    // RFC 9309: an unreachable robots.txt means assume complete disallow.
    robots = parseRobots("User-agent: *\nDisallow: /");
  }
  await db.update(siteHosts).set(patch).where(eq(siteHosts.id, host.id));
  return robots;
}

export type HostCrawlResult = { pages: number; errors: number; skippedByRobots: number; runComplete: boolean };

/**
 * crawl.page: crawls one included host for a crawl run with Crawlee and Playwright.
 * Every browser request goes through guardedFetch, so the SSRF guard sees each hop.
 */
export async function crawlHost(db: Db, crawlRunId: string, hostId: string, deps: CrawlDeps): Promise<HostCrawlResult> {
  const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, crawlRunId));
  if (!run) throw new Error("crawl run not found");
  const [host] = await db.select().from(siteHosts).where(and(eq(siteHosts.id, hostId), eq(siteHosts.siteId, run.siteId)));
  if (!host) throw new Error("host not found for this site");
  if (!host.included) throw new ExcludedHostError(`${host.host} is excluded; it is never crawled`);
  const ctx = await siteContext(db, run.siteId);
  const origin = hostOrigin(host.host, ctx.site.rootUrl);
  const cap = run.pageCapPerHost;

  await db
    .update(crawlRuns)
    .set({ status: "running", startedAt: run.startedAt ?? new Date(), userAgent: deps.userAgent })
    .where(eq(crawlRuns.id, crawlRunId));

  const robots = await loadRobots(db, host, origin, deps);
  const lastmods = new Map<string, string | null>();
  const seeds: string[] = [`${origin}/`];
  if (host.sitemapRef) {
    const entries = JSON.parse((await getRawText(db, host.sitemapRef)) ?? "[]") as SitemapEntry[];
    for (const e of entries) {
      const n = normalizeUrl(e.loc);
      if (!n) continue;
      lastmods.set(n, e.lastmod);
      seeds.push(n);
    }
  }
  let skippedByRobots = 0;
  const seen = new Set<string>();
  const allowed = (url: string) => {
    if (!isAllowed(robots, CRAWLER_TOKEN, url)) {
      skippedByRobots++;
      return false;
    }
    return true;
  };
  const initial: string[] = [];
  for (const s of seeds) {
    const n = normalizeUrl(s);
    if (!n || seen.has(n) || SKIP_EXT.test(new URL(n).pathname)) continue;
    if (new URL(n).hostname !== host.host) continue;
    seen.add(n);
    if (allowed(n)) initial.push(n);
    if (initial.length >= cap) break;
  }

  const crawlDelay = crawlDelayFor(robots, CRAWLER_TOKEN);
  const concurrency = crawlDelay ? 1 : deps.maxConcurrency;
  const rpm = crawlDelay ? Math.max(1, Math.min(deps.maxRequestsPerMinute, Math.floor(60 / crawlDelay))) : deps.maxRequestsPerMinute;

  const { PlaywrightCrawler, Configuration, RequestQueue, log } = await import("crawlee");
  const { MemoryStorage } = await import("@crawlee/memory-storage");
  log.setLevel(log.LEVELS.WARNING);
  const config = new Configuration({ storageClient: new MemoryStorage({ persistStorage: false }), persistStorage: false });
  const queue = await RequestQueue.open(`crawl-${crawlRunId}-${hostId}`, { config });
  await queue.addRequests(initial.map((url) => ({ url, uniqueKey: url })));
  let enqueued = initial.length;

  let pages = 0;
  let errors = 0;
  const raw = new Map<string, { html: string; status: number; contentType: string }>();

  const insertPage = async (values: Partial<typeof crawlPages.$inferInsert> & { url: string }) => {
    const res = await db
      .insert(crawlPages)
      .values({ crawlRunId, hostId, ...values })
      .onConflictDoNothing()
      .returning({ id: crawlPages.id });
    if (res.length) pages++;
  };

  const crawler = new PlaywrightCrawler(
    {
      requestQueue: queue,
      maxConcurrency: concurrency,
      maxRequestsPerMinute: rpm,
      maxRequestsPerCrawl: cap,
      maxRequestRetries: 0,
      useSessionPool: false,
      navigationTimeoutSecs: deps.navigationTimeoutSecs,
      requestHandlerTimeoutSecs: 90,
      browserPoolOptions: { useFingerprints: false },
      launchContext: {
        userAgent: deps.userAgent,
        launchOptions: { headless: true, args: deps.browserArgs },
      },
      preNavigationHooks: [
        async ({ page, request }) => {
          let hops = 0;
          await page.route("**/*", async (route) => {
            const req = route.request();
            const url = req.url();
            if (/^(data|blob):/.test(url)) return route.continue();
            const type = req.resourceType();
            if (["image", "media", "font", "stylesheet", "websocket", "manifest", "other"].includes(type)) return route.abort();
            if (req.method() !== "GET") return route.abort();
            let reqHost: string;
            try {
              reqHost = new URL(url).hostname;
            } catch {
              return route.abort();
            }
            if (TRACKERS.test(reqHost)) return route.abort();
            const isDoc = req.isNavigationRequest() && req.frame() === page.mainFrame();
            if (isDoc && ++hops > 6) return route.abort("blockedbyclient");
            const res = await guardedFetch(url, {
              userAgent: deps.userAgent,
              policy: deps.policy,
              maxRedirects: 0,
              maxBytes: 10 * 1024 * 1024,
              accept: req.headers()["accept"] ?? "*/*",
            });
            if (res.blocked || res.status === null) return route.abort(res.blocked ? "blockedbyclient" : "failed");
            const headers = { ...res.headers };
            delete headers["content-encoding"];
            delete headers["content-length"];
            delete headers["transfer-encoding"];
            if (isDoc && (res.status < 300 || res.status >= 400)) {
              raw.set(normalizeUrl(url) ?? url, {
                html: res.body.toString("utf8"),
                status: res.status,
                contentType: headers["content-type"] ?? "",
              });
            }
            return route.fulfill({ status: res.status, headers, body: res.body });
          });
          request.userData.startedAt = Date.now();
        },
      ],
      requestHandler: async ({ page, request, response }) => {
        const finalUrl = normalizeUrl(page.url()) ?? page.url();
        const status = response?.status() ?? raw.get(finalUrl)?.status ?? null;
        const rawDoc = raw.get(finalUrl);
        const contentType = rawDoc?.contentType ?? (response ? (await response.allHeaders())["content-type"] ?? "" : "");
        const finalHost = new URL(finalUrl).hostname;
        if (finalHost !== host.host) {
          await insertPage({ url: request.url, statusCode: status, fetchError: `redirected to another host: ${finalHost}` });
          return;
        }
        if (contentType && !/html/i.test(contentType)) {
          await insertPage({ url: finalUrl, statusCode: status, contentType, fetchError: "not an HTML page" });
          return;
        }
        const html = await page.content();
        const ex = extractPage(html, finalUrl);
        const verdict = detectRenderMode(rawDoc ? visibleText(rawDoc.html) : "", ex.text);
        const textRef = ex.text ? await putRaw(db, ex.text, "text/plain; charset=utf-8") : null;
        const lastmod = parseLastmod(lastmods.get(finalUrl) ?? lastmods.get(normalizeUrl(request.url) ?? "") ?? ex.metaModified);
        await insertPage({
          url: finalUrl,
          canonical: ex.canonical,
          statusCode: status,
          title: ex.title,
          h1: ex.h1,
          headings: { h1: ex.h1All, h2: ex.headings.h2, h3: ex.headings.h3 },
          metaDescription: ex.metaDescription,
          wordCount: ex.wordCount,
          rawWordCount: verdict.rawWords,
          lastmod,
          schemaTypes: ex.schemaTypes,
          schemaRaw: ex.schemaRaw,
          faq: ex.faq,
          renderMode: verdict.mode,
          contentHash: sha256(ex.text),
          textRef,
          outboundLinks: ex.links,
          visibleDates: ex.visibleDates,
          robotsMeta: ex.robotsMeta,
          contentType: contentType || null,
        });
        if (status !== null && status >= 400) return;
        for (const link of ex.links) {
          if (enqueued >= cap) break;
          const n = normalizeUrl(link.url);
          if (!n || seen.has(n)) continue;
          const u = new URL(n);
          if (u.hostname !== host.host || SKIP_EXT.test(u.pathname)) continue;
          seen.add(n);
          if (!allowed(n)) continue;
          await queue.addRequest({ url: n, uniqueKey: n });
          enqueued++;
        }
      },
      failedRequestHandler: async ({ request }, error) => {
        errors++;
        const n = normalizeUrl(request.url) ?? request.url;
        await insertPage({ url: n, statusCode: raw.get(n)?.status ?? null, fetchError: error.message.slice(0, 500) });
      },
    },
    config,
  );
  await crawler.run();
  await crawler.teardown();
  await queue.drop();

  // Mark this host done. The last host to finish completes the run.
  const [updated] = await db
    .update(crawlRuns)
    .set({
      hostsDone: sql`array_append(array_remove(${crawlRuns.hostsDone}, ${hostId}::uuid), ${hostId}::uuid)`,
      pageCount: sql`(SELECT count(*) FROM crawl_pages WHERE crawl_run_id = ${crawlRunId})`,
    })
    .where(eq(crawlRuns.id, crawlRunId))
    .returning();
  const done = new Set(updated.hostsDone);
  const runComplete = updated.hostIds.every((h) => done.has(h));
  if (runComplete) {
    await db.update(crawlRuns).set({ status: "complete", finishedAt: new Date() }).where(eq(crawlRuns.id, crawlRunId));
  }
  return { pages, errors, skippedByRobots, runComplete };
}
