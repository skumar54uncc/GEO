export type TrendTerm = {
  term: string;
  subtopic: string;
};

export const TREND_TERMS: TrendTerm[] = [
  { term: "grid modernization", subtopic: "grid_technology" },
  { term: "energy workforce", subtopic: "workforce" },
  { term: "nuclear energy jobs", subtopic: "nuclear" },
  { term: "hydrogen hub", subtopic: "hydrogen" },
  { term: "battery storage", subtopic: "energy_storage" },
];

export const TREND_GEOS: Array<{ geo: string; label: string }> = [
  { geo: "US", label: "United States" },
  { geo: "US-NC", label: "North Carolina" },
  { geo: "US-SC", label: "South Carolina" },
];

export const AUTOCOMPLETE_SEEDS = [
  "NSF Engines",
  "grid modernization",
  "electric grid data centers",
  "energy jobs North Carolina",
  "Duke Energy university",
  "Carolinas grid",
  "power systems degree",
  "energy engineering",
];

export const FLAGSHIP_TERMS = ["electric grid", "data center electricity"];

export const TRENDS_DATE_RANGE = "today 12-m";
