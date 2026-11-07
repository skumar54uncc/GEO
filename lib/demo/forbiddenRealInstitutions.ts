/**
 * Real IPEDS-style institution names that must never appear as demo competitors
 * with invented metrics. Expand when adding regional peers.
 */
export const FORBIDDEN_REAL_INSTITUTION_NAMES = [
  "NC State University",
  "North Carolina State University",
  "University of North Carolina at Chapel Hill",
  "UNC Chapel Hill",
  "Duke University",
  "Clemson University",
  "Virginia Tech",
  "Virginia Polytechnic Institute and State University",
  "University of North Carolina at Charlotte",
  "UNC Charlotte",
  "Wake Forest University",
  "East Carolina University",
  "Appalachian State University",
  "University of South Carolina",
  "Clemson",
  "NC State",
] as const;

export function isForbiddenRealInstitutionName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return FORBIDDEN_REAL_INSTITUTION_NAMES.some((f) => f.toLowerCase() === n);
}
