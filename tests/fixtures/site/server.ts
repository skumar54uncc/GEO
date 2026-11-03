import fs from "fs";
import http from "http";
import type { AddressInfo } from "net";
import path from "path";
import zlib from "zlib";
import type { NetPolicy } from "@/lib/site/net/ssrf";

const DIR = path.join(__dirname, "site");

/** Deterministic filler: n distinct-ish words. */
export function words(n: number, seed = 0): string {
  const base = ["campus", "students", "research", "faculty", "program", "community", "learning", "career", "engineering", "science", "health", "business", "education", "design", "public", "service", "data", "energy", "region", "partners"];
  return Array.from({ length: n }, (_, i) => `${base[(i * 7 + seed) % base.length]}${i % 5 === 0 ? i : ""}`).join(" ");
}

export function fixture(name: string, port: number | string): string {
  return fs
    .readFileSync(path.join(DIR, name), "utf8")
    .replace(/\{\{PORT\}\}/g, String(port))
    .replace(/\{\{WORDS:(\d+)\}\}/g, (_m, n) => words(Number(n)));
}

type Route = { status?: number; type?: string; body?: string | Buffer; location?: string };

/**
 * Hosts under fixture.test:
 *   fixture.test           redirects everything to www
 *   www.fixture.test       main site (robots groups, sitemap index, gz sitemap, test pages)
 *   admissions.fixture.test  small host with llms.txt
 *   athletics.fixture.test   healthy host the e2e test excludes by hand
 *   research.fixture.test  healthy host found only in a sitemap
 *   login.fixture.test     sign-in portal (password field)
 *   dev.fixture.test       non production host
 *   broken.fixture.test    root returns 500
 *   cci.fixture.test       root returns 404
 *   nowhere.fixture.test   does not resolve (see fixturePolicy)
 */
export function routesFor(host: string, url: string, port: number): Route {
  const page = (name: string): Route => ({ type: "text/html; charset=utf-8", body: fixture(name, port) });
  const simple = (title: string, extra = ""): Route => ({
    type: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><title>${title}</title><meta name="description" content="${title}"></head><body><h1>${title}</h1><p>${words(300, title.length)}</p>${extra}</body></html>`,
  });
  const p = url.split("?")[0];
  switch (host) {
    case "fixture.test":
      return { status: 301, location: `http://www.fixture.test:${port}${url}` };
    case "www.fixture.test": {
      const map: Record<string, string> = {
        "/": "home.html",
        "/programs/computer-science/": "computer-science.html",
        "/programs/data-science/": "data-science.html",
        "/about/": "about.html",
        "/about/history/": "history.html",
        "/news/js-app/": "js-app.html",
        "/thin/": "thin.html",
        "/canonical-broken/": "canonical-broken.html",
        "/events/homecoming-2026/": "homecoming.html",
      };
      if (p === "/robots.txt") return { type: "text/plain", body: fixture("robots.txt", port) };
      if (p === "/sitemap_index.xml") return { type: "application/xml", body: fixture("sitemap_index.xml", port) };
      if (p === "/sitemap-pages.xml") return { type: "application/xml", body: fixture("sitemap-pages.xml", port) };
      if (p === "/sitemap-admissions.xml.gz") return { type: "application/x-gzip", body: zlib.gzipSync(fixture("sitemap-admissions.xml", port)) };
      if (p === "/admin/secret/") return simple("Admin secret");
      if (map[p]) return page(map[p]);
      return { status: 404, type: "text/html", body: "<html><head><title>Not found</title></head><body><h1>Not found</h1></body></html>" };
    }
    case "admissions.fixture.test":
      if (p === "/robots.txt") return { type: "text/plain", body: "User-agent: *\nAllow: /\n" };
      if (p === "/llms.txt") return { type: "text/plain", body: "# Admissions\n> Apply to UNC Charlotte.\n" };
      if (p === "/") return simple("Admissions | UNC Charlotte", '<a href="/apply/">Apply</a>');
      if (p === "/apply/") return simple("Apply | UNC Charlotte");
      return { status: 404, body: "not found" };
    case "athletics.fixture.test":
    case "research.fixture.test":
      if (p === "/robots.txt") return { status: 404, body: "" };
      if (p === "/") return simple(`${host.split(".")[0]} | UNC Charlotte`);
      return { status: 404, body: "not found" };
    case "login.fixture.test":
      return { type: "text/html", body: '<html><body><form><input name="u"><input type="password" name="p"></form></body></html>' };
    case "dev.fixture.test":
      return simple("Dev server");
    case "broken.fixture.test":
      return { status: 500, body: "error" };
    default:
      return { status: 404, body: "unknown host" };
  }
}

export type FixtureSite = { port: number; rootUrl: string; requests: Array<{ host: string; url: string; ua: string }>; close: () => Promise<void> };

export async function startFixtureSite(): Promise<FixtureSite> {
  const requests: FixtureSite["requests"] = [];
  let port = 0;
  const server = http.createServer((req, res) => {
    const host = (req.headers.host ?? "").split(":")[0].toLowerCase();
    requests.push({ host, url: req.url ?? "/", ua: String(req.headers["user-agent"] ?? "") });
    const r = routesFor(host, req.url ?? "/", port);
    const headers: Record<string, string> = {};
    if (r.type) headers["Content-Type"] = r.type;
    if (r.location) headers["Location"] = r.location;
    res.writeHead(r.status ?? 200, headers);
    res.end(r.body ?? "");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
  return {
    port,
    rootUrl: `http://fixture.test:${port}/`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Every fixture host resolves to the local server except nowhere.fixture.test. */
export const fixturePolicy: NetPolicy = {
  trustedAddresses: ["127.0.0.1"],
  lookup: async (host) => {
    if (host === "nowhere.fixture.test" || !(host === "fixture.test" || host.endsWith(".fixture.test"))) {
      throw new Error(`getaddrinfo ENOTFOUND ${host}`);
    }
    return [{ address: "127.0.0.1", family: 4 }];
  },
};
