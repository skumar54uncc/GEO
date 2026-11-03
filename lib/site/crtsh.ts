/** crt.sh JSON output: one row per certificate, `name_value` holds newline separated SAN names. */
export type CrtShRow = {
  issuer_ca_id?: number;
  issuer_name?: string;
  common_name?: string;
  name_value?: string;
  id?: number;
  not_before?: string;
  not_after?: string;
};

export function crtShUrl(rootDomain: string): string {
  return `https://crt.sh/?q=${encodeURIComponent(`%.${rootDomain}`)}&output=json&exclude=expired`;
}

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Hostnames under rootDomain named in the certificates. Wildcards become their base host. */
export function parseCrtSh(body: string | CrtShRow[], rootDomain: string): string[] {
  let rows: CrtShRow[];
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      rows = Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  } else {
    rows = body;
  }
  const root = rootDomain.toLowerCase().replace(/^\.+|\.+$/g, "");
  const hosts = new Set<string>();
  for (const row of rows) {
    const names = [row.common_name ?? "", ...(row.name_value ?? "").split(/\s+/)];
    for (const raw of names) {
      const name = raw.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
      if (!name || name.includes("*") || name.includes("@")) continue;
      if (name !== root && !name.endsWith(`.${root}`)) continue;
      if (!HOST_RE.test(name)) continue;
      hosts.add(name);
    }
  }
  return Array.from(hosts).sort();
}
