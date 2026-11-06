import { z } from "zod";

export const CANONICAL_PERSONA_KEYS = [
  "prospective_first_year",
  "transfer",
  "grad_applicant",
  "international",
  "parent",
  "adult_learner",
  "employer",
  "research_partner",
  "donor",
  "journalist",
  "policymaker",
] as const;

export const canonicalPersonaKeySchema = z.enum(CANONICAL_PERSONA_KEYS);

export const canonicalPersonaSchema = z
  .object({
    id: z.uuid(),
    key: canonicalPersonaKeySchema,
    name: z.string().trim().min(1),
    goal: z.string().trim().min(1),
    background: z.string().trim().min(1),
    vocabularyLevel: z.string().trim().min(1),
    notes: z.string(),
  })
  .strict();

export const LEGACY_PERSONA_KEYS = [
  "undergrad",
  "grad",
  "research_partner",
  "business_partner",
  "business_leader",
] as const;

export const legacyPersonaKeySchema = z.enum(LEGACY_PERSONA_KEYS);

export const LEGACY_PERSONA_MIGRATION = [
  {
    legacyKey: "undergrad",
    canonicalKey: "prospective_first_year",
    idDecision: "preserve_existing_id",
  },
  {
    legacyKey: "grad",
    canonicalKey: "grad_applicant",
    idDecision: "preserve_existing_id",
  },
  {
    legacyKey: "research_partner",
    canonicalKey: "research_partner",
    idDecision: "preserve_existing_id",
  },
  {
    legacyKey: "business_partner",
    canonicalKey: "employer",
    idDecision: "preserve_existing_id",
  },
  {
    legacyKey: "business_leader",
    canonicalKey: "employer",
    idDecision: "preserve_existing_id_as_legacy_alias",
  },
] as const;

/**
 * `business_partner` owns the canonical employer row and keeps its existing ID.
 * `business_leader` keeps its existing row and ID so imported prompts remain
 * valid, but is a legacy alias rather than a second selectable persona. Future
 * generation resolves both keys to the one canonical employer meaning without
 * rewriting historical prompt references.
 */
export const personaMigrationDecisionSchema = z.discriminatedUnion("idDecision", [
  z
    .object({
      legacyKey: legacyPersonaKeySchema,
      canonicalKey: canonicalPersonaKeySchema,
      idDecision: z.literal("preserve_existing_id"),
    })
    .strict(),
  z
    .object({
      legacyKey: z.literal("business_leader"),
      canonicalKey: z.literal("employer"),
      idDecision: z.literal("preserve_existing_id_as_legacy_alias"),
    })
    .strict(),
]);

export type CanonicalPersonaKey = z.infer<typeof canonicalPersonaKeySchema>;
export type CanonicalPersona = z.infer<typeof canonicalPersonaSchema>;
export type PersonaMigrationDecision = z.infer<typeof personaMigrationDecisionSchema>;
