import type { AppConfig } from "@/lib/types";
import { FACT_BANK } from "./facts";

export const SEED_CONFIG: AppConfig = {
  aliases: [
    "UNC Charlotte",
    "University of North Carolina at Charlotte",
    "UNCC",
    "UNC-Charlotte",
    "UNC Charlotte 49ers",
    "EPIC",
    "Energy Production and Infrastructure Center",
    "William States Lee College of Engineering",
    "Lee College of Engineering",
    "W.S. Lee College of Engineering",
  ],
  competitors: [
    {
      name: "NC State",
      aliases: ["NC State", "North Carolina State University", "NCSU", "NC State University"],
      domains: ["ncsu.edu"],
    },
    {
      name: "Duke",
      aliases: ["Duke University", "Duke"],
      domains: ["duke.edu"],
    },
    {
      name: "Clemson",
      aliases: ["Clemson University", "Clemson"],
      domains: ["clemson.edu"],
    },
    {
      name: "Georgia Tech",
      aliases: ["Georgia Tech", "Georgia Institute of Technology"],
      domains: ["gatech.edu"],
    },
    {
      name: "Virginia Tech",
      aliases: ["Virginia Tech", "Virginia Polytechnic Institute"],
      domains: ["vt.edu"],
    },
    {
      name: "University of Tennessee",
      aliases: ["University of Tennessee", "UT Knoxville", "UTK"],
      domains: ["utk.edu"],
    },
    {
      name: "University of South Carolina",
      aliases: ["University of South Carolina"],
      domains: ["sc.edu"],
    },
    {
      name: "Appalachian State",
      aliases: ["Appalachian State", "App State"],
      domains: ["appstate.edu"],
    },
    {
      name: "UNC Chapel Hill",
      aliases: ["UNC Chapel Hill", "UNC-Chapel Hill", "University of North Carolina at Chapel Hill"],
      domains: ["unc.edu"],
    },
  ],
  subtopics: [
    { id: "grid_technology", label: "Grid technology" },
    { id: "nuclear", label: "Nuclear" },
    { id: "hydrogen", label: "Hydrogen" },
    { id: "renewables", label: "Renewables" },
    { id: "energy_storage", label: "Energy storage" },
    { id: "workforce", label: "Workforce" },
    { id: "research_partnerships", label: "Research partnerships" },
    { id: "policy_regulation", label: "Policy and regulation" },
    { id: "cybersecurity", label: "Cybersecurity" },
    { id: "industry_engagement", label: "Industry engagement" },
  ],
  assets: [
    {
      name: "EPIC",
      description: "Energy Production and Infrastructure Center — industry-facing energy research home",
    },
    {
      name: "William States Lee College of Engineering",
      description: "Home college for energy and power engineering programs",
    },
    {
      name: "NSF Engine",
      description: "NSF Regional Innovation Engine / Carolinas energy transition award — lead with award size",
    },
    {
      name: "R1 status",
      description: "Carnegie R1 very high research activity classification",
    },
    {
      name: "Duke Energy partnership",
      description: "Utility and industry membership through EPIC",
    },
    {
      name: "Grid modernization testbed",
      description: "Power systems / grid hardware and simulation capabilities",
    },
    {
      name: "Battery and energy storage research",
      description: "Storage, power electronics, and grid-scale battery work",
    },
    {
      name: "Nuclear thermal-hydraulics",
      description: "Nuclear engineering research capacity",
    },
    {
      name: "Hydrogen and clean fuels",
      description: "Hydrogen production, storage, and industrial decarbonization",
    },
    {
      name: "Energy cybersecurity",
      description: "Critical-infrastructure and electric-sector cybersecurity",
    },
  ],
  facts: FACT_BANK,
  target_domains: ["charlotte.edu"],
  serpapi_starting_balance: 1000,
  serpapi_credits_remaining: 1000,
  serpapi_per_run_cap: 40,
  last_location_note: "Charlotte NC, incognito",
};

export const TARGET_REGISTRABLE_DOMAIN = "charlotte.edu";
