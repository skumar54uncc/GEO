import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { regions } from "@/lib/db/pg/schema";
import type { Engine, Region, RegionHonored, Runner } from "./types";

/**
 * DataForSEO `location_code` values for campaign measurement regions.
 * Source: GET https://api.dataforseo.com/v3/serp/google/locations
 * (also /v3/serp/google/locations/$country). Pulled 2026-11-09 against the live list.
 * Never invent codes — re-fetch from that endpoint if a new metro is added.
 */
export const DATAFORSEO_LOCATION_CODES = {
  us_national: 2840, // United States
  nc_statewide: 21160, // North Carolina,United States
  charlotte_metro: 1021048, // Charlotte,North Carolina,United States
  sc_statewide: 21173, // South Carolina,United States
  va_statewide: 21178, // Virginia,United States
  raleigh_metro: 1021278, // Raleigh,North Carolina,United States
  atlanta_metro: 1015254, // Atlanta,Georgia,United States
} as const;

export type RegionCatalogKey = keyof typeof DATAFORSEO_LOCATION_CODES;

export type RegionCatalogEntry = {
  key: RegionCatalogKey;
  label: string;
  country: string;
  state: string | null;
  city: string | null;
  language: string;
  serpLocation: string;
  latitude: string | null;
  longitude: string | null;
  timezone: string | null;
  locationCode: number;
  /** Short picker label for campaign settings. */
  pickerLabel: string;
};

/** Campaign settings catalog: US national, NC statewide, Charlotte metro, plus other states/metros. */
export const REGION_CATALOG: RegionCatalogEntry[] = [
  {
    key: "us_national",
    pickerLabel: "US national",
    label: "United States",
    country: "US",
    state: null,
    city: null,
    language: "en",
    serpLocation: "United States",
    latitude: null,
    longitude: null,
    timezone: null,
    locationCode: DATAFORSEO_LOCATION_CODES.us_national,
  },
  {
    key: "nc_statewide",
    pickerLabel: "NC statewide",
    label: "North Carolina, United States",
    country: "US",
    state: "North Carolina",
    city: null,
    language: "en",
    serpLocation: "North Carolina,United States",
    latitude: null,
    longitude: null,
    timezone: "America/New_York",
    locationCode: DATAFORSEO_LOCATION_CODES.nc_statewide,
  },
  {
    key: "charlotte_metro",
    pickerLabel: "Charlotte metro",
    label: "Charlotte, North Carolina, United States",
    country: "US",
    state: "North Carolina",
    city: "Charlotte",
    language: "en",
    serpLocation: "Charlotte,North Carolina,United States",
    latitude: "35.2271",
    longitude: "-80.8431",
    timezone: "America/New_York",
    locationCode: DATAFORSEO_LOCATION_CODES.charlotte_metro,
  },
  {
    key: "sc_statewide",
    pickerLabel: "SC statewide",
    label: "South Carolina, United States",
    country: "US",
    state: "South Carolina",
    city: null,
    language: "en",
    serpLocation: "South Carolina,United States",
    latitude: null,
    longitude: null,
    timezone: "America/New_York",
    locationCode: DATAFORSEO_LOCATION_CODES.sc_statewide,
  },
  {
    key: "va_statewide",
    pickerLabel: "VA statewide",
    label: "Virginia, United States",
    country: "US",
    state: "Virginia",
    city: null,
    language: "en",
    serpLocation: "Virginia,United States",
    latitude: null,
    longitude: null,
    timezone: "America/New_York",
    locationCode: DATAFORSEO_LOCATION_CODES.va_statewide,
  },
  {
    key: "raleigh_metro",
    pickerLabel: "Raleigh metro",
    label: "Raleigh, North Carolina, United States",
    country: "US",
    state: "North Carolina",
    city: "Raleigh",
    language: "en",
    serpLocation: "Raleigh,North Carolina,United States",
    latitude: "35.7796",
    longitude: "-78.6382",
    timezone: "America/New_York",
    locationCode: DATAFORSEO_LOCATION_CODES.raleigh_metro,
  },
  {
    key: "atlanta_metro",
    pickerLabel: "Atlanta metro",
    label: "Atlanta, Georgia, United States",
    country: "US",
    state: "Georgia",
    city: "Atlanta",
    language: "en",
    serpLocation: "Atlanta,Georgia,United States",
    latitude: "33.7490",
    longitude: "-84.3880",
    timezone: "America/New_York",
    locationCode: DATAFORSEO_LOCATION_CODES.atlanta_metro,
  },
];

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

/** Resolve DataForSEO location_code for a stored region (by serp_location or label). */
export function dataForSeoLocationCode(region: Pick<Region, "serpLocation" | "label">): number | null {
  const serp = region.serpLocation?.trim() || null;
  const label = region.label.trim();
  for (const entry of REGION_CATALOG) {
    if (serp && entry.serpLocation === serp) return entry.locationCode;
    if (entry.label === label) return entry.locationCode;
  }
  // Legacy CHARLOTTE / US labels without catalog punctuation differences
  if (serp === CHARLOTTE_REGION.serpLocation || label === CHARLOTTE_REGION.label) {
    return DATAFORSEO_LOCATION_CODES.charlotte_metro;
  }
  if (serp === US_REGION.serpLocation || label === US_REGION.label) {
    return DATAFORSEO_LOCATION_CODES.us_national;
  }
  return null;
}

export async function ensureNamedRegion(db: Db, spec: typeof CHARLOTTE_REGION | typeof US_REGION | RegionCatalogEntry): Promise<Region> {
  const label = "pickerLabel" in spec ? spec.label : spec.label;
  const [existing] = await db.select().from(regions).where(eq(regions.label, label));
  if (existing) return toRegion(existing);
  const values =
    "pickerLabel" in spec
      ? {
          label: spec.label,
          country: spec.country,
          state: spec.state,
          city: spec.city,
          language: spec.language,
          serpLocation: spec.serpLocation,
          latitude: spec.latitude,
          longitude: spec.longitude,
          timezone: spec.timezone,
        }
      : { ...spec };
  await db.insert(regions).values(values).onConflictDoNothing();
  const [row] = await db.select().from(regions).where(eq(regions.label, label));
  return toRegion(row);
}

/** Ensure every campaign-picker region exists in `regions` (idempotent). */
export async function ensureCatalogRegions(db: Db): Promise<Region[]> {
  const out: Region[] = [];
  for (const entry of REGION_CATALOG) {
    out.push(await ensureNamedRegion(db, entry));
  }
  return out;
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

/**
 * Engines/runners that ignore location must never show a region visibility number.
 * api_parametric has no browsing / no location. Manual paste is location-agnostic.
 */
export function regionLocationSupport(
  engine: Engine,
  runner: Runner,
): "supported" | "not_supported" {
  if (runner === "api_parametric" || runner === "manual_paste") return "not_supported";
  void engine;
  return "supported";
}

export const REGION_NOT_SUPPORTED_LABEL = "region not supported" as const;
