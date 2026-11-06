const TRACKING_PARAM = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref(?:_.+)?|vero_id)$/i;

/** Stable fetch key for a cited HTTP(S) URL. It never performs network I/O. */
export function canonicalizeCitationUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;

  url.hash = "";
  for (const key of Array.from(url.searchParams.keys())) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}
