/**
 * Built-in fixture prompts for generation UI until live provider keys exist.
 * Stems and persona openings must stay brand-free (see openings tests).
 */
import { PERSONA_LIBRARY } from "@/lib/personas/library";
import { openingContainsBrandOrAlias, TEST_BRAND_ALIASES } from "@/lib/personas/openings";
import type { GenerateFixture, Intent } from "@/lib/prompts/generate";
import { intentValues } from "@/lib/prompts/generate";

/** Neutral follow-ups — no institution names. */
export const FIXTURE_INTENT_STEMS: Record<Intent, readonly string[]> = {
  discovery: [
    "What should I look for when comparing programs in this field?",
    "Which factors matter most when shortlisting schools for this topic?",
  ],
  comparison: [
    "How do I compare curriculum depth and outcomes across programs?",
    "What tradeoffs should I weigh between research strength and cost?",
  ],
  evaluation: [
    "How do I tell whether a program is a strong fit for my background?",
    "What evidence should I check before ranking a program as a top choice?",
  ],
  decision: [
    "What final checks should I run before submitting an application?",
    "How do I decide between two programs that look similar on paper?",
  ],
};

export function assertFixturePackBrandSafe(aliases = TEST_BRAND_ALIASES): void {
  for (const def of PERSONA_LIBRARY) {
    if (openingContainsBrandOrAlias(def.opening, aliases)) {
      throw new Error(`Fixture persona opening for ${def.dbKey} contains a brand alias`);
    }
  }
  for (const intent of intentValues) {
    for (const stem of FIXTURE_INTENT_STEMS[intent]) {
      if (openingContainsBrandOrAlias(stem, aliases)) {
        throw new Error(`Fixture stem for ${intent} contains a brand alias: ${stem}`);
      }
    }
  }
}

export type FixturePersona = {
  id: string;
  key: string | null;
  opening: string | null;
};

/**
 * One draft prompt per persona × intent (first stem). Texts concatenate the brand-safe
 * persona opening with a neutral intent stem. Marked synthesized / fixture for the UI label.
 */
export function buildBuiltinFixture(opts: {
  personas: FixturePersona[];
  intents: Intent[];
}): GenerateFixture {
  if (opts.personas.length < 3 || opts.personas.length > 5) {
    throw new Error("Pick 3 to 5 personas for generation.");
  }
  if (!opts.intents.length) throw new Error("Pick at least one intent.");
  const prompts: GenerateFixture["prompts"] = [];
  for (const persona of opts.personas) {
    const opening = (persona.opening ?? "").trim();
    for (const intent of opts.intents) {
      const stem = FIXTURE_INTENT_STEMS[intent][0]!;
      const text = opening ? `${opening} ${stem}` : stem;
      prompts.push({
        text,
        personaId: persona.id,
        personaKey: persona.key ?? undefined,
        intent,
        provenance: "fixture",
        demandEvidenceIds: [],
      });
    }
  }
  return { prompts };
}
