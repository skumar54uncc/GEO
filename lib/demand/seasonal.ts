import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { seasonalEvents } from "@/lib/db/pg/schema";

export type SeasonalSeedKind =
  | "admissions_deadline"
  | "aid_deadline"
  | "orientation"
  | "term_start"
  | "commencement";

export type SeasonalSeedInput = {
  name: string;
  kind: SeasonalSeedKind;
  startsOn: string;
  endsOn?: string | null;
  recurrence?: string | null;
  /** Required. User confirms the URL later; seed never invents a missing source. */
  sourceUrl: string;
};

/**
 * Placeholder higher-ed calendar rows. Dates and URLs must be confirmed by the operator.
 * sourceUrl is required so Phase 8 publish-by dates stay evidence-backed.
 */
export const DEFAULT_SEASONAL_SEEDS: SeasonalSeedInput[] = [
  {
    name: "Fall undergraduate admissions deadline (confirm)",
    kind: "admissions_deadline",
    startsOn: "2026-06-01",
    endsOn: "2026-06-01",
    recurrence: "annual",
    sourceUrl: "https://admissions.charlotte.edu/",
  },
  {
    name: "Fall financial aid priority deadline (confirm)",
    kind: "aid_deadline",
    startsOn: "2026-03-01",
    endsOn: "2026-03-01",
    recurrence: "annual",
    sourceUrl: "https://finance.charlotte.edu/student-financial-services/",
  },
  {
    name: "Fall orientation (confirm)",
    kind: "orientation",
    startsOn: "2026-08-10",
    endsOn: "2026-08-20",
    recurrence: "annual",
    sourceUrl: "https://ninercentral.charlotte.edu/",
  },
  {
    name: "Fall term start (confirm)",
    kind: "term_start",
    startsOn: "2026-08-24",
    endsOn: "2026-08-24",
    recurrence: "annual",
    sourceUrl: "https://registrar.charlotte.edu/academic-calendar/",
  },
  {
    name: "Spring commencement (confirm)",
    kind: "commencement",
    startsOn: "2027-05-08",
    endsOn: "2027-05-09",
    recurrence: "annual",
    sourceUrl: "https://commencement.charlotte.edu/",
  },
];

export type SeasonalSeedResult = {
  name: string;
  kind: SeasonalSeedKind;
  id: string;
  created: boolean;
};

function requireSourceUrl(sourceUrl: string): string {
  const trimmed = sourceUrl.trim();
  if (!trimmed) throw new Error("seasonal_events.source_url is required");
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("seasonal_events.source_url must be http(s)");
    }
  } catch {
    throw new Error(`Invalid seasonal_events.source_url: ${sourceUrl}`);
  }
  return trimmed;
}

/** Idempotent on (org_id, kind, name). Never invents a blank source_url. */
export async function ensureSeasonalEvents(
  db: Db,
  orgId: string,
  seeds: SeasonalSeedInput[] = DEFAULT_SEASONAL_SEEDS,
): Promise<SeasonalSeedResult[]> {
  const out: SeasonalSeedResult[] = [];
  for (const seed of seeds) {
    const sourceUrl = requireSourceUrl(seed.sourceUrl);
    const [existing] = await db
      .select({ id: seasonalEvents.id })
      .from(seasonalEvents)
      .where(and(eq(seasonalEvents.orgId, orgId), eq(seasonalEvents.kind, seed.kind), eq(seasonalEvents.name, seed.name)))
      .limit(1);
    if (existing) {
      out.push({ name: seed.name, kind: seed.kind, id: existing.id, created: false });
      continue;
    }
    const [created] = await db
      .insert(seasonalEvents)
      .values({
        orgId,
        name: seed.name,
        kind: seed.kind,
        startsOn: seed.startsOn,
        endsOn: seed.endsOn ?? null,
        recurrence: seed.recurrence ?? null,
        sourceUrl,
      })
      .returning({ id: seasonalEvents.id });
    out.push({ name: seed.name, kind: seed.kind, id: created.id, created: true });
  }
  return out;
}
