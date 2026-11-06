import {
  CANONICAL_PERSONA_KEYS,
  LEGACY_PERSONA_MIGRATION,
  type CanonicalPersonaKey,
} from "@/lib/contracts/personas";
import { CONTENT_TEAM_PERSONAS, type ContentTeamPersonaKey } from "@/lib/contentTeam/personas";

export type PersonaLibraryDefinition = {
  canonicalKey: CanonicalPersonaKey;
  /** Stable `personas.key` value. Content-team rows keep their legacy keys. */
  dbKey: string;
  /** Library display name for the selectable personas. */
  name: string;
  goal: string;
  background: string;
  vocabulary: string;
  region: string;
  typicalQuestions: string[];
  notes: string;
  /** When set, the content-team seed owns name/goal/draft_prefix; we only enrich fields. */
  contentTeamKey?: ContentTeamPersonaKey;
  selectable: true;
};

const byLegacy = Object.fromEntries(
  LEGACY_PERSONA_MIGRATION.map((row) => [row.legacyKey, row]),
) as Record<string, (typeof LEGACY_PERSONA_MIGRATION)[number]>;

function contentTeamMeta(key: ContentTeamPersonaKey) {
  const row = CONTENT_TEAM_PERSONAS.find((p) => p.key === key);
  if (!row) throw new Error(`Missing content-team persona ${key}`);
  return row;
}

/**
 * Twelve selectable higher-ed personas. The five content-team rows keep their
 * existing `key` values and IDs; new personas use the canonical key as `dbKey`.
 * industry_partner and employer stay separate rows and are never combined in metrics.
 */
export const PERSONA_LIBRARY: PersonaLibraryDefinition[] = [
  {
    canonicalKey: "prospective_first_year",
    dbKey: "undergrad",
    name: "Prospective first year",
    goal: contentTeamMeta("undergrad").goal,
    background: "High school senior or recent graduate comparing undergraduate options.",
    vocabulary: "plain",
    region: "United States",
    typicalQuestions: [
      "Which universities are strong for my intended major?",
      "How do I compare cost of attendance and aid?",
      "What is campus life like for first-year students?",
    ],
    notes: "Maps from content-team key undergrad. A persona changes prompt wording, not who is logged in.",
    contentTeamKey: "undergrad",
    selectable: true,
  },
  {
    canonicalKey: "transfer",
    dbKey: "transfer",
    name: "Transfer student",
    goal: "Find a university that accepts transfer credits and fits academic plans",
    background: "Community college or four-year student planning to transfer.",
    vocabulary: "plain",
    region: "United States",
    typicalQuestions: [
      "Which universities accept the most transfer credits for my major?",
      "How long will it take to finish after transferring?",
      "What support exists for transfer students?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    selectable: true,
  },
  {
    canonicalKey: "grad_applicant",
    dbKey: "grad",
    name: "Grad applicant",
    goal: contentTeamMeta("grad").goal,
    background: "Bachelor's holder evaluating master's or doctoral programs.",
    vocabulary: "academic",
    region: "United States",
    typicalQuestions: [
      "Which graduate programs fit my research interests?",
      "What funding or assistantships are typical?",
      "How competitive is admission for this program?",
    ],
    notes: "Maps from content-team key grad.",
    contentTeamKey: "grad",
    selectable: true,
  },
  {
    canonicalKey: "international",
    dbKey: "international",
    name: "International student",
    goal: "Choose a U.S. university with visa support, English pathways, and recognized degrees",
    background: "Applicant outside the U.S. comparing schools and visa logistics.",
    vocabulary: "plain",
    region: "International",
    typicalQuestions: [
      "Which universities support F-1 students well in my field?",
      "What are typical English proficiency and transcript requirements?",
      "How do living costs compare for international students?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    selectable: true,
  },
  {
    canonicalKey: "parent",
    dbKey: "parent",
    name: "Parent",
    goal: "Help a student choose a safe, affordable university with strong outcomes",
    background: "Parent or guardian researching options with or for a student.",
    vocabulary: "plain",
    region: "United States",
    typicalQuestions: [
      "Is this university a good value for families?",
      "How safe is the campus and surrounding area?",
      "What career outcomes do graduates report?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    selectable: true,
  },
  {
    canonicalKey: "adult_learner",
    dbKey: "adult_learner",
    name: "Adult learner",
    goal: "Find flexible programs that fit work and family schedules",
    background: "Working adult returning to school for a degree or credential.",
    vocabulary: "plain",
    region: "United States",
    typicalQuestions: [
      "Which programs offer evening, online, or part-time options?",
      "Can prior work experience count toward a degree?",
      "What is the realistic time to completion for working students?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    selectable: true,
  },
  {
    canonicalKey: "industry_partner",
    dbKey: "business_partner",
    name: "Industry partner",
    goal: contentTeamMeta("business_partner").goal,
    background: "Company seeking research collaboration, sponsored projects, or industry partnership with a university.",
    vocabulary: "business",
    region: "United States",
    typicalQuestions: [
      "Which universities are strong partners for industry collaboration?",
      "How do sponsored research agreements typically work?",
      "What applied research centers work with industry partners?",
    ],
    notes:
      "Maps from content-team key business_partner. Distinct from employer (hiring). Metrics never combine the two.",
    contentTeamKey: "business_partner",
    selectable: true,
  },
  {
    canonicalKey: "employer",
    dbKey: "business_leader",
    name: "Employer",
    goal: contentTeamMeta("business_leader").goal,
    background: "Business leader who hires interns and graduates from universities.",
    vocabulary: "business",
    region: "United States",
    typicalQuestions: [
      "Where should I recruit interns for my company?",
      "Which programs produce job-ready graduates?",
      "How do I hire graduates from this university?",
    ],
    notes:
      "Maps from content-team key business_leader. Distinct from industry_partner. Metrics never combine the two.",
    contentTeamKey: "business_leader",
    selectable: true,
  },
  {
    canonicalKey: "research_partner",
    dbKey: "research_partner",
    name: "Research partner",
    goal: contentTeamMeta("research_partner").goal,
    background: "Lab lead, PI, or industry researcher seeking university collaboration.",
    vocabulary: "academic",
    region: "United States",
    typicalQuestions: [
      "Which faculty or centers work on this research topic?",
      "How do sponsored research agreements typically work?",
      "What facilities or shared labs are available?",
    ],
    notes: "Content-team key research_partner is unchanged.",
    contentTeamKey: "research_partner",
    selectable: true,
  },
  {
    canonicalKey: "donor",
    dbKey: "donor",
    name: "Donor",
    goal: "Identify high-impact giving opportunities aligned with university priorities",
    background: "Alum or philanthropist considering gifts, endowments, or named funds.",
    vocabulary: "plain",
    region: "United States",
    typicalQuestions: [
      "Where does philanthropic support make the biggest difference?",
      "How are scholarship funds stewarded?",
      "What naming or endowment options exist?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    selectable: true,
  },
  {
    canonicalKey: "journalist",
    dbKey: "journalist",
    name: "Journalist",
    goal: "Find credible experts, data, and institutional context for a story",
    background: "Reporter or editor researching higher-ed or regional stories.",
    vocabulary: "journalistic",
    region: "United States",
    typicalQuestions: [
      "Who are the go-to experts on this topic at the university?",
      "What public data or reports are available?",
      "How does this university compare with peers on this issue?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    selectable: true,
  },
  {
    canonicalKey: "policymaker",
    dbKey: "policymaker",
    name: "Policymaker",
    goal: "Understand institutional capacity, workforce outcomes, and public impact",
    background: "Staffer, agency analyst, or elected official evaluating higher-ed policy.",
    vocabulary: "policy",
    region: "United States",
    typicalQuestions: [
      "How does this university contribute to regional workforce needs?",
      "What evidence exists for program outcomes?",
      "How do peer public universities compare on this metric?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    selectable: true,
  },
];

export const CONTENT_TEAM_PERSONA_KEYS = CONTENT_TEAM_PERSONAS.map((p) => p.key);

export function assertPersonaLibraryComplete(): void {
  const keys = PERSONA_LIBRARY.map((p) => p.canonicalKey);
  if (keys.length !== 12) throw new Error(`Expected 12 selectable personas, got ${keys.length}`);
  if (new Set(keys).size !== 12) throw new Error("Duplicate canonical persona keys in library");
  for (const key of CANONICAL_PERSONA_KEYS) {
    if (!keys.includes(key)) throw new Error(`Missing canonical persona ${key}`);
  }
  if (byLegacy.business_partner?.canonicalKey !== "industry_partner") {
    throw new Error("business_partner must map to industry_partner");
  }
  if (byLegacy.business_leader?.canonicalKey !== "employer") {
    throw new Error("business_leader must map to employer");
  }
  if (selectableDbKeyForCanonical("industry_partner") === selectableDbKeyForCanonical("employer")) {
    throw new Error("industry_partner and employer must keep distinct persona rows");
  }
}

export function canonicalKeyForDbKey(dbKey: string): CanonicalPersonaKey | null {
  const library = PERSONA_LIBRARY.find((p) => p.dbKey === dbKey);
  if (library) return library.canonicalKey;
  const migration = LEGACY_PERSONA_MIGRATION.find((row) => row.legacyKey === dbKey);
  return migration?.canonicalKey ?? null;
}

export function selectableDbKeyForCanonical(canonicalKey: CanonicalPersonaKey): string {
  const row = PERSONA_LIBRARY.find((p) => p.canonicalKey === canonicalKey);
  if (!row) throw new Error(`Unknown canonical persona ${canonicalKey}`);
  return row.dbKey;
}
