import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { seasonalEvents } from "@/lib/db/pg/schema";

export type SeasonalSeedKind =
  | "admissions_deadline"
  | "aid_deadline"
  | "orientation"
  | "term_start"
  | "commencement"
  | "custom";

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
 * Configurable higher-ed calendar. Dates live here as seed data (not hardcoded in
 * scoring). Phase 8 publish-by dates look up these rows. Confirm URLs with the operator.
 */
export const DEFAULT_SEASONAL_SEEDS: SeasonalSeedInput[] = [
  {
    name: "FAFSA opens",
    kind: "aid_deadline",
    startsOn: "2026-10-01",
    endsOn: "2026-10-01",
    recurrence: "annual",
    sourceUrl: "https://studentaid.gov/h/apply-for-aid/fafsa",
  },
  {
    name: "Early action deadline",
    kind: "admissions_deadline",
    startsOn: "2026-11-01",
    endsOn: "2026-11-01",
    recurrence: "annual",
    sourceUrl: "https://admissions.charlotte.edu/",
  },
  {
    name: "Regular decision deadline",
    kind: "admissions_deadline",
    startsOn: "2027-01-15",
    endsOn: "2027-01-15",
    recurrence: "annual",
    sourceUrl: "https://admissions.charlotte.edu/",
  },
  {
    name: "National College Decision Day",
    kind: "custom",
    startsOn: "2027-05-01",
    endsOn: "2027-05-01",
    recurrence: "annual",
    sourceUrl: "https://www.nacacnet.org/",
  },
  {
    name: "Fall term start",
    kind: "term_start",
    startsOn: "2027-08-24",
    endsOn: "2027-08-24",
    recurrence: "annual",
    sourceUrl: "https://registrar.charlotte.edu/academic-calendar/",
  },
  {
    name: "Fall orientation (confirm)",
    kind: "orientation",
    startsOn: "2027-08-10",
    endsOn: "2027-08-20",
    recurrence: "annual",
    sourceUrl: "https://ninercentral.charlotte.edu/",
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

/** Earliest upcoming event on or after `fromDate` (ISO date). Used for publish-by. */
export async function nextSeasonalEvent(
  db: Db,
  orgId: string,
  fromDate: string,
): Promise<{ id: string; name: string; startsOn: string } | null> {
  const rows = await db
    .select({
      id: seasonalEvents.id,
      name: seasonalEvents.name,
      startsOn: seasonalEvents.startsOn,
    })
    .from(seasonalEvents)
    .where(eq(seasonalEvents.orgId, orgId));
  const upcoming = rows
    .filter((r) => r.startsOn >= fromDate)
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0));
  return upcoming[0] ?? null;
}
