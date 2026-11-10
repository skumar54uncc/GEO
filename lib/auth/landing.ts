import type { Role } from "@/lib/auth/roles";

export type AdminHomePreference = "overview" | "visibility";

export const ADMIN_HOME_COOKIE = "scout_admin_home";

/** Default post-login path by role. Admins may prefer Visibility via cookie/local preference. */
export function defaultLandingPath(
  role: Role,
  opts: { adminHome?: AdminHomePreference | null; campaignId?: string | null } = {},
): string {
  if (role === "viewer") return "/";
  if (role === "editor") {
    return opts.campaignId ? `/campaigns/${opts.campaignId}/dashboard` : "/campaigns";
  }
  // admin
  const home = opts.adminHome === "visibility" ? "visibility" : "overview";
  if (home === "visibility") {
    return opts.campaignId ? `/campaigns/${opts.campaignId}/dashboard` : "/campaigns";
  }
  return "/";
}
