/**
 * Every fixture / demo-org seed row that must never appear under UNC Charlotte
 * carries this exact marker. Production and real-pilot rows leave it null.
 */
export const DEMO_SEED_MARKER = "demo_seed:v1" as const;

export type DemoSeedMarker = typeof DEMO_SEED_MARKER;

export function isDemoSeedMarker(value: string | null | undefined): boolean {
  return value === DEMO_SEED_MARKER;
}
