import { redirect } from "next/navigation";

/** UX sitemap onboarding lives under Site Audit. */
export default function SitesNewRedirect() {
  redirect("/onboarding");
}
