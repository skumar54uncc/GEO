import { redirect } from "next/navigation";

/** UX sitemap uses Site Audit at /sites; existing wired screen is /audit. */
export default function SitesRedirect() {
  redirect("/audit");
}
