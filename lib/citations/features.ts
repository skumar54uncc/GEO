import * as cheerio from "cheerio";
import { countWords, extractPage, type ExtractedPage } from "@/lib/site/extract";
import { classifySource, type SourceClassification } from "./sourceClass";

export type ContentType =
  | "ranking_list"
  | "program_page"
  | "news"
  | "forum"
  | "wikipedia"
  | "government_data"
  | "other";

export type CitationFeatures = {
  source: SourceClassification;
  listicle: { present: boolean; itemCount: number };
  answerCapsule: { present: boolean; question: string | null; answer: string | null; wordCount: number };
  statisticsCount: number;
  namedQuotes: Array<{ name: string; quote: string }>;
  credibleOutboundLinks: Array<{ url: string; text: string; kind: string }>;
  freshness: { published: string | null; updated: string | null; visibleDates: string[]; latestDate: string | null };
  schema: { present: boolean; types: string[] };
};

function iso(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function namedQuotes($: cheerio.CheerioAPI): Array<{ name: string; quote: string }> {
  const found: Array<{ name: string; quote: string }> = [];
  $("blockquote").each((_, element) => {
    const quote = $(element).text().replace(/\s+/g, " ").trim();
    const attribution = $(element).find("cite").first().text() || $(element).next("cite, figcaption").first().text();
    const name = attribution.match(/(?:Dr\.|Prof\.)?\s*[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)+/)?.[0]?.trim();
    if (quote && name) found.push({ name, quote: quote.slice(0, 500) });
  });
  const prose = $("body").text().replace(/\s+/g, " ");
  for (const match of prose.matchAll(/[“"]([^”"]{20,500})[”"]\s*,?\s*(?:said|says|according to)\s+((?:Dr\.|Prof\.)?\s*[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)+)/g)) {
    if (!found.some((item) => item.name === match[2] && item.quote === match[1])) {
      found.push({ name: match[2], quote: match[1] });
    }
  }
  return found.slice(0, 50);
}

function answerCapsule($: cheerio.CheerioAPI) {
  let result = { present: false, question: null as string | null, answer: null as string | null, wordCount: 0 };
  $("h2").each((_, element) => {
    if (result.present) return;
    const question = $(element).text().replace(/\s+/g, " ").trim();
    if (!question.endsWith("?")) return;
    const answer = $(element).next("p").first().text().replace(/\s+/g, " ").trim();
    const words = countWords(answer);
    if (words >= 20 && words <= 25) result = { present: true, question, answer, wordCount: words };
  });
  return result;
}

function statisticCount(text: string): number {
  const patterns = [
    /\b\d+(?:\.\d+)?\s*%/g,
    /\$\s?\d[\d,.]*(?:\s*(?:million|billion|trillion))?/gi,
    /\b\d+(?:\.\d+)?\s*(?:million|billion|trillion)\b/gi,
    /\b\d+(?:\.\d+)?\s+(?:students|graduates|respondents|participants|jobs|degrees|programs)\b/gi,
  ];
  return patterns.reduce((total, pattern) => total + Array.from(text.matchAll(pattern)).length, 0);
}

function listicle($: cheerio.CheerioAPI, page: ExtractedPage): { present: boolean; itemCount: number } {
  const numberedTitle = /(?:^|\b)\d+\s+(?:best|top|leading)\b/i.test([page.title, page.h1].filter(Boolean).join(" "));
  const largestList = $("ol")
    .toArray()
    .reduce((max, element) => Math.max(max, $(element).children("li").length), 0);
  return { present: numberedTitle || largestList >= 3, itemCount: largestList };
}

function isCredible(link: string): { credible: boolean; kind: string } {
  const classified = classifySource(link);
  const host = new URL(link).hostname.toLowerCase();
  const credible =
    ["gov", "reference", "ranking", "editorial"].includes(classified.sourceClass) ||
    host.endsWith(".edu") ||
    host === "doi.org" ||
    host.endsWith(".doi.org");
  return { credible, kind: classified.kind };
}

export function extractCitationFeatures(html: string, pageUrl: string, page = extractPage(html, pageUrl)): CitationFeatures {
  const $ = cheerio.load(html);
  const outbound = page.links
    .filter((link) => !link.internal)
    .flatMap((link) => {
      const result = isCredible(link.url);
      return result.credible ? [{ url: link.url, text: link.text, kind: result.kind }] : [];
    })
    .filter((link, index, all) => all.findIndex((candidate) => candidate.url === link.url) === index)
    .slice(0, 100);
  const visibleDates = page.visibleDates.map((date) => `${date}T00:00:00.000Z`);
  const published = iso(page.metaPublished);
  const updated = iso(page.metaModified);
  const dates = [published, updated, ...visibleDates].filter((value): value is string => Boolean(value)).sort();

  return {
    source: classifySource(pageUrl),
    listicle: listicle($, page),
    answerCapsule: answerCapsule($),
    statisticsCount: statisticCount(page.text),
    namedQuotes: namedQuotes($),
    credibleOutboundLinks: outbound,
    freshness: { published, updated, visibleDates, latestDate: dates.at(-1) ?? null },
    schema: { present: page.schemaTypes.length > 0, types: page.schemaTypes },
  };
}

export function inferContentType(url: string, page: ExtractedPage, features: CitationFeatures): ContentType {
  const path = new URL(url).pathname.toLowerCase();
  if (features.source.kind === "wikipedia") return "wikipedia";
  if (features.source.kind === "government") return "government_data";
  if (["reddit", "forum"].includes(features.source.kind)) return "forum";
  if (features.source.kind === "ranking" || features.listicle.present) return "ranking_list";
  if (features.source.kind === "news" || page.schemaTypes.some((type) => ["NewsArticle", "Article"].includes(type))) return "news";
  if (/(?:^|\/)(?:programs?|degrees?|majors?|academics?)(?:\/|$)/.test(path)) return "program_page";
  return "other";
}
