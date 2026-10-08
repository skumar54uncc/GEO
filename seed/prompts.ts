import type { Audience } from "@/lib/types";

export type SeedPrompt = {
  text: string;
  audience: Audience;
  subtopics: string[];
};

export const SEED_PROMPTS: SeedPrompt[] = [
  {
    text: "What are the best undergraduate energy engineering programs in the Southeast United States?",
    audience: "undergrad",
    subtopics: ["workforce", "renewables", "grid_technology"],
  },
  {
    text: "Where should I study power systems and electric grid engineering as an undergraduate in North Carolina?",
    audience: "undergrad",
    subtopics: ["grid_technology", "workforce"],
  },
  {
    text: "Which universities in the Carolinas have the strongest undergraduate renewable energy programs?",
    audience: "undergrad",
    subtopics: ["renewables", "workforce"],
  },
  {
    text: "What are the best colleges near Charlotte for internships in the energy industry?",
    audience: "undergrad",
    subtopics: ["industry_engagement", "workforce"],
  },
  {
    text: "Which undergraduate programs in the Southeast prepare students for nuclear energy careers?",
    audience: "undergrad",
    subtopics: ["nuclear", "workforce"],
  },
  {
    text: "Where can undergraduates in the South study battery energy storage and electric vehicles?",
    audience: "undergrad",
    subtopics: ["energy_storage", "workforce"],
  },
  {
    text: "Which universities offer undergraduate research in smart grid and grid modernization?",
    audience: "undergrad",
    subtopics: ["grid_technology", "research_partnerships"],
  },
  {
    text: "What are the best schools in North Carolina for a bachelor's in mechanical or electrical engineering with an energy focus?",
    audience: "undergrad",
    subtopics: ["workforce", "grid_technology"],
  },
  {
    text: "Which universities have undergraduate programs in energy cybersecurity or critical infrastructure protection?",
    audience: "undergrad",
    subtopics: ["cybersecurity", "workforce"],
  },
  {
    text: "How should a high school student choose among North Carolina universities for a clean-energy undergraduate degree?",
    audience: "undergrad",
    subtopics: ["workforce", "renewables"],
  },
  {
    text: "What are the top graduate programs for grid modernization and power systems in the Southeast?",
    audience: "grad",
    subtopics: ["grid_technology", "research_partnerships"],
  },
  {
    text: "Which universities in the South have the strongest PhD programs in power electronics and electric machines?",
    audience: "grad",
    subtopics: ["grid_technology", "energy_storage"],
  },
  {
    text: "Where can I earn a master's in energy systems or sustainable energy in North Carolina?",
    audience: "grad",
    subtopics: ["renewables", "workforce"],
  },
  {
    text: "What graduate research opportunities exist in hydrogen and clean fuels at Southeastern universities?",
    audience: "grad",
    subtopics: ["hydrogen", "research_partnerships"],
  },
  {
    text: "Where should I pursue a PhD in nuclear engineering or nuclear thermal hydraulics in the Southeast?",
    audience: "grad",
    subtopics: ["nuclear", "research_partnerships"],
  },
  {
    text: "Which graduate labs lead battery storage and grid-scale energy storage research in the South?",
    audience: "grad",
    subtopics: ["energy_storage", "grid_technology"],
  },
  {
    text: "Which R1 universities in the Carolinas have strong energy research groups for graduate students?",
    audience: "grad",
    subtopics: ["research_partnerships", "workforce"],
  },
  {
    text: "What master's programs partner with utilities for grid operations and power delivery training?",
    audience: "grad",
    subtopics: ["grid_technology", "industry_engagement"],
  },
  {
    text: "Which universities offer PhD work in energy policy and electricity markets in the Southeast?",
    audience: "grad",
    subtopics: ["policy_regulation", "research_partnerships"],
  },
  {
    text: "What graduate cybersecurity programs focus on energy and other critical infrastructure?",
    audience: "grad",
    subtopics: ["cybersecurity", "grid_technology"],
  },
  {
    text: "Which universities are the best industry partners for utility grid research in the Carolinas?",
    audience: "industry",
    subtopics: ["grid_technology", "industry_engagement"],
  },
  {
    text: "What university labs in the Southeast work with manufacturers on hydrogen technology?",
    audience: "industry",
    subtopics: ["hydrogen", "industry_engagement"],
  },
  {
    text: "Which university research centers lead power delivery and transmission research in the South?",
    audience: "industry",
    subtopics: ["grid_technology", "research_partnerships"],
  },
  {
    text: "Which universities partner with Duke Energy or other utilities on workforce development and R&D?",
    audience: "industry",
    subtopics: ["industry_engagement", "workforce"],
  },
  {
    text: "Where can an energy company find university partners for battery storage demonstration projects?",
    audience: "industry",
    subtopics: ["energy_storage", "industry_engagement"],
  },
  {
    text: "Which university testbeds support grid modernization and microgrid demonstrations in North Carolina?",
    audience: "industry",
    subtopics: ["grid_technology", "research_partnerships"],
  },
  {
    text: "What are the best academic partners for nuclear workforce development in the Southeast?",
    audience: "industry",
    subtopics: ["nuclear", "workforce"],
  },
  {
    text: "Which university energy centers have strong industry membership programs?",
    audience: "industry",
    subtopics: ["industry_engagement", "research_partnerships"],
  },
  {
    text: "Which universities conduct cybersecurity research for the electric sector?",
    audience: "industry",
    subtopics: ["cybersecurity", "grid_technology"],
  },
  {
    text: "Who are the leading university partners for renewable integration and interconnection studies?",
    audience: "industry",
    subtopics: ["renewables", "grid_technology"],
  },
  {
    text: "Which universities lead energy research in the Southeast United States?",
    audience: "hel",
    subtopics: ["research_partnerships", "grid_technology"],
  },
  {
    text: "What R1 universities have dedicated energy research centers with national-lab or utility partnerships?",
    audience: "hel",
    subtopics: ["research_partnerships", "industry_engagement"],
  },
  {
    text: "Which universities received NSF Engine or similar regional energy innovation awards?",
    audience: "hel",
    subtopics: ["research_partnerships", "policy_regulation"],
  },
  {
    text: "How do Southeastern universities compare on energy research expenditures and industry funding?",
    audience: "hel",
    subtopics: ["research_partnerships", "industry_engagement"],
  },
  {
    text: "Which universities are emerging challengers to NC State and Georgia Tech in energy research?",
    audience: "hel",
    subtopics: ["research_partnerships", "grid_technology"],
  },
  {
    text: "What universities have Carnegie R1 status and a distinct energy research identity?",
    audience: "hel",
    subtopics: ["research_partnerships", "workforce"],
  },
  {
    text: "Which university energy centers combine engineering, policy, and industry engagement?",
    audience: "hel",
    subtopics: ["policy_regulation", "industry_engagement"],
  },
  {
    text: "Which research campuses sit in major energy-industry metros in the Southeast?",
    audience: "hel",
    subtopics: ["industry_engagement", "workforce"],
  },
  {
    text: "Which universities host major energy conferences or industry consortia in the Southeast?",
    audience: "hel",
    subtopics: ["industry_engagement", "research_partnerships"],
  },
  {
    text: "What distinguishes the leading energy colleges of engineering in the South?",
    audience: "hel",
    subtopics: ["workforce", "research_partnerships"],
  },
  {
    text: "Which universities should North Carolina partner with for statewide energy workforce development?",
    audience: "government",
    subtopics: ["workforce", "policy_regulation"],
  },
  {
    text: "Which academic institutions support electric grid resilience and disaster recovery in the Carolinas?",
    audience: "government",
    subtopics: ["grid_technology", "policy_regulation"],
  },
  {
    text: "What university nuclear research capabilities are relevant to state energy policy in the Southeast?",
    audience: "government",
    subtopics: ["nuclear", "policy_regulation"],
  },
  {
    text: "Which universities can support hydrogen hub and clean-fuels policy in the Carolinas?",
    audience: "government",
    subtopics: ["hydrogen", "policy_regulation"],
  },
  {
    text: "Which university partners can a state energy office use for grid modernization technical assistance?",
    audience: "government",
    subtopics: ["grid_technology", "policy_regulation"],
  },
  {
    text: "Which universities conduct energy equity and community solar research in the South?",
    audience: "government",
    subtopics: ["renewables", "policy_regulation"],
  },
  {
    text: "Who are the academic experts on electricity markets and utility regulation in North Carolina?",
    audience: "government",
    subtopics: ["policy_regulation", "grid_technology"],
  },
  {
    text: "Which research universities support federal energy grant applications from the Carolinas?",
    audience: "government",
    subtopics: ["research_partnerships", "policy_regulation"],
  },
  {
    text: "What university capabilities in energy cybersecurity should inform state homeland-security planning?",
    audience: "government",
    subtopics: ["cybersecurity", "policy_regulation"],
  },
  {
    text: "Where can policymakers find university analysis of energy storage deployment in the Southeast?",
    audience: "government",
    subtopics: ["energy_storage", "policy_regulation"],
  },
];
