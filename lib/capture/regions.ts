import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { regions } from "@/lib/db/pg/schema";
import type { Region, RegionHonored } from "./types";

/** The default measurement region (ARCHITECTURE 8: start with one region, US Charlotte metro). */
export const CHARLOTTE_REGION = {
  label: "Charlotte, North Carolina, United States",
  country: "US",
  state: "North Carolina",
  city: "Charlotte",
  language: "en",
  serpLocation: "Charlotte,North Carolina,United States",
  latitude: "35.2271",
  longitude: "-80.8431",
  timezone: "America/New_York",
} as const;

export const US_REGION = {
  label: "United States",
  country: "US",
  state: null,
  city: null,
  language: "en",
  serpLocation: "United States",
  latitude: null,
  longitude: null,
  timezone: null,
} as const;

const COUNTRY_NAMES: Record<string, string> = { US: "United States" };

export function countryName(code: string | null): string | null {
  return code ? (COUNTRY_NAMES[code.toUpperCase()] ?? null) : null;
}

type RegionRow = typeof regions.$inferSelect;

export function toRegion(r: RegionRow): Region {
  const n = (v: string | null) => (v === null || v === undefined ? null : Number(v));
  return {
    id: r.id,
    label: r.label,
    country: r.country,
    state: r.state,
    city: r.city,
    language: r.language,
    serpLocation: r.serpLocation,
    latitude: n(r.latitude),
    longitude: n(r.longitude),
    timezone: r.timezone,
  };
}

export async function ensureNamedRegion(db: Db, spec: typeof CHARLOTTE_REGION | typeof US_REGION): Promise<Region> {
  const [existing] = await db.select().from(regions).where(eq(regions.label, spec.label));
  if (existing) return toRegion(existing);
  await db.insert(regions).values({ ...spec }).onConflictDoNothing();
  const [row] = await db.select().from(regions).where(eq(regions.label, spec.label));
  return toRegion(row);
}

export async function loadRegion(db: Db, id: string): Promise<Region | null> {
  const [row] = await db.select().from(regions).where(eq(regions.id, id));
  return row ? toRegion(row) : null;
}

export async function listRegions(db: Db): Promise<Region[]> {
  return (await db.select().from(regions)).map(toRegion);
}

/** How finely a provider can be told where the user is. */
export type Granularity = "city" | "state" | "country" | "coordinates" | "none";

/**
 * ARCHITECTURE 5.4. Native SERP location at the region's own granularity: yes. Approximate API location:
 * unknown, since nothing confirms it was used. Coarser than the region, or none at all: no.
 */
export function regionHonored(region: Region, passed: Granularity, kind: "native" | "approximate"): RegionHonored {
  if (passed === "none") return "no";
  const needs: Granularity = region.city ? "city" : region.state ? "state" : "country";
  const rank: Record<Granularity, number> = { none: 0, country: 1, state: 2, city: 3, coordinates: 3 };
  if (rank[passed] < rank[needs]) return "no";
  return kind === "native" ? "yes" : "unknown";
}
