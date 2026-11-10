/**
 * Allow only same-origin paths and http(s) URLs for href attributes.
 * Rejects javascript:, data:, vbscript:, and protocol-relative //evil.
 */
export function safeHref(href: string | null | undefined): string | null {
  if (href == null) return null;
  const t = String(href).trim();
  if (!t) return null;
  if (t.startsWith("/") && !t.startsWith("//")) return t;
  try {
    const u = new URL(t);
    if (u.protocol === "http:" || u.protocol === "https:") return t;
  } catch {
    return null;
  }
  return null;
}
