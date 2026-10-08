export type FactRecord = {
  id: string;
  text: string;
  source_url: string;
  source_label: string;
  subtopics: string[];
  names: string[];
  needs_confirmation: boolean;
};

export const FACT_BANK: FactRecord[] = [
  {
    id: "r1-2025",
    text: "UNC Charlotte received Carnegie R1 status (very high research activity) on February 13, 2025, joining UNC-Chapel Hill, NC State, and Duke as the only R1 universities in North Carolina. FY2023 research expenditures were $92 million.",
    source_url: "https://inside.charlotte.edu/2025/02/13/unc-charlotte-awarded-r1-carnegie-classification-the-highest-recognition-for-research-universities/",
    source_label: "Inside UNC Charlotte, Feb. 13, 2025",
    subtopics: ["research_partnerships", "workforce"],
    names: ["UNC Charlotte", "R1 status"],
    needs_confirmation: false,
  },
  {
    id: "nsf-engine-15-160",
    text: "UNC Charlotte leads the NSF Grid Modernization Engine in the Carolinas, one of 12 NSF Engines selected from nearly 300 teams. The award is an initial $15 million over two years, with the potential for up to $160 million over the next decade. More than 100 partners span a 36-county region of North and South Carolina.",
    source_url: "https://inside.charlotte.edu/featured-stories/carolinas-nsf-innovation-engine/",
    source_label: "Inside UNC Charlotte, Carolinas NSF Innovation Engine",
    subtopics: ["grid_technology", "research_partnerships", "industry_engagement", "policy_regulation"],
    names: ["NSF Engine", "EPIC", "UNC Charlotte", "William States Lee College of Engineering", "Carolinas Grid Engine"],
    needs_confirmation: false,
  },
  {
    id: "demand-ai-datacenters",
    text: "The Carolinas Grid Engine is meant to accelerate grid technologies that improve reliability and help the United States meet rapidly growing electricity demand driven by artificial intelligence, advanced manufacturing, data centers, and population growth.",
    source_url: "https://inside.charlotte.edu/featured-stories/carolinas-nsf-innovation-engine/",
    source_label: "Inside UNC Charlotte, Carolinas NSF Innovation Engine",
    subtopics: ["grid_technology", "policy_regulation", "industry_engagement"],
    names: ["NSF Engine", "EPIC", "UNC Charlotte"],
    needs_confirmation: false,
  },
  {
    id: "charlotte-gateway",
    text: "Chancellor Sharon L. Gaber: few regions are better positioned to lead grid-technology deployment than Charlotte, where connections across North and South Carolina create a natural gateway for collaboration. Duke Energy, Dominion Energy, Santee Cooper, Clemson, and both state commerce departments are in the coalition.",
    source_url: "https://inside.charlotte.edu/featured-stories/carolinas-nsf-innovation-engine/",
    source_label: "Inside UNC Charlotte, Carolinas NSF Innovation Engine",
    subtopics: ["industry_engagement", "grid_technology", "research_partnerships"],
    names: ["UNC Charlotte", "EPIC", "Duke Energy partnership", "NSF Engine"],
    needs_confirmation: false,
  },
  {
    id: "epic-2008",
    text: "The Energy Production and Infrastructure Center (EPIC) opened in 2008 at the William States Lee College of Engineering to work with industry on energy production, transmission, and distribution, and to train power engineers.",
    source_url: "https://inside.charlotte.edu/2026/07/14/a-history-of-leadership-in-energy-and-electrical-grid-innovation/",
    source_label: "Inside UNC Charlotte, EPIC history",
    subtopics: ["grid_technology", "workforce", "industry_engagement"],
    names: ["EPIC", "William States Lee College of Engineering"],
    needs_confirmation: false,
  },
  {
    id: "engine-partners",
    text: "The Carolinas Grid Engine coalition includes Duke Energy, Dominion Energy, Santee Cooper, EPRI, Siemens Energy, Honeywell, Clemson University, and the North Carolina and South Carolina Departments of Commerce, among others. Principal investigator is John Daniels; EPIC executive director Robert Cox is a co-PI.",
    source_url: "https://inside.charlotte.edu/featured-stories/carolinas-nsf-innovation-engine/",
    source_label: "Inside UNC Charlotte, Carolinas NSF Innovation Engine",
    subtopics: ["industry_engagement", "grid_technology", "research_partnerships"],
    names: ["Duke Energy partnership", "EPIC", "NSF Engine"],
    needs_confirmation: false,
  },
];
