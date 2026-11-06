/** Content-team library personas. Prefixes are drafts until the content team approves them. */
export const CONTENT_TEAM_PERSONAS = [
  {
    key: "undergrad",
    name: "Undergraduate prospect",
    goal: "Choose a college for undergraduate study",
    draftPrefix: "I'm a high school senior choosing a college.",
  },
  {
    key: "grad",
    name: "Graduate prospect",
    goal: "Find a graduate program",
    draftPrefix: "I'm looking for a graduate program.",
  },
  {
    key: "business_partner",
    name: "Business partner",
    goal: "Partner with a university",
    draftPrefix: "I run a company that wants to partner with a university.",
  },
  {
    key: "research_partner",
    name: "Research partner",
    goal: "Find a university research partner",
    draftPrefix: "I lead a research team looking for a university research partner.",
  },
  {
    key: "business_leader",
    name: "Business leader (hiring interns)",
    goal: "Hire interns from a university",
    draftPrefix: "I'm a business leader who hires interns.",
  },
] as const;

export type ContentTeamPersonaKey = (typeof CONTENT_TEAM_PERSONAS)[number]["key"];

export const CONTENT_TEAM_CAMPAIGNS = [
  { name: "AI", topic: "Artificial intelligence", pillar: "AI" },
  { name: "Energy", topic: "Energy research and programs", pillar: "Energy" },
  { name: "Internships", topic: "Internships and career outcomes", pillar: "Internships" },
] as const;

export const IMPORT_TAG = "import:content_team_v1";
export const PERSONA_MODE_PREFIX = "prefix";

export const NEAR_DUPLICATE_QIDS = new Set(["AI06a", "AI06b", "EN03", "EN04", "IN01a", "IN01b"]);
