/** Product token our crawler answers to in robots.txt. */
export const CRAWLER_TOKEN = "UNCCGEOAudit";
export const CRAWLER_VERSION = "0.2";

export class CrawlerConfigError extends Error {}

/** A contact URL or mailto: is required so site owners can reach whoever runs the crawl. */
export function crawlerContact(): string {
  const contact = (process.env.CRAWLER_CONTACT_URL || "").trim();
  if (!/^(https?:\/\/|mailto:)\S+$/.test(contact)) {
    throw new CrawlerConfigError(
      "CRAWLER_CONTACT_URL is not set. Set it in .env.local to a URL or mailto: address for the person running crawls.",
    );
  }
  return contact;
}

export function crawlerUserAgent(contact = crawlerContact()): string {
  return `Mozilla/5.0 (compatible; ${CRAWLER_TOKEN}/${CRAWLER_VERSION}; +${contact})`;
}
