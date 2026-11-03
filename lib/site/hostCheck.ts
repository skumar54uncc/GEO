const LOGIN_LABEL = /^(login|logon|signin|sso|cas|auth|idp|shib|shibboleth|adfs|okta|webauth|weblogin|passport|portal|my)(\d+)?$/;
const LOGIN_PATH = /(\/login|\/logon|\/signin|\/sign-in|\/cas\/|\/idp\/|\/saml|\/oauth2?\/|\/adfs\/|shibboleth|\/sso\b|\/auth\/realms\/)/i;
const NONPROD_LABEL = /^(dev|devel|test|tst|stage|staging|stg|qa|uat|sandbox|preprod|pre-prod|demo|beta)\d*$/;

export function hostLabels(host: string, rootDomain: string): string[] {
  const sub = host === rootDomain ? "" : host.slice(0, -(rootDomain.length + 1));
  return sub ? sub.split(".") : [];
}

/** Hostnames that look like dev, test or staging servers. */
export function looksNonProduction(host: string, rootDomain: string): boolean {
  return hostLabels(host, rootDomain).some(
    (l) => NONPROD_LABEL.test(l) || /-(dev|test|tst|stage|staging|stg|qa|uat)\d*$/.test(l) || /^(dev|test|stage|staging|qa)-/.test(l),
  );
}

export function loginPortalReason(host: string, rootDomain: string, finalUrl: string | null, html: string | null): string | null {
  const first = hostLabels(host, rootDomain)[0] ?? "";
  if (LOGIN_LABEL.test(first)) return `host name "${first}" is a sign-in portal pattern`;
  if (finalUrl) {
    try {
      const u = new URL(finalUrl);
      const finalFirst = u.hostname.split(".")[0];
      if (u.hostname !== host && LOGIN_LABEL.test(finalFirst)) return `root redirects to sign-in host ${u.hostname}`;
      if (LOGIN_PATH.test(u.pathname)) return `root redirects to sign-in path ${u.pathname}`;
    } catch {
      /* ignore malformed final URL */
    }
  }
  if (html && /<input[^>]+type\s*=\s*["']?password/i.test(html)) return "root page has a password field";
  return null;
}

export type HostCheck = {
  resolves: boolean | null;
  rootStatus: number | null;
  rootFinalUrl: string | null;
  loginPortal: boolean;
  excludeReason: string | null;
};

/** Default include rule: resolves, root answers 2xx on the same host, not a portal, not dev or test. */
export function classifyHost(
  host: string,
  rootDomain: string,
  probe: { status: number | null; finalUrl: string | null; html: string | null; dnsError: boolean; blocked: string | null; error: string | null },
): HostCheck {
  const base = { rootStatus: probe.status, rootFinalUrl: probe.finalUrl };
  if (probe.dnsError) return { ...base, resolves: false, loginPortal: false, excludeReason: "does not resolve" };
  if (probe.blocked) return { ...base, resolves: true, loginPortal: false, excludeReason: `blocked by SSRF guard: ${probe.blocked}` };
  const login = loginPortalReason(host, rootDomain, probe.finalUrl, probe.html);
  if (login) return { ...base, resolves: true, loginPortal: true, excludeReason: `login portal: ${login}` };
  if (probe.status === null) return { ...base, resolves: true, loginPortal: false, excludeReason: `root request failed: ${probe.error ?? "no response"}` };
  if (probe.status >= 400) return { ...base, resolves: true, loginPortal: false, excludeReason: `root returns HTTP ${probe.status}` };
  if (probe.status >= 300) return { ...base, resolves: true, loginPortal: false, excludeReason: `root redirect not followed (HTTP ${probe.status})` };
  if (probe.finalUrl) {
    const finalHost = new URL(probe.finalUrl).hostname.toLowerCase();
    if (finalHost !== host) return { ...base, resolves: true, loginPortal: false, excludeReason: `redirects to ${finalHost}` };
  }
  if (looksNonProduction(host, rootDomain)) {
    return { ...base, resolves: true, loginPortal: false, excludeReason: "host name looks like a dev, test or staging server" };
  }
  return { ...base, resolves: true, loginPortal: false, excludeReason: null };
}
