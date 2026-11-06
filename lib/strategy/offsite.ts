import type { OffsiteOpportunity } from "@/lib/contracts/strategy";

export type CitationDomainRow = {
  domain: string;
  sourceClass: string;
  url: string;
  /** Mentions our brand in the same draw. */
  citesUs: boolean;
  /** Mentions a tracked competitor. */
  citesPeer: boolean;
};

/**
 * Third-party lists, directories, and media domains that cite peers but not us.
 * Built from citation rows already stored for the landscape scan.
 */
export function buildOffsiteOpportunities(rows: readonly CitationDomainRow[]): OffsiteOpportunity[] {
  const byDomain = new Map<
    string,
    { sourceClass: string; peer: number; us: number; urls: Set<string>; n: number }
  >();
  for (const row of rows) {
    if (!row.citesPeer && !row.citesUs) continue;
    const cur = byDomain.get(row.domain) ?? {
      sourceClass: row.sourceClass,
      peer: 0,
      us: 0,
      urls: new Set<string>(),
      n: 0,
    };
    if (row.citesPeer) cur.peer += 1;
    if (row.citesUs) cur.us += 1;
    cur.n += 1;
    if (row.url) cur.urls.add(row.url);
    if (row.sourceClass && row.sourceClass !== "other") cur.sourceClass = row.sourceClass;
    byDomain.set(row.domain, cur);
  }

  const out: OffsiteOpportunity[] = [];
  for (const [domain, cur] of [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (cur.peer > 0 && cur.us === 0) {
      out.push({
        domain,
        sourceClass: cur.sourceClass || "other",
        peerCitationCount: cur.peer,
        ourCitationCount: cur.us,
        exampleUrls: [...cur.urls].sort().slice(0, 5),
        n: cur.n,
      });
    }
  }
  return out;
}
