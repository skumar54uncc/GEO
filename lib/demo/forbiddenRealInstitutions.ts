/**
 * Real IPEDS-style institution names and .edu hosts that must never appear as demo
 * competitors or demo cited_pages with invented metrics.
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

/** Known production .edu hosts for the forbid-list schools (and common aliases). */
export const FORBIDDEN_REAL_EDU_DOMAINS = [
  "ncsu.edu",
  "unc.edu",
  "duke.edu",
  "clemson.edu",
  "vt.edu",
  "charlotte.edu",
  "uncc.edu",
  "wfu.edu",
  "ecu.edu",
  "appstate.edu",
  "sc.edu",
] as const;

export function isForbiddenRealInstitutionName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return FORBIDDEN_REAL_INSTITUTION_NAMES.some((f) => f.toLowerCase() === n);
}

/** True when host is exactly a forbidden .edu or a subdomain of one. */
export function isForbiddenRealEduDomain(hostOrUrl: string): boolean {
  let host = hostOrUrl.trim().toLowerCase();
  try {
    if (host.includes("://")) host = new URL(host).hostname;
  } catch {
    /* keep raw */
  }
  host = host.replace(/\.$/, "");
  return FORBIDDEN_REAL_EDU_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}
