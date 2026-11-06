import { and, eq, ilike, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { brands, crawlPages, crawlRuns, sites } from "@/lib/db/pg/schema";
import type { ScoreFactor } from "@/lib/contracts/strategy";
import { scoredFactor } from "./score";

export type SupplyPage = {
  crawlPageId: string;
  url: string;
  title: string | null;
  wordCount: number | null;
};

export type StrategySupplyResult = {
  pages: SupplyPage[];
  /** Higher when we already have thin/missing coverage → larger content opportunity. */
  gapFromSupply: ScoreFactor;
  evidenceNotes: string[];
};

/** Our existing pages for the topic from crawl_pages (title/url match). */
export async function collectStrategySupply(
  db: Db,
  opts: { orgId: string; topic: string },
): Promise<StrategySupplyResult> {
  const needle = `%${opts.topic.trim()}%`;
  const rows = await db
    .select({
      id: crawlPages.id,
      url: crawlPages.url,
      title: crawlPages.title,
      wordCount: crawlPages.wordCount,
    })
    .from(crawlPages)
    .innerJoin(crawlRuns, eq(crawlRuns.id, crawlPages.crawlRunId))
    .innerJoin(sites, eq(sites.id, crawlRuns.siteId))
    .innerJoin(brands, eq(brands.id, sites.brandId))
    .where(
      and(
        eq(brands.orgId, opts.orgId),
        or(ilike(crawlPages.url, needle), ilike(sql`coalesce(${crawlPages.title}, '')`, needle)),
      ),
    )
    .limit(50);

  const pages: SupplyPage[] = rows.map((r) => ({
    crawlPageId: r.id,
    url: r.url,
    title: r.title,
    wordCount: r.wordCount,
  }));

  // Few matching pages → higher gap opportunity (capped at 1).
  const gapValue = pages.length === 0 ? 1 : Math.max(0.2, 1 - Math.min(pages.length, 10) / 10);
  return {
    pages,
    gapFromSupply: scoredFactor(gapValue, "crawl_pages", pages.length, pages.length ? undefined : "no matching page"),
    evidenceNotes: pages.length
      ? pages.slice(0, 5).map((p) => `supply: ${p.url}`)
      : ["supply: no matching crawl_pages for topic"],
  };
}
