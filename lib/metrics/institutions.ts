import type { MetricDraw } from "@/lib/metrics/load";
import { assertSameIndex } from "@/lib/metrics/indexes";

export type InstitutionRank = {
  entityId: string;
  name: string;
  mentions: number;
  /** Share of entity-mention draws within the index (brand + competitors). */
  rate: number;
  isUs: boolean;
};

/**
 * Most-mentioned institutions within one index from valid cell draws.
 * Never invents peers: only entities that appear in mentions are ranked.
 */
export function institutionRanks(
  draws: readonly MetricDraw[],
  opts: {
    brandId: string;
    brandName: string;
    competitorNames: ReadonlyMap<string, string>;
  },
): InstitutionRank[] {
  if (draws.length === 0) return [];
  assertSameIndex(draws.map((d) => d.engine));
  const counts = new Map<string, { name: string; mentions: number; isUs: boolean }>();
  const bump = (id: string, name: string, isUs: boolean) => {
    const cur = counts.get(id) ?? { name, mentions: 0, isUs };
    cur.mentions += 1;
    counts.set(id, cur);
  };
  for (const d of draws) {
    const brandHit = d.mentions.some((m) => m.entityType === "brand");
    if (brandHit) bump(opts.brandId, opts.brandName, true);
    const comps = new Set(d.mentions.filter((m) => m.entityType === "competitor").map((m) => m.entityId));
    for (const id of comps) {
      const name = opts.competitorNames.get(id);
      if (!name) continue;
      bump(id, name, false);
    }
  }
  const total = [...counts.values()].reduce((s, c) => s + c.mentions, 0);
  if (total === 0) return [];
  return [...counts.entries()]
    .map(([entityId, c]) => ({
      entityId,
      name: c.name,
      mentions: c.mentions,
      rate: c.mentions / total,
      isUs: c.isUs,
    }))
    .sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
}
