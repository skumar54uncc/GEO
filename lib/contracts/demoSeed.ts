/**
 * Every fixture / demo-org seed row that must never appear under UNC Charlotte
 * carries one of these markers. Production and real-pilot rows leave seed_marker null.
 */
export const DEMO_SEED_MARKER = "demo_seed:v1" as const;
export const TEST_FIXTURE_MARKER = "test_fixture:v1" as const;

export type DemoSeedMarker = typeof DEMO_SEED_MARKER;
export type TestFixtureMarker = typeof TEST_FIXTURE_MARKER;

/** Markers that prove a row came from demo seed or automated test fixtures. */
export const FORBIDDEN_SEED_MARKERS = [DEMO_SEED_MARKER, TEST_FIXTURE_MARKER] as const;

export type ForbiddenSeedMarker = (typeof FORBIDDEN_SEED_MARKERS)[number];

export function isDemoSeedMarker(value: string | null | undefined): boolean {
  return value === DEMO_SEED_MARKER;
}

export function isTestFixtureMarker(value: string | null | undefined): boolean {
  return value === TEST_FIXTURE_MARKER;
}

/** True when a seed_marker must never appear under UNC Charlotte. */
export function isForbiddenSeedMarker(value: string | null | undefined): boolean {
  if (!value) return false;
  return (
    value === DEMO_SEED_MARKER ||
    value === TEST_FIXTURE_MARKER ||
    value.startsWith("demo_seed:") ||
    value.startsWith("test_fixture:")
  );
}
