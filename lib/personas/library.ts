import {
  CANONICAL_PERSONA_KEYS,
  LEGACY_PERSONA_MIGRATION,
  MENU_PERSONA_KEYS,
  PERSONA_GROUP_KEYS,
  type CanonicalPersonaKey,
  type PersonaGroupKey,
} from "@/lib/contracts/personas";
import { CONTENT_TEAM_PERSONAS, type ContentTeamPersonaKey } from "@/lib/contentTeam/personas";

export type PersonaLibraryDefinition = {
  canonicalKey: CanonicalPersonaKey;
  group: PersonaGroupKey;
  /** Stable `personas.key` value. Content-team rows keep their legacy keys. */
  dbKey: string;
  name: string;
  goal: string;
  background: string;
  vocabulary: string;
  region: string;
  typicalQuestions: string[];
  notes: string;
  /** Approved first-person opening. Must not contain brand aliases. */
  opening: string;
  /** When set, the content-team seed owns name/goal/draft_prefix unless we sync opening. */
  contentTeamKey?: ContentTeamPersonaKey;
  /** Menu personas are the campaign picker; general retained rows stay for imports. */
  kind: "menu" | "general" | "alias";
  selectable: boolean;
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
 * Persona library: 7 groups, 20 menu personas, plus retained general undergrad/grad
 * and a non-selectable business_leader alias of business_partner.
 */
export const PERSONA_LIBRARY: PersonaLibraryDefinition[] = [
  {
    canonicalKey: "undergrad",
    group: "prospective_students",
    dbKey: "undergrad",
    name: "Undergraduate prospect (general)",
    goal: contentTeamMeta("undergrad").goal,
    background: "High school senior or recent graduate comparing undergraduate options (general voice for imported prompts).",
    vocabulary: "plain",
    region: "United States",
    typicalQuestions: [
      "Which universities are strong for my intended major?",
      "How do I compare cost of attendance and aid?",
      "What is campus life like for first-year students?",
    ],
    notes: "Retained general persona inside Prospective students. Existing ID preserved.",
    opening: contentTeamMeta("undergrad").draftPrefix,
    contentTeamKey: "undergrad",
    kind: "general",
    selectable: true,
  },
  {
    canonicalKey: "first_year_in_state",
    group: "prospective_students",
    dbKey: "first_year_in_state",
    name: "First year, in state",
    goal: "Choose an in-state college with strong programs, affordable cost, and clear outcomes",
    background: "North Carolina high school senior comparing in-state undergraduate options.",
    vocabulary: "plain",
    region: "North Carolina",
    typicalQuestions: [
      "Which North Carolina universities are strongest for my major?",
      "How do in-state tuition and aid compare?",
      "What are graduation and job outcomes?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I'm a high school senior in North Carolina choosing a college.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "first_year_out_of_state",
    group: "prospective_students",
    dbKey: "first_year_out_of_state",
    name: "First year, out of state",
    goal: "Find a Southeast university with reputation, value, and location fit",
    background: "Out-of-state high school senior looking at colleges in the Southeast.",
    vocabulary: "plain",
    region: "United States",
    typicalQuestions: [
      "Which Southeast universities are worth out-of-state tuition?",
      "How does location and campus life compare?",
      "What is the reputation of this university in my field?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I'm a high school senior from out of state looking at colleges in the Southeast.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "transfer",
    group: "prospective_students",
    dbKey: "transfer",
    name: "Transfer",
    goal: "Find a university that accepts transfer credits and clear pathways",
    background: "Community college student planning to transfer to a four-year university.",
    vocabulary: "plain",
    region: "United States",
    typicalQuestions: [
      "Which universities accept the most transfer credits for my major?",
      "How long will it take to finish after transferring?",
      "What support exists for transfer students?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I'm a community college student planning to transfer to a four-year university.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "grad",
    group: "prospective_students",
    dbKey: "grad",
    name: "Graduate prospect (general)",
    goal: contentTeamMeta("grad").goal,
    background: "Bachelor's holder evaluating graduate programs (general voice for imported prompts).",
    vocabulary: "academic",
    region: "United States",
    typicalQuestions: [
      "Which graduate programs fit my interests?",
      "What funding or assistantships are typical?",
      "How competitive is admission?",
    ],
    notes: "Retained general persona inside Prospective students. Existing ID preserved.",
    opening: contentTeamMeta("grad").draftPrefix,
    contentTeamKey: "grad",
    kind: "general",
    selectable: true,
  },
  {
    canonicalKey: "masters_applicant",
    group: "prospective_students",
    dbKey: "masters_applicant",
    name: "Master's applicant",
    goal: "Find a master's program with strong program fit and career outcomes",
    background: "Applicant comparing master's programs for career advancement.",
    vocabulary: "academic",
    region: "United States",
    typicalQuestions: [
      "Which master's programs fit my background?",
      "What are typical career outcomes after this degree?",
      "How long does the program take for working students?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I'm looking for a master's program.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "doctoral_applicant",
    group: "prospective_students",
    dbKey: "doctoral_applicant",
    name: "Doctoral applicant",
    goal: "Find a PhD program with research strength and funding",
    background: "Applicant seeking doctoral training with funded research opportunities.",
    vocabulary: "academic",
    region: "United States",
    typicalQuestions: [
      "Which PhD programs have strong research funding in my field?",
      "Who are the leading faculty in this area?",
      "What is the typical time to degree and placement?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I'm looking for a PhD program with strong research funding.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "international",
    group: "prospective_students",
    dbKey: "international",
    name: "International",
    goal: "Choose a U.S. university with visa support, rankings, and manageable cost",
    background: "Applicant outside the U.S. comparing schools and visa logistics.",
    vocabulary: "plain",
    region: "International",
    typicalQuestions: [
      "Which universities support international students well in my field?",
      "What are typical English proficiency and transcript requirements?",
      "How do living costs and rankings compare?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I'm an international student looking at universities in the US.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "adult_learner",
    group: "prospective_students",
    dbKey: "adult_learner",
    name: "Adult learner",
    goal: "Find part-time or online programs that fit work and family",
    background: "Working professional returning for a flexible degree.",
    vocabulary: "plain",
    region: "United States",
    typicalQuestions: [
      "Which programs offer evening, online, or part-time options?",
      "Can prior work experience count toward a degree?",
      "What is a realistic time to completion for working students?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I'm a working professional looking for a part-time or online degree.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "military_veteran",
    group: "prospective_students",
    dbKey: "military_veteran",
    name: "Military / veteran",
    goal: "Use GI Bill benefits and find strong veteran services",
    background: "Veteran evaluating universities that support military benefits and services.",
    vocabulary: "plain",
    region: "United States",
    typicalQuestions: [
      "Which universities work well with GI Bill benefits?",
      "What veteran services and communities are available?",
      "How do military credits transfer?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I'm a veteran looking to use my GI Bill benefits.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "parent",
    group: "families_advisors",
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
    opening: "I'm a parent helping my child choose a college.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "school_counselor",
    group: "families_advisors",
    dbKey: "school_counselor",
    name: "School counselor",
    goal: "Advise different students on college fit",
    background: "High school counselor matching students to universities.",
    vocabulary: "plain",
    region: "United States",
    typicalQuestions: [
      "Which universities fit students with this profile?",
      "How do admissions and aid work for first-generation students?",
      "What support exists for students who need it?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I'm a high school counselor advising students on colleges.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "business_partner",
    group: "business_leaders_partners",
    dbKey: "business_partner",
    name: "Business leader / potential partner",
    goal: contentTeamMeta("business_partner").goal,
    background: "Business leader looking to hire talent or partner with a university on internships and R&D.",
    vocabulary: "business",
    region: "United States",
    typicalQuestions: [
      "Where should I recruit interns and graduates?",
      "Which universities are strong partners for industry collaboration?",
      "How do sponsored research or internship programs typically work?",
    ],
    notes:
      "One persona for business leaders and potential partners. Hiring vs partnering comes from the question and pillar. business_leader is a legacy alias.",
    opening: contentTeamMeta("business_partner").draftPrefix,
    contentTeamKey: "business_partner",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "business_partner",
    group: "business_leaders_partners",
    dbKey: "business_leader",
    name: "Business leader (legacy alias)",
    goal: contentTeamMeta("business_leader").goal,
    background: "Legacy content-team row. Same meaning as business_partner.",
    vocabulary: "business",
    region: "United States",
    typicalQuestions: [
      "Where should I recruit interns for my company?",
      "Which programs produce job-ready graduates?",
      "How do I hire graduates from this university?",
    ],
    notes: "Legacy alias of business_partner. ID preserved; not a separate selectable menu persona.",
    opening: contentTeamMeta("business_leader").draftPrefix,
    contentTeamKey: "business_leader",
    kind: "alias",
    selectable: false,
  },
  {
    canonicalKey: "research_partner",
    group: "research",
    dbKey: "research_partner",
    name: "Research partner",
    goal: contentTeamMeta("research_partner").goal,
    background: "Lab lead or PI seeking university collaboration, expertise, and labs.",
    vocabulary: "academic",
    region: "United States",
    typicalQuestions: [
      "Which faculty or centers work on this research topic?",
      "How do sponsored research agreements typically work?",
      "What facilities or shared labs are available?",
    ],
    notes: "Content-team key research_partner is unchanged.",
    opening: contentTeamMeta("research_partner").draftPrefix,
    contentTeamKey: "research_partner",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "funding_agency",
    group: "research",
    dbKey: "funding_agency",
    name: "Funding agency",
    goal: "Evaluate universities for research grants by track record and capacity",
    background: "Program officer comparing institutional research capacity.",
    vocabulary: "policy",
    region: "United States",
    typicalQuestions: [
      "Which universities have a strong track record in this research area?",
      "What is the institutional capacity for large grants?",
      "How do peer universities compare on outcomes?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I'm a program officer evaluating universities for research grants.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "state_policymaker",
    group: "government_policy",
    dbKey: "state_policymaker",
    name: "State policymaker",
    goal: "Understand NC workforce impact, state ROI, and in-state student outcomes",
    background: "Staffer for a North Carolina state legislator evaluating higher education.",
    vocabulary: "policy",
    region: "North Carolina",
    typicalQuestions: [
      "How does this university serve North Carolina workforce needs?",
      "What is the return on state investment?",
      "How do in-state student outcomes compare?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I work for a North Carolina state legislator.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "federal_policymaker",
    group: "government_policy",
    dbKey: "federal_policymaker",
    name: "Federal policymaker",
    goal: "Understand federal research funding and national priorities",
    background: "Congressional staffer evaluating universities on federal research and priorities.",
    vocabulary: "policy",
    region: "United States",
    typicalQuestions: [
      "How does this university contribute to national research priorities?",
      "What federal research funding does it attract?",
      "How do peer institutions compare?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I work for a member of Congress.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "local_economic_development",
    group: "government_policy",
    dbKey: "local_economic_development",
    name: "Local and economic development",
    goal: "Assess talent pipeline and regional economic impact",
    background: "Local economic development professional evaluating university regional impact.",
    vocabulary: "policy",
    region: "United States",
    typicalQuestions: [
      "How does this university feed the regional talent pipeline?",
      "What is the university's economic impact on the region?",
      "Which programs partner with local employers?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I work in local economic development.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "local_reporter",
    group: "media",
    dbKey: "local_reporter",
    name: "Local reporter",
    goal: "Find local experts and story angles",
    background: "Reporter covering news in North Carolina.",
    vocabulary: "journalistic",
    region: "North Carolina",
    typicalQuestions: [
      "Who are local experts on this topic at the university?",
      "What recent research or programs are newsworthy?",
      "How does this story affect North Carolina communities?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I'm a reporter covering news in North Carolina.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "trade_national_reporter",
    group: "media",
    dbKey: "trade_national_reporter",
    name: "Trade / national reporter",
    goal: "Find experts in AI, energy, and higher education",
    background: "Reporter covering higher education and technology nationally.",
    vocabulary: "journalistic",
    region: "United States",
    typicalQuestions: [
      "Who are go-to experts on AI or energy at this university?",
      "What public data or reports are available?",
      "How does this university compare with peers on this issue?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I'm a reporter covering higher education and technology.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "donor",
    group: "supporters",
    dbKey: "donor",
    name: "Donor",
    goal: "Identify high-impact programs to fund",
    background: "Philanthropist looking for a university program to support.",
    vocabulary: "plain",
    region: "United States",
    typicalQuestions: [
      "Where does philanthropic support make the biggest difference?",
      "How are scholarship funds stewarded?",
      "What naming or endowment options exist?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I'm a philanthropist looking for a university program to support.",
    kind: "menu",
    selectable: true,
  },
  {
    canonicalKey: "alumni",
    group: "supporters",
    dbKey: "alumni",
    name: "Alumni",
    goal: "Stay engaged, take pride in the university, and give back",
    background: "Alum looking to stay involved with a university.",
    vocabulary: "plain",
    region: "United States",
    typicalQuestions: [
      "How can alumni stay involved?",
      "What giving options exist for alumni?",
      "What recent achievements should alumni know about?",
    ],
    notes: "A persona changes how the prompt is written, not who is logged in.",
    opening: "I'm an alum looking to stay involved with a university.",
    kind: "menu",
    selectable: true,
  },
];

export const CONTENT_TEAM_PERSONA_KEYS = CONTENT_TEAM_PERSONAS.map((p) => p.key);

export function assertPersonaLibraryComplete(): void {
  const menu = PERSONA_LIBRARY.filter((p) => p.kind === "menu");
  const general = PERSONA_LIBRARY.filter((p) => p.kind === "general");
  const aliases = PERSONA_LIBRARY.filter((p) => p.kind === "alias");
  if (menu.length !== 20) throw new Error(`Expected 20 menu personas, got ${menu.length}`);
  if (general.length !== 2) throw new Error(`Expected 2 general personas, got ${general.length}`);
  if (aliases.length !== 1 || aliases[0]?.dbKey !== "business_leader") {
    throw new Error("Expected business_leader as the sole alias row");
  }
  if (new Set(MENU_PERSONA_KEYS).size !== 20) throw new Error("MENU_PERSONA_KEYS must be 20 unique keys");
  for (const key of MENU_PERSONA_KEYS) {
    if (!menu.some((p) => p.canonicalKey === key && p.dbKey === key)) {
      throw new Error(`Missing menu persona ${key}`);
    }
  }
  for (const key of CANONICAL_PERSONA_KEYS) {
    if (!PERSONA_LIBRARY.some((p) => p.canonicalKey === key && p.selectable)) {
      throw new Error(`Missing selectable canonical persona ${key}`);
    }
  }
  for (const group of PERSONA_GROUP_KEYS) {
    if (!PERSONA_LIBRARY.some((p) => p.group === group)) throw new Error(`Empty persona group ${group}`);
  }
  if (byLegacy.business_partner?.canonicalKey !== "business_partner") {
    throw new Error("business_partner must map to business_partner");
  }
  if (byLegacy.business_leader?.canonicalKey !== "business_partner") {
    throw new Error("business_leader must map to business_partner");
  }
  if (byLegacy.undergrad?.canonicalKey !== "undergrad") {
    throw new Error("undergrad must stay as general undergrad");
  }
  if (byLegacy.grad?.canonicalKey !== "grad") {
    throw new Error("grad must stay as general grad");
  }
}

export function canonicalKeyForDbKey(dbKey: string): CanonicalPersonaKey | null {
  const library = PERSONA_LIBRARY.find((p) => p.dbKey === dbKey);
  if (library) return library.canonicalKey;
  const migration = LEGACY_PERSONA_MIGRATION.find((row) => row.legacyKey === dbKey);
  return migration?.canonicalKey ?? null;
}

export function groupForDbKey(dbKey: string): PersonaGroupKey | null {
  return PERSONA_LIBRARY.find((p) => p.dbKey === dbKey)?.group ?? null;
}

export function selectableDbKeyForCanonical(canonicalKey: CanonicalPersonaKey): string {
  const row = PERSONA_LIBRARY.find((p) => p.canonicalKey === canonicalKey && p.selectable);
  if (!row) throw new Error(`Unknown canonical persona ${canonicalKey}`);
  return row.dbKey;
}

export function menuPersonaDefinitions(): PersonaLibraryDefinition[] {
  return PERSONA_LIBRARY.filter((p) => p.kind === "menu");
}
