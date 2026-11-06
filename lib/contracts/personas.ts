import { z } from "zod";

/** Broad reporting buckets. Dashboards default to these rows. */
export const PERSONA_GROUP_KEYS = [
  "prospective_students",
  "families_advisors",
  "business_leaders_partners",
  "research",
  "government_policy",
  "media",
  "supporters",
] as const;

export const personaGroupKeySchema = z.enum(PERSONA_GROUP_KEYS);

export const PERSONA_GROUP_LABELS: Record<(typeof PERSONA_GROUP_KEYS)[number], string> = {
  prospective_students: "Prospective students",
  families_advisors: "Families & advisors",
  business_leaders_partners: "Business leaders & partners",
  research: "Research",
  government_policy: "Government & policy",
  media: "Media",
  supporters: "Supporters",
};

/**
 * Canonical persona keys used for wording and (when n≥30) detail rows.
 * Includes the 20 content-team menu personas plus retained general undergrad/grad.
 */
export const CANONICAL_PERSONA_KEYS = [
  "undergrad",
  "first_year_in_state",
  "first_year_out_of_state",
  "transfer",
  "grad",
  "masters_applicant",
  "doctoral_applicant",
  "international",
  "adult_learner",
  "military_veteran",
  "parent",
  "school_counselor",
  "business_partner",
  "research_partner",
  "funding_agency",
  "state_policymaker",
  "federal_policymaker",
  "local_economic_development",
  "local_reporter",
  "trade_national_reporter",
  "donor",
  "alumni",
] as const;

export const canonicalPersonaKeySchema = z.enum(CANONICAL_PERSONA_KEYS);

/** The 20 personas campaigns pick from (menu). undergrad/grad are retained generals, not menu rows. */
export const MENU_PERSONA_KEYS = [
  "first_year_in_state",
  "first_year_out_of_state",
  "transfer",
  "masters_applicant",
  "doctoral_applicant",
  "international",
  "adult_learner",
  "military_veteran",
  "parent",
  "school_counselor",
  "business_partner",
  "research_partner",
  "funding_agency",
  "state_policymaker",
  "federal_policymaker",
  "local_economic_development",
  "local_reporter",
  "trade_national_reporter",
  "donor",
  "alumni",
] as const;

export const menuPersonaKeySchema = z.enum(MENU_PERSONA_KEYS);

export const canonicalPersonaSchema = z
  .object({
    id: z.uuid(),
    key: canonicalPersonaKeySchema,
    group: personaGroupKeySchema,
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

/**
 * Content-team DB keys keep their IDs. business_leader is a legacy alias of
 * business_partner (one persona for leaders and potential partners).
 */
export const LEGACY_PERSONA_MIGRATION = [
  {
    legacyKey: "undergrad",
    canonicalKey: "undergrad",
    idDecision: "preserve_existing_id",
  },
  {
    legacyKey: "grad",
    canonicalKey: "grad",
    idDecision: "preserve_existing_id",
  },
  {
    legacyKey: "research_partner",
    canonicalKey: "research_partner",
    idDecision: "preserve_existing_id",
  },
  {
    legacyKey: "business_partner",
    canonicalKey: "business_partner",
    idDecision: "preserve_existing_id",
  },
  {
    legacyKey: "business_leader",
    canonicalKey: "business_partner",
    idDecision: "preserve_existing_id",
  },
] as const;

export const personaMigrationDecisionSchema = z
  .object({
    legacyKey: legacyPersonaKeySchema,
    canonicalKey: canonicalPersonaKeySchema,
    idDecision: z.literal("preserve_existing_id"),
  })
  .strict();

/** Specific persona rows appear on dashboards only at this draw count (same as TOO_FEW_DRAWS). */
export const MIN_PERSONA_DRAWS_FOR_DETAIL = 30;

/** Campaigns should pick a small subset of the menu, not all 20. */
export const CAMPAIGN_PERSONA_SUBSET = { min: 3, max: 5 } as const;

export type PersonaGroupKey = z.infer<typeof personaGroupKeySchema>;
export type CanonicalPersonaKey = z.infer<typeof canonicalPersonaKeySchema>;
export type MenuPersonaKey = z.infer<typeof menuPersonaKeySchema>;
export type CanonicalPersona = z.infer<typeof canonicalPersonaSchema>;
export type PersonaMigrationDecision = z.infer<typeof personaMigrationDecisionSchema>;
