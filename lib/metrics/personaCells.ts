import {
  MIN_PERSONA_DRAWS_FOR_DETAIL,
  type CanonicalPersonaKey,
  type PersonaGroupKey,
} from "@/lib/contracts/personas";
import { canonicalKeyForDbKey, groupForDbKey, selectableDbKeyForCanonical } from "@/lib/personas/library";
import type { CellRollup } from "./rollup";
import type { CellKey } from "./types";

export type PersonaCellMeta = {
  dbKey: string;
  group: PersonaGroupKey;
  canonicalKey: CanonicalPersonaKey;
  /** Persona id used when rolling specific persona cells (aliases remap here). */
  reportPersonaId: string;
};

/**
 * Build id → meta for rollup. business_leader remaps to the business_partner row id
 * so hiring and partnering stay one persona in metrics.
 */
export function buildPersonaCellMeta(
  rows: Array<{ id: string; key: string | null }>,
): Map<string, PersonaCellMeta> {
  const byKey = new Map(rows.filter((r) => r.key).map((r) => [r.key!, r.id]));
  const out = new Map<string, PersonaCellMeta>();
  for (const row of rows) {
    if (!row.key) continue;
    const canonicalKey = canonicalKeyForDbKey(row.key);
    const group = groupForDbKey(row.key);
    if (!canonicalKey || !group) continue;
    const reportKey = selectableDbKeyForCanonical(canonicalKey);
    const reportPersonaId = byKey.get(reportKey) ?? row.id;
    out.set(row.id, { dbKey: row.key, group, canonicalKey, reportPersonaId });
  }
  return out;
}

export function canonicalPersonaForCell(
  personaId: string | null,
  idToDbKey: Map<string, string | null>,
): CanonicalPersonaKey | null {
  if (!personaId) return null;
  const dbKey = idToDbKey.get(personaId);
  if (!dbKey) return null;
  return canonicalKeyForDbKey(dbKey);
}

/**
 * business_partner and business_leader must share one canonical meaning. Distinct
 * content-team IDs are preserved; metrics combine them via reportPersonaId.
 */
export function assertBusinessPartnerAliasCombined(
  cells: readonly CellRollup[],
  meta: Map<string, PersonaCellMeta>,
): void {
  for (const cell of cells) {
    const personaId = cell.key.personaId;
    if (!personaId) continue;
    const m = meta.get(personaId);
    if (!m) continue;
    if (m.canonicalKey === "business_partner" && personaId !== m.reportPersonaId) {
      throw new Error("business_leader draws must roll into the business_partner persona cell");
    }
  }
}

/** Dashboard: group cells always; specific persona cells only when draws ≥ 30. */
export function dashboardPersonaSlices(cells: readonly CellRollup[]): {
  byGroup: CellRollup[];
  byPersona: CellRollup[];
} {
  const byGroup = cells.filter((c) => c.key.personaGroup !== null && c.key.personaId === null);
  const byPersona = cells.filter(
    (c) => c.key.personaId !== null && c.key.personaGroup === null && c.draws >= MIN_PERSONA_DRAWS_FOR_DETAIL,
  );
  return { byGroup, byPersona };
}

export function cellPersonaKey(key: CellKey): string {
  if (key.personaGroup) return `group:${key.personaGroup}`;
  return key.personaId ?? "none";
}
