import type { CanonicalPersonaKey } from "@/lib/contracts/personas";
import { canonicalKeyForDbKey } from "@/lib/personas/library";
import type { CellRollup } from "./rollup";
import type { CellKey } from "./types";

/**
 * Metrics and heatmaps group by canonical persona. industry_partner and employer
 * keep distinct content-team IDs and must never share a cell.
 */
export function canonicalPersonaForCell(
  personaId: string | null,
  idToDbKey: Map<string, string | null>,
): CanonicalPersonaKey | null {
  if (!personaId) return null;
  const dbKey = idToDbKey.get(personaId);
  if (!dbKey) return null;
  return canonicalKeyForDbKey(dbKey);
}

export function assertCanonicalPersonaCellsNotCombined(
  cells: readonly CellRollup[],
  idToDbKey: Map<string, string | null>,
): void {
  const byCanonical = new Map<CanonicalPersonaKey, Set<string>>();
  for (const cell of cells) {
    const personaId = cell.key.personaId;
    if (!personaId) continue;
    const canonical = canonicalPersonaForCell(personaId, idToDbKey);
    if (!canonical) continue;
    const ids = byCanonical.get(canonical) ?? new Set<string>();
    ids.add(personaId);
    byCanonical.set(canonical, ids);
  }
  const industry = byCanonical.get("industry_partner");
  const employer = byCanonical.get("employer");
  if (industry && employer) {
    for (const id of industry) {
      if (employer.has(id)) {
        throw new Error("industry_partner and employer must never share a metrics persona cell");
      }
    }
  }
  // Distinct canonical keys must not collapse onto one personaId either.
  const idToCanonical = new Map<string, CanonicalPersonaKey>();
  for (const [canonical, ids] of byCanonical) {
    for (const id of ids) {
      const existing = idToCanonical.get(id);
      if (existing && existing !== canonical) {
        throw new Error(`persona ${id} mapped to both ${existing} and ${canonical}`);
      }
      idToCanonical.set(id, canonical);
    }
  }
}

export function cellPersonaKey(key: CellKey): string {
  return key.personaId ?? "none";
}
