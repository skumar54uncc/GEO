export const ENERGY_PHRASE_KEEP =
  /\b(grid|energy|electric|electricity|nuclear|hydrogen|battery|storage|nsf|engine|utility|power|workforce|engineering|data.?center|transmission|resilien|moderniz|carolinas|charlotte|duke energy|epic|supply chain|interconnect|transformer|volt|watt|renewable|solar|wind|hydrogen hub|oklo|constellation)\b/i;

export const ENERGY_PHRASE_DROP =
  /\b(walmart|iphone|samsung|casio|apple|openai|new york times|ping\b|near me|men'?s watch|galaxy|pro max|laptop|public storage|car battery|storage box|storage case|texas workforce)\b/i;

export function isCampaignPhrase(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (ENERGY_PHRASE_DROP.test(t)) return false;
  return ENERGY_PHRASE_KEEP.test(t);
}

export const CAMPAIGN = {
  name: "Carolinas Grid Engine · energy content year",
  source_url: "https://inside.charlotte.edu/featured-stories/carolinas-nsf-innovation-engine/",
  source_label: "UNC Charlotte NSF Grid Modernization Engine announcement",
  one_sentence:
    "UNC Charlotte leads the NSF Grid Modernization Engine in the Carolinas: an initial $15 million over two years, up to $160 million over a decade, 100+ partners, 36 counties, one of 12 engines chosen from nearly 300 teams.",
  why_now:
    "Electricity demand is rising because of AI, data centers, advanced manufacturing, and population growth. The engine’s job is to move grid technology from lab to deployment fast enough to meet that demand.",
  names: [
    "UNC Charlotte",
    "EPIC",
    "William States Lee College of Engineering",
    "Carolinas Grid Engine",
    "NSF Grid Modernization Engine in the Carolinas",
    "John Daniels",
    "Robert Cox",
    "Duke Energy",
    "Clemson University",
  ],
  quotes_to_reuse: [
    {
      speaker: "John Daniels, Vice Chancellor for Research and PI",
      text: "The challenge is not simply developing new technologies. It is moving them from research to testing, commercialization and adoption quickly enough to meet rising demand.",
    },
    {
      speaker: "Chancellor Sharon L. Gaber",
      text: "Few regions are better positioned to lead that work than Charlotte, where connections across North and South Carolina create a natural gateway for collaboration and innovation.",
    },
  ],
};

export type CampaignPiece = {
  id: string;
  title: string;
  h1: string;
  why: string;
  lead_fact_id: string;
  audience: string;
  matches_subtopics: string[];
  earned_media: string;
};

export const YEAR_SLATE: CampaignPiece[] = [
  {
    id: "who-leads-southeast",
    title: "Who leads energy / grid research in the Southeast",
    h1: "Which universities lead energy research and grid modernization in the Southeast?",
    why: "Measured miss: charlotte.edu is not in Google’s top 10 and UNC Charlotte is absent from the AI Overview. This is the ranking problem. The NSF Engine is the fact that should change the answer.",
    lead_fact_id: "nsf-engine-15-160",
    audience: "Higher-ed leadership / press / AI answers",
    matches_subtopics: ["research_partnerships", "grid_technology"],
    earned_media: "Place the $15M / $160M line in a Business Journal and NSF-facing release, not only on .edu.",
  },
  {
    id: "duke-energy-partners",
    title: "University partners for Duke Energy and utilities",
    h1: "Which universities partner with Duke Energy on grid workforce and R&D?",
    why: "Measured miss: AI already names UNC Charlotte, but charlotte.edu does not rank. Citation problem. The announcement already lists Duke Energy as a coalition member — that sentence must live on a crawlable Q&A page.",
    lead_fact_id: "engine-partners",
    audience: "Industry / utilities",
    matches_subtopics: ["industry_engagement", "workforce"],
    earned_media: "Ask Duke Energy, E4 Carolinas, or Joules to quote the same partnership sentence.",
  },
  {
    id: "ai-data-centers",
    title: "Why electricity demand is jumping (AI and data centers)",
    h1: "Why is U.S. electricity demand rising because of AI and data centers, and who in the Carolinas is working on the grid?",
    why: "The NSF announcement names the demand driver. Searchers and AI engines are already asking about data-center power. UNC Charlotte should own the Carolinas answer.",
    lead_fact_id: "demand-ai-datacenters",
    audience: "Policy / industry / public",
    matches_subtopics: ["grid_technology", "policy_regulation"],
    earned_media: "Op-ed or utility byline: Cox or Daniels on data-center load and grid reliability.",
  },
  {
    id: "workforce-pathways",
    title: "Energy workforce pathways in the Carolinas",
    h1: "Where can students and workers train for grid modernization jobs in North and South Carolina?",
    why: "The engine’s stated work includes workforce pathways. York Technical College and Lee College should appear in the same answer as EPIC.",
    lead_fact_id: "epic-2008",
    audience: "Undergraduate / workforce / government",
    matches_subtopics: ["workforce", "grid_technology"],
    earned_media: "Joint piece with York Tech / community colleges in the 36-county region.",
  },
  {
    id: "lab-to-deployment",
    title: "From lab to deployment",
    h1: "How do new grid technologies move from university labs into the electric grid?",
    why: "Daniels’ line is the differentiator versus ‘we do research.’ AI overviews reward process answers with named institutions.",
    lead_fact_id: "nsf-engine-15-160",
    audience: "Industry / federal / HEL",
    matches_subtopics: ["research_partnerships", "industry_engagement"],
    earned_media: "Q&A with Robert Cox (already exists on the announcement — syndicate it).",
  },
  {
    id: "charlotte-gateway",
    title: "Why Charlotte / the Carolinas",
    h1: "Why is Charlotte a national hub for electric grid innovation?",
    why: "Gaber’s quote plus Duke Energy HQ plus the 36-county engine. Stops AI from treating ‘Charlotte’ as only the city.",
    lead_fact_id: "charlotte-gateway",
    audience: "All",
    matches_subtopics: ["industry_engagement", "grid_technology"],
    earned_media: "Governor Stein / McMaster quotes already exist — get them onto third-party pages.",
  },
];
