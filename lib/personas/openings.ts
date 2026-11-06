import type { AliasEntry } from "@/lib/judge/aliases";
import { matchAliases } from "@/lib/judge/aliases";
import { PERSONA_LIBRARY } from "./library";

/**
 * Persona openings must never contain the brand or any alias. That would tilt
 * the model toward us and inflate visibility scores. "North Carolina" is fine.
 */
export function openingContainsBrandOrAlias(opening: string, aliases: readonly AliasEntry[]): boolean {
  return matchAliases(opening, aliases as AliasEntry[]).some((m) => m.entityType === "brand");
}

export function assertLibraryOpeningsBrandSafe(aliases: readonly AliasEntry[]): void {
  for (const persona of PERSONA_LIBRARY) {
    if (openingContainsBrandOrAlias(persona.opening, aliases)) {
      throw new Error(`Persona opening for ${persona.dbKey} contains a brand alias`);
    }
  }
}

/** Fixture aliases used in unit tests (mirrors typical UNC Charlotte brand table). */
export const TEST_BRAND_ALIASES: AliasEntry[] = [
  { alias: "UNC Charlotte", entityType: "brand", entityId: "brand", entityName: "UNC Charlotte", requiresContext: false },
  { alias: "University of North Carolina at Charlotte", entityType: "brand", entityId: "brand", entityName: "UNC Charlotte", requiresContext: false },
  { alias: "UNCC", entityType: "brand", entityId: "brand", entityName: "UNC Charlotte", requiresContext: false },
  { alias: "Charlotte", entityType: "brand", entityId: "brand", entityName: "UNC Charlotte", requiresContext: true },
];
