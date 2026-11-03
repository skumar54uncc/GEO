/**
 * robots.txt parsing and matching per RFC 9309: groups by user-agent, the most specific
 * matching group wins, longest matching rule wins, allow wins a tie, `*` and `$` patterns.
 */

export type RobotsRule = { allow: boolean; pattern: string; line: number };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[]; crawlDelay: number | null };
export type Robots = { groups: RobotsGroup[]; sitemaps: string[] };

export function parseRobots(text: string): Robots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  lines.forEach((rawLine, idx) => {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) return;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) return;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      return;
    }
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      return;
    }
    lastWasAgent = false;
    if (!current) return;
    if (key === "allow" || key === "disallow") {
      // An empty Disallow allows everything; it adds no rule.
      if (key === "disallow" && value === "") return;
      current.rules.push({ allow: key === "allow", pattern: value, line: idx + 1 });
    } else if (key === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  });
  return { groups, sitemaps };
}

/** Groups that apply to a product token: exact token groups, else the `*` groups. */
export function groupsFor(robots: Robots, token: string): RobotsGroup[] {
  const t = token.toLowerCase();
  const specific = robots.groups.filter((g) => g.agents.includes(t));
  if (specific.length) return specific;
  return robots.groups.filter((g) => g.agents.includes("*"));
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

function normalizePath(path: string): string {
  // Compare in percent-encoded form, as RFC 9309 section 2.2.2 requires.
  try {
    return encodeURI(decodeURI(path));
  } catch {
    return path;
  }
}

export type RobotsDecision = { allowed: boolean; rule: RobotsRule | null; matchedAgents: string[] };

export function decide(robots: Robots | null, token: string, pathWithQuery: string): RobotsDecision {
  if (!robots) return { allowed: true, rule: null, matchedAgents: [] };
  const groups = groupsFor(robots, token);
  const rules = groups.flatMap((g) => g.rules);
  const path = normalizePath(pathWithQuery || "/");
  if (path === "/robots.txt") return { allowed: true, rule: null, matchedAgents: groups.flatMap((g) => g.agents) };
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!patternToRegex(normalizePath(rule.pattern)).test(path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return { allowed: best ? best.allow : true, rule: best, matchedAgents: groups.flatMap((g) => g.agents) };
}

export function isAllowed(robots: Robots | null, token: string, url: string): boolean {
  const u = new URL(url);
  return decide(robots, token, u.pathname + u.search).allowed;
}

export function crawlDelayFor(robots: Robots | null, token: string): number | null {
  if (!robots) return null;
  const delays = groupsFor(robots, token)
    .map((g) => g.crawlDelay)
    .filter((d): d is number => d !== null);
  return delays.length ? Math.max(...delays) : null;
}

/** Disallow rules that apply to a token, for evidence in audit findings. */
export function disallowsFor(robots: Robots, token: string): RobotsRule[] {
  return groupsFor(robots, token).flatMap((g) => g.rules.filter((r) => !r.allow));
}
