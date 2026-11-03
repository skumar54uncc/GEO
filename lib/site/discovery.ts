import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { siteHosts, sites } from "@/lib/db/pg/schema";
import { putRaw } from "@/lib/rawstore";
import { crtShUrl, parseCrtSh } from "./crtsh";
import { hostOrigin, isUnderDomain, siteContext } from "./context";
import { extractPage } from "./extract";
import { classifyHost } from "./hostCheck";
import { guardedFetch, type FetchOptions, type FetchResult, type NetPolicy } from "./net/ssrf";
import { parseRobots } from "./net/robots";
import { crawlerUserAgent } from "./net/userAgent";
import { mapPool } from "./pool";
import { providerCall } from "./providerCall";
import { parseSitemap, type SitemapEntry } from "./sitemap";
import zlib from "zlib";

export type DiscoveredVia = "sitemap" | "ct_log" | "link" | "manual";
const VIA_ORDER: DiscoveredVia[] = ["manual", "link", "sitemap", "ct_log"];

export type DiscoveryDeps = {
  fetch: (url: string, opts?: Partial<FetchOptions>) => Promise<FetchResult>;
  /** Certificate transparency lookup. Returns host names (any domain; filtered later). */
  ctLookup: (rootDomain: string) => Promise<{ ok: boolean; hosts: string[]; error: string | null; cached?: boolean }>;
  maxHostChecks: number;
  maxSitemapFiles: number;
  maxSitemapUrls: number;
  sitemapPagesToScan: number;
  concurrency: number;
  /** Timeout for the one root request per host. Short, because many CT names are firewalled. */
  hostProbeTimeoutMs?: number;
};

export function defaultFetcher(userAgent: string, policy: NetPolicy = {}) {
  return (url: string, opts: Partial<FetchOptions> = {}) =>
    guardedFetch(url, { userAgent, timeoutMs: 15_000, ...opts, policy: opts.policy ?? policy });
}

export function liveDiscoveryDeps(db: Db, orgId: string, overrides: Partial<DiscoveryDeps> = {}): DiscoveryDeps {
  const ua = crawlerUserAgent();
  const fetch = overrides.fetch ?? defaultFetcher(ua);
  return {
    fetch,
    ctLookup: async (rootDomain) => {
      const url = crtShUrl(rootDomain);
      const res = await providerCall(db, {
        orgId,
        provider: "crtsh",
        engine: "ct_log",
        params: { url },
        units: 1,
        call: async () => {
          const r = await fetch(url, { timeoutMs: 90_000, maxBytes: 50 * 1024 * 1024, accept: "application/json" });
          return { ok: r.ok, body: r.body.toString("utf8"), error: r.error ?? r.blocked ?? (r.ok ? null : `HTTP ${r.status}`) };
        },
      });
      if (!res.ok) return { ok: false, hosts: [], error: res.error };
      return { ok: true, hosts: parseCrtSh(res.body, rootDomain), error: null, cached: res.cached };
    },
    maxHostChecks: Number(process.env.DISCOVERY_MAX_HOST_CHECKS || 1500),
    maxSitemapFiles: 60,
    maxSitemapUrls: 50_000,
    sitemapPagesToScan: 10,
    concurrency: 12,
    hostProbeTimeoutMs: 8000,
    ...overrides,
  };
}

function bodyText(res: FetchResult): string {
  let buf = res.body;
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      buf = zlib.gunzipSync(buf);
    } catch {
      /* not gzip after all */
    }
  }
  return buf.toString("utf8");
}

type HostInfo = { via: Set<DiscoveredVia> };

export type DiscoverySummary = {
  root_url: string;
  root_domain: string;
  robots: { status: number | null; sitemaps_listed: number };
  sitemap_files_fetched: number;
  sitemap_files_failed: number;
  sitemap_urls: number;
  sitemap_cap_reached: boolean;
  home: { status: number | null; final_url: string | null; hosts_linked: number };
  sitemap_pages_scanned: number;
  ct: { ok: boolean; hosts: number; error: string | null; cached: boolean };
  hosts_found: number;
  hosts_checked: number;
  hosts_not_checked: number;
  hosts_included_by_default: number;
};

/** crawl.discover: finds every host for a site and checks which ones to include by default. */
export async function discoverSite(db: Db, siteId: string, deps: DiscoveryDeps): Promise<DiscoverySummary> {
  const ctx = await siteContext(db, siteId);
  const { rootDomain, rootHost } = ctx;
  const rootUrl = ctx.site.rootUrl;
  await db.update(sites).set({ status: "discovering", discoveryError: null, updatedAt: new Date() }).where(eq(sites.id, siteId));
  try {
    const hosts = new Map<string, HostInfo>();
    const add = (host: string, via: DiscoveredVia) => {
      const h = host.toLowerCase().replace(/\.$/, "");
      if (!isUnderDomain(h, rootDomain)) return;
      if (!hosts.has(h)) hosts.set(h, { via: new Set() });
      hosts.get(h)!.via.add(via);
    };
    add(rootHost, "manual");

    // robots.txt of the root host and the sitemaps it lists
    const rootOrigin = hostOrigin(rootHost, rootUrl);
    const robotsRes = await deps.fetch(`${rootOrigin}/robots.txt`, { accept: "text/plain" });
    const robots = robotsRes.ok ? parseRobots(bodyText(robotsRes)) : null;
    const sitemapQueue: string[] = [...(robots?.sitemaps ?? [])];
    if (!sitemapQueue.length) sitemapQueue.push(`${rootOrigin}/sitemap.xml`);

    const entriesByHost = new Map<string, SitemapEntry[]>();
    const sitemapFilesByHost = new Map<string, number>();
    const seenSitemaps = new Set<string>();
    let filesFetched = 0;
    let filesFailed = 0;
    let urlCount = 0;
    let capReached = false;
    const crawlSitemaps = async (queue: string[]) => {
      while (queue.length) {
        const sm = queue.shift()!;
        if (seenSitemaps.has(sm)) continue;
        if (filesFetched >= deps.maxSitemapFiles || urlCount >= deps.maxSitemapUrls) {
          capReached = true;
          break;
        }
        seenSitemaps.add(sm);
        let smHost: string;
        try {
          smHost = new URL(sm).hostname.toLowerCase();
        } catch {
          continue;
        }
        if (!isUnderDomain(smHost, rootDomain)) continue;
        add(smHost, "sitemap");
        const res = await deps.fetch(sm, { accept: "application/xml,text/xml,text/plain", maxBytes: 50 * 1024 * 1024 });
        filesFetched++;
        if (!res.ok) {
          filesFailed++;
          continue;
        }
        sitemapFilesByHost.set(smHost, (sitemapFilesByHost.get(smHost) ?? 0) + 1);
        const parsed = parseSitemap(bodyText(res));
        if (parsed.kind === "index") {
          for (const e of parsed.entries) queue.push(e.loc);
          continue;
        }
        for (const e of parsed.entries) {
          if (urlCount >= deps.maxSitemapUrls) {
            capReached = true;
            break;
          }
          let h: string;
          try {
            h = new URL(e.loc).hostname.toLowerCase();
          } catch {
            continue;
          }
          if (!isUnderDomain(h, rootDomain)) continue;
          add(h, "sitemap");
          if (!entriesByHost.has(h)) entriesByHost.set(h, []);
          entriesByHost.get(h)!.push(e);
          urlCount++;
        }
      }
    };
    await crawlSitemaps(sitemapQueue);

    // internal links on the home page and on a few sitemap pages
    const homeRes = await deps.fetch(`${rootOrigin}/`, { accept: "text/html" });
    let homeHosts = 0;
    const hostsFromLinks = (html: string, url: string) => {
      const page = extractPage(html, url);
      const linked = new Set<string>();
      for (const l of page.links) {
        try {
          const h = new URL(l.url).hostname.toLowerCase();
          if (isUnderDomain(h, rootDomain)) linked.add(h);
        } catch {
          /* skip */
        }
      }
      linked.forEach((h) => add(h, "link"));
      return linked.size;
    };
    if (homeRes.ok) {
      add(new URL(homeRes.finalUrl).hostname, "link");
      homeHosts = hostsFromLinks(bodyText(homeRes), homeRes.finalUrl);
    }
    const homeFinalHost = homeRes.ok ? new URL(homeRes.finalUrl).hostname.toLowerCase() : rootHost;
    const samplePages = [...(entriesByHost.get(homeFinalHost) ?? []), ...(entriesByHost.get(rootHost) ?? [])]
      .slice(0, deps.sitemapPagesToScan)
      .map((e) => e.loc);
    let scanned = 0;
    for (const url of samplePages) {
      const r = await deps.fetch(url, { accept: "text/html" });
      if (r.ok && /html/i.test(r.headers["content-type"] ?? "html")) {
        hostsFromLinks(bodyText(r), r.finalUrl);
        scanned++;
      }
    }

    // certificate transparency
    const ct = await deps.ctLookup(rootDomain);
    for (const h of ct.hosts) add(h, "ct_log");

    // check hosts: the root and where it lands first, then by how each was found, then alphabetical
    const rank = (host: string, info: HostInfo) =>
      host === rootHost ? -2 : host === homeFinalHost ? -1 : Math.min(...Array.from(info.via).map((v) => VIA_ORDER.indexOf(v)));
    const ordered = Array.from(hosts.entries()).sort((a, b) => rank(a[0], a[1]) - rank(b[0], b[1]) || a[0].localeCompare(b[0]));
    const toCheck = ordered.slice(0, deps.maxHostChecks);

    const existing = await db.select().from(siteHosts).where(eq(siteHosts.siteId, siteId));
    const existingByHost = new Map(existing.map((h) => [h.host, h]));
    let includedByDefault = 0;

    const upsert = async (host: string, info: HostInfo, patch: Partial<typeof siteHosts.$inferInsert>) => {
      const via = VIA_ORDER.filter((v) => info.via.has(v));
      const prior = existingByHost.get(host);
      const values = {
        ...patch,
        discoveredViaAll: Array.from(new Set([...(prior?.discoveredViaAll ?? []), ...via])),
        updatedAt: new Date(),
      };
      if (prior) {
        if (prior.includedByUser) delete values.included;
        await db.update(siteHosts).set(values).where(eq(siteHosts.id, prior.id));
      } else {
        await db
          .insert(siteHosts)
          .values({ siteId, host, discoveredVia: via[0] ?? "manual", included: false, ...values })
          .onConflictDoNothing();
      }
    };

    await mapPool(toCheck, deps.concurrency, async ([host, info]) => {
      const origin = hostOrigin(host, rootUrl);
      const probe = await deps.fetch(`${origin}/`, { accept: "text/html", maxBytes: 2 * 1024 * 1024, timeoutMs: deps.hostProbeTimeoutMs ?? 8000 });
      const html = probe.ok ? bodyText(probe) : null;
      const check = classifyHost(host, rootDomain, {
        status: probe.status,
        finalUrl: probe.status !== null ? probe.finalUrl : null,
        html,
        dnsError: Boolean(probe.error?.startsWith("dns:")),
        blocked: probe.blocked,
        error: probe.error,
      });
      // A redirect target under the root domain is always checked, even past the cap.
      if (check.excludeReason?.startsWith("redirects to ") && probe.finalUrl) {
        const target = new URL(probe.finalUrl).hostname.toLowerCase();
        if (isUnderDomain(target, rootDomain)) {
          if (!hosts.has(target)) hosts.set(target, { via: new Set(["link"]) });
          if (!toCheck.some(([h]) => h === target)) toCheck.push([target, hosts.get(target)!]);
        }
      }
      const patch: Partial<typeof siteHosts.$inferInsert> = {
        resolves: check.resolves,
        rootStatus: check.rootStatus,
        rootFinalUrl: check.rootFinalUrl,
        loginPortal: check.loginPortal,
        excludeReason: check.excludeReason,
        included: check.excludeReason === null,
        checkedAt: new Date(),
      };
      if (check.excludeReason === null) {
        includedByDefault++;
        const hostRobots = host === rootHost ? robotsRes : await deps.fetch(`${origin}/robots.txt`, { accept: "text/plain" });
        patch.robotsStatus = hostRobots.status;
        if (hostRobots.ok) {
          const text = bodyText(hostRobots);
          patch.robotsRef = await putRaw(db, text, "text/plain");
          if (host !== rootHost) {
            const listed = parseRobots(text).sitemaps.filter((s) => !seenSitemaps.has(s));
            if (listed.length) await crawlSitemaps(listed);
          }
        }
        const llms = await deps.fetch(`${origin}/llms.txt`, { accept: "text/plain", maxBytes: 256 * 1024, maxRedirects: 2 });
        patch.llmsTxtStatus = llms.ok && llms.finalUrl.endsWith("/llms.txt") ? llms.status : (llms.status ?? null);
      }
      await upsert(host, info, patch);
    });

    const checked = new Set(toCheck.map(([h]) => h));
    const notChecked = Array.from(hosts.entries()).filter(([h]) => !checked.has(h));
    for (const [host, info] of notChecked) {
      await upsert(host, info, { included: false, excludeReason: `not checked: over the ${deps.maxHostChecks} host check cap` });
    }

    // sitemap entries per host, for crawl seeds and lastmod
    const rows = await db.select().from(siteHosts).where(eq(siteHosts.siteId, siteId));
    for (const row of rows) {
      const entries = entriesByHost.get(row.host);
      if (!entries?.length) continue;
      const ref = await putRaw(db, JSON.stringify(entries), "application/json");
      await db
        .update(siteHosts)
        .set({ sitemapRef: ref, sitemapUrlCount: entries.length, sitemapCount: sitemapFilesByHost.get(row.host) ?? 0 })
        .where(eq(siteHosts.id, row.id));
    }

    const summary: DiscoverySummary = {
      root_url: rootUrl,
      root_domain: rootDomain,
      robots: { status: robotsRes.status, sitemaps_listed: robots?.sitemaps.length ?? 0 },
      sitemap_files_fetched: filesFetched,
      sitemap_files_failed: filesFailed,
      sitemap_urls: urlCount,
      sitemap_cap_reached: capReached,
      home: { status: homeRes.status, final_url: homeRes.status !== null ? homeRes.finalUrl : null, hosts_linked: homeHosts },
      sitemap_pages_scanned: scanned,
      ct: { ok: ct.ok, hosts: ct.hosts.length, error: ct.error, cached: Boolean(ct.cached) },
      hosts_found: hosts.size,
      hosts_checked: toCheck.length,
      hosts_not_checked: notChecked.length,
      hosts_included_by_default: includedByDefault,
    };
    await db
      .update(sites)
      .set({ status: "discovered", discovery: summary, discoveredAt: new Date(), updatedAt: new Date() })
      .where(eq(sites.id, siteId));
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(sites).set({ status: "failed", discoveryError: message, updatedAt: new Date() }).where(eq(sites.id, siteId));
    throw err;
  }
}
