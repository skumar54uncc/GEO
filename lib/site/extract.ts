import * as cheerio from "cheerio";

export type FaqItem = { q: string; a: string; source: "schema" | "details" | "heading" | "dl" };
export type PageLink = { url: string; text: string; internal: boolean };

export type ExtractedPage = {
  title: string | null;
  h1: string | null;
  h1All: string[];
  headings: { h2: string[]; h3: string[] };
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  ogSiteName: string | null;
  schemaTypes: string[];
  schemaRaw: unknown[];
  schemaParseErrors: number;
  faq: FaqItem[];
  links: PageLink[];
  navLinks: Array<{ text: string; url: string }>;
  text: string;
  wordCount: number;
  visibleDates: string[];
  metaModified: string | null;
  metaPublished: string | null;
};

const MAX_LINKS = 500;

export function clean(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

/** Visible text: scripts, styles, templates and hidden inputs removed, whitespace collapsed. */
export function visibleText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, template, svg, iframe, head").remove();
  return clean($("body").length ? $("body").text() : $.root().text());
}

function collectTypes(node: unknown, out: Set<string>, depth = 0): void {
  if (depth > 12 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") out.add(t.replace(/^https?:\/\/schema\.org\//, ""));
  else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") out.add(x.replace(/^https?:\/\/schema\.org\//, ""));
  for (const [k, v] of Object.entries(obj)) if (k !== "@context") collectTypes(v, out, depth + 1);
}

/** Every object in a JSON-LD tree, depth first. */
export function schemaNodes(raw: unknown[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const walk = (n: unknown, depth: number) => {
    if (depth > 12 || n === null || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach((x) => walk(x, depth + 1));
    const obj = n as Record<string, unknown>;
    out.push(obj);
    for (const [k, v] of Object.entries(obj)) if (k !== "@context") walk(v, depth + 1);
  };
  raw.forEach((r) => walk(r, 0));
  return out;
}

export function nodeTypes(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  const list = typeof t === "string" ? [t] : Array.isArray(t) ? t.filter((x): x is string => typeof x === "string") : [];
  return list.map((x) => x.replace(/^https?:\/\/schema\.org\//, ""));
}

function textOf(v: unknown): string {
  if (typeof v === "string") return clean(cheerio.load(`<div>${v}</div>`)("div").text());
  if (v && typeof v === "object" && "text" in (v as Record<string, unknown>)) return textOf((v as Record<string, unknown>).text);
  return "";
}

function absolute(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

const MONTHS = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const DATE_NEAR_KEYWORD = new RegExp(
  `\\b(?:updated|last\\s+updated|last\\s+modified|modified|published|posted|reviewed|revised)\\b[^.\\n]{0,25}?` +
    `((?:${MONTHS})\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}/\\d{1,2}/\\d{4}|\\d{4}-\\d{2}-\\d{2})`,
  "gi",
);

function toIsoDate(s: string): string | null {
  const t = s.trim();
  let d: Date;
  const mdY = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdY) d = new Date(Date.UTC(Number(mdY[3]), Number(mdY[1]) - 1, Number(mdY[2])));
  else if (/^\d{4}-\d{2}-\d{2}/.test(t)) d = new Date(`${t.slice(0, 10)}T00:00:00Z`);
  else d = new Date(`${t.replace(/\./, "")} UTC`);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < 1990 || y > 2100) return null;
  return d.toISOString().slice(0, 10);
}

export function extractVisibleDates(html: string, text: string): string[] {
  const $ = cheerio.load(html);
  const dates = new Set<string>();
  $("time[datetime]").each((_, el) => {
    const iso = toIsoDate($(el).attr("datetime") ?? "");
    if (iso) dates.add(iso);
  });
  for (const m of Array.from(text.matchAll(DATE_NEAR_KEYWORD))) {
    const iso = toIsoDate(m[1]);
    if (iso) dates.add(iso);
  }
  return Array.from(dates).sort();
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.toLowerCase() === new URL(b).hostname.toLowerCase();
  } catch {
    return false;
  }
}

function extractFaq($: cheerio.CheerioAPI, schemaRaw: unknown[]): FaqItem[] {
  const items: FaqItem[] = [];
  for (const node of schemaNodes(schemaRaw)) {
    if (!nodeTypes(node).includes("Question")) continue;
    const q = textOf(node.name);
    const answer = node.acceptedAnswer ?? node.suggestedAnswer;
    const a = textOf(Array.isArray(answer) ? answer[0] : answer);
    if (q) items.push({ q, a, source: "schema" });
  }
  $("details").each((_, el) => {
    const summary = clean($(el).children("summary").first().text());
    if (!summary.endsWith("?")) return;
    const clone = $(el).clone();
    clone.children("summary").remove();
    items.push({ q: summary, a: clean(clone.text()).slice(0, 1000), source: "details" });
  });
  $("h2, h3, h4, h5").each((_, el) => {
    const q = clean($(el).text());
    if (!q.endsWith("?") || q.length > 200) return;
    const a = clean($(el).nextUntil("h1, h2, h3, h4, h5").text()).slice(0, 1000);
    if (a) items.push({ q, a, source: "heading" });
  });
  $("dt").each((_, el) => {
    const q = clean($(el).text());
    if (!q.endsWith("?")) return;
    items.push({ q, a: clean($(el).next("dd").text()).slice(0, 1000), source: "dl" });
  });
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = i.q.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractPage(html: string, pageUrl: string): ExtractedPage {
  const $ = cheerio.load(html);
  const schemaRaw: unknown[] = [];
  let schemaParseErrors = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    const body = $(el).text().trim();
    if (!body) return;
    try {
      schemaRaw.push(JSON.parse(body));
    } catch {
      schemaParseErrors++;
    }
  });
  const types = new Set<string>();
  collectTypes(schemaRaw, types);

  const meta = (sel: string) => clean($(sel).first().attr("content")) || null;
  const canonicalHref = $('link[rel~="canonical"]').first().attr("href");

  const links: PageLink[] = [];
  const seenLinks = new Set<string>();
  $("a[href]").each((_, el) => {
    if (links.length >= MAX_LINKS) return;
    const url = absolute($(el).attr("href") ?? "", pageUrl);
    if (!url || seenLinks.has(url)) return;
    seenLinks.add(url);
    links.push({ url, text: clean($(el).text()).slice(0, 200), internal: sameHost(url, pageUrl) });
  });
  const navLinks: Array<{ text: string; url: string }> = [];
  $("nav a[href], header a[href], [role=navigation] a[href], footer a[href]").each((_, el) => {
    const url = absolute($(el).attr("href") ?? "", pageUrl);
    const text = clean($(el).text());
    if (url && text && text.length <= 120) navLinks.push({ text, url });
  });

  const faq = extractFaq($, schemaRaw);
  const headingTexts = (sel: string) =>
    $(sel)
      .toArray()
      .map((el) => clean($(el).text()))
      .filter(Boolean)
      .slice(0, 100);
  const h1All = headingTexts("h1");

  $("script, style, noscript, template, svg, iframe").remove();
  const text = clean($("body").length ? $("body").text() : $.root().text());

  return {
    title: clean($("title").first().text()) || null,
    h1: h1All[0] ?? null,
    h1All,
    headings: { h2: headingTexts("h2"), h3: headingTexts("h3") },
    metaDescription: meta('meta[name="description" i]'),
    canonical: canonicalHref ? absolute(canonicalHref, pageUrl) : null,
    robotsMeta: meta('meta[name="robots" i]'),
    ogSiteName: meta('meta[property="og:site_name"]'),
    schemaTypes: Array.from(types).sort(),
    schemaRaw,
    schemaParseErrors,
    faq,
    links,
    navLinks,
    text,
    wordCount: countWords(text),
    visibleDates: extractVisibleDates(html, text),
    metaModified: meta('meta[property="article:modified_time"]') ?? meta('meta[name="last-modified" i]'),
    metaPublished: meta('meta[property="article:published_time"]'),
  };
}
