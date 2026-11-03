import * as cheerio from "cheerio";

export type SitemapEntry = { loc: string; lastmod: string | null };
export type ParsedSitemap = { kind: "index" | "urlset" | "unknown"; entries: SitemapEntry[] };

/** Parses a sitemap or sitemap index (XML). Plain text sitemaps (one URL per line) are accepted too. */
export function parseSitemap(body: string): ParsedSitemap {
  const text = body.replace(/^\uFEFF/, "").trim();
  if (!text.startsWith("<")) {
    const entries = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^https?:\/\//i.test(l))
      .map((loc) => ({ loc, lastmod: null }));
    return { kind: entries.length ? "urlset" : "unknown", entries };
  }
  const $ = cheerio.load(text, { xml: true });
  const read = (sel: string) =>
    $(sel)
      .toArray()
      .map((el) => {
        const node = $(el);
        const loc = node.children("loc").first().text().trim();
        const lastmod = node.children("lastmod").first().text().trim() || null;
        return { loc, lastmod };
      })
      .filter((e) => /^https?:\/\//i.test(e.loc));
  if ($("sitemapindex").length) return { kind: "index", entries: read("sitemapindex > sitemap") };
  if ($("urlset").length) return { kind: "urlset", entries: read("urlset > url") };
  return { kind: "unknown", entries: [] };
}

export function parseLastmod(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}
