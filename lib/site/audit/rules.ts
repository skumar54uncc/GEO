import { CORE_AI_BOTS } from "../aiBots";
import { nodeTypes, schemaNodes, type FaqItem } from "../extract";
import { decide, groupsFor, parseRobots } from "../net/robots";

export const RULES_VERSION = "2026-11-03.1";

export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type EvidenceStrength = "strong" | "moderate" | "weak" | "speculative";

export type RuleDef = { id: string; title: string; why: string; evidence_strength: EvidenceStrength };

/**
 * `why` says what the rule checks and why it may matter for AI answers. Evidence strength is our
 * judgment of how well the link to AI visibility is supported, not a measured effect size.
 */
export const RULES: RuleDef[] = [
  {
    id: "ai_crawler_blocked",
    title: "AI crawler blocked in robots.txt",
    why: "robots.txt disallows this AI user agent for the whole host. Operators that honor robots.txt will not fetch these pages, so search and user-fetch bots cannot quote or cite them. Blocking a training-only bot is a policy choice, not a defect, and is reported as info.",
    evidence_strength: "strong",
  },
  {
    id: "ai_crawler_partially_blocked",
    title: "AI crawler blocked from some paths",
    why: "robots.txt has a group for this AI user agent that disallows some paths. Pages under those paths cannot be fetched by that bot.",
    evidence_strength: "moderate",
  },
  {
    id: "robots_txt_unavailable",
    title: "robots.txt missing or failing",
    why: "Under RFC 9309 a robots.txt that returns 5xx means crawlers should assume everything is disallowed. A 404 allows everything but gives crawlers no sitemap pointer.",
    evidence_strength: "moderate",
  },
  {
    id: "schema_collegeoruniversity_missing",
    title: "No CollegeOrUniversity schema on the host",
    why: "CollegeOrUniversity JSON-LD states the institution's official name, address, and profiles in machine readable form. Public evidence that schema changes AI answers is limited, so this is a low cost clarity fix rather than a proven lever.",
    evidence_strength: "weak",
  },
  {
    id: "schema_org_sameas_missing",
    title: "Organization schema without sameAs",
    why: "sameAs links tie the organization to its Wikipedia, Wikidata and social profiles, which helps systems resolve which entity the page describes.",
    evidence_strength: "weak",
  },
  {
    id: "schema_program_missing",
    title: "Program page without EducationalOccupationalProgram schema",
    why: "Program schema states the credential, length, cost and delivery mode explicitly. It is not known how much AI engines rely on it.",
    evidence_strength: "weak",
  },
  {
    id: "schema_course_missing",
    title: "Course page without Course schema",
    why: "Course schema marks the course code, title and provider explicitly. Its effect on AI answers is not established.",
    evidence_strength: "weak",
  },
  {
    id: "schema_event_missing",
    title: "Event page without Event schema",
    why: "Event schema gives dates and locations in a form machines read without guessing from layout.",
    evidence_strength: "weak",
  },
  {
    id: "schema_faqpage_missing",
    title: "FAQ content without FAQPage schema",
    why: "The page has question and answer blocks but no FAQPage markup. Google limited FAQ rich results in 2023, so the value is in explicit structure, not search features.",
    evidence_strength: "weak",
  },
  {
    id: "faq_absent",
    title: "Program or admissions page without FAQ blocks",
    why: "AI answers often respond to question shaped prompts. A page that answers common questions in plain question and answer form gives an engine a direct passage to quote. This is a hypothesis to test in Phase 7, not a measured effect.",
    evidence_strength: "weak",
  },
  {
    id: "content_stale",
    title: "Page not updated in over 24 months",
    why: "The newest sitemap lastmod or visible date is more than 24 months before the crawl. Stale facts (deadlines, tuition, rankings) are a risk when an engine quotes them.",
    evidence_strength: "weak",
  },
  {
    id: "freshness_unknown",
    title: "No last modified or visible date",
    why: "Neither the sitemap nor the page states when it was last updated, so neither people nor engines can judge freshness.",
    evidence_strength: "weak",
  },
  {
    id: "js_only_content",
    title: "Main content only appears after JavaScript",
    why: "The raw HTML holds less than half of the text a browser shows. Public analyses of AI crawler traffic report that several major AI crawlers fetch HTML without running JavaScript, so this text may be invisible to them.",
    evidence_strength: "moderate",
  },
  {
    id: "thin_page",
    title: "Thin page (under 250 words)",
    why: "Very short pages give engines little to quote or cite. Some short pages (forms, landing pages) are fine; review before acting.",
    evidence_strength: "weak",
  },
  {
    id: "duplicate_title",
    title: "Duplicate title",
    why: "Several pages on the host share this exact title, which makes it harder for search systems to tell them apart.",
    evidence_strength: "moderate",
  },
  {
    id: "duplicate_h1",
    title: "Duplicate H1",
    why: "Several pages on the host share this exact H1, a sign of template headings that do not describe the page.",
    evidence_strength: "weak",
  },
  {
    id: "meta_description_missing",
    title: "Missing meta description",
    why: "Without a meta description, search results and some AI surfaces fall back to an arbitrary snippet of the page.",
    evidence_strength: "weak",
  },
  {
    id: "canonical_broken",
    title: "Broken canonical",
    why: "The canonical URL is malformed, points to a page that errors in this crawl, or points to a host outside the site. Search systems may ignore it or index the wrong page.",
    evidence_strength: "moderate",
  },
  {
    id: "pagespeed_poor",
    title: "PageSpeed performance below 90 (mobile)",
    why: "PageSpeed Insights lab score for mobile: below 50 is reported as medium, 50 to 89 as low. Speed affects users and Google ranking signals; any direct effect on AI answers is not established.",
    evidence_strength: "weak",
  },
  {
    id: "pagespeed_unavailable",
    title: "PageSpeed Insights could not test the page",
    why: "The PageSpeed API returned an error, so performance for this page is unknown.",
    evidence_strength: "weak",
  },
  {
    id: "llms_txt_missing",
    title: "No llms.txt (low evidence of impact)",
    why: "llms.txt is a proposed file that summarizes a site for language models. No major AI engine has confirmed using it, so there is low evidence of impact. Listed for completeness only.",
    evidence_strength: "speculative",
  },
  {
    id: "entity_mismatch",
    title: "Entity fact differs from the confirmed profile",
    why: "A public knowledge source states a different value than the profile you confirmed. Engines draw on these sources, so a wrong founding year, location or name can be repeated in answers.",
    evidence_strength: "moderate",
  },
  {
    id: "entity_missing",
    title: "Entity fact missing from a knowledge source",
    why: "The source has no value for this field. Engines that rely on it have nothing to repeat.",
    evidence_strength: "weak",
  },
];

export const RULE_BY_ID = new Map(RULES.map((r) => [r.id, r]));

export type AuditHost = {
  id: string;
  host: string;
  isPrimary: boolean;
  robotsStatus: number | null;
  robotsText: string | null;
  llmsTxtStatus: number | null;
};

export type AuditPage = {
  id: string;
  hostId: string;
  url: string;
  canonical: string | null;
  statusCode: number | null;
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  wordCount: number | null;
  rawWordCount: number | null;
  lastmod: Date | null;
  schemaTypes: string[];
  schemaRaw: unknown;
  faq: FaqItem[] | null;
  renderMode: "static" | "js" | null;
  visibleDates: string[];
  robotsMeta: string | null;
  contentType: string | null;
  fetchError: string | null;
};

export type AuditPageSpeed = {
  pageId: string | null;
  hostId: string;
  url: string;
  strategy: string;
  ok: boolean;
  score: number | null;
  error: string | null;
};

export type AuditEntityCheck = { source: string; field: string; status: "match" | "mismatch" | "missing"; observed: unknown; expected: unknown };

export type AuditInput = {
  /** The crawl's finish time. Freshness is measured against it, never against now. */
  asOf: Date;
  siteHosts: string[];
  hosts: AuditHost[];
  pages: AuditPage[];
  pagespeed: AuditPageSpeed[];
  entityChecks: AuditEntityCheck[];
};

export type Finding = { ruleId: string; severity: Severity; hostId: string | null; pageId: string | null; detail: Record<string, unknown> };

const ORG_TYPES = new Set(["CollegeOrUniversity", "EducationalOrganization", "Organization", "Corporation", "GovernmentOrganization", "NGO"]);
const UNIVERSITY_TYPES = new Set(["CollegeOrUniversity"]);
const PROGRAM_PATH = /\/(programs?|degrees?|majors?|minors?|academics\/[^/]+|graduate-programs?|undergraduate-programs?)(\/|$)/i;
const DEGREE_IN_HEADING = /\b(B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|MBA|M\.?Ed\.?|Ph\.?D\.?|Bachelor|Master|Doctor(ate)? of|Graduate Certificate|Minor in|Major in)\b/;
const ADMISSIONS_PATH = /\/(admissions?|apply|tuition|financial-aid|cost)(\/|$)/i;
const COURSE_PATH = /\/(courses?|catalog\/course)(\/|$)|preview_course/i;
const COURSE_HEADING = /^[A-Z]{2,5}\s?\d{3,4}[A-Z]?\b/;
const EVENT_PATH = /\/(events?|calendar)\/[^/]+/i;

function isHtmlOk(p: AuditPage): boolean {
  return p.statusCode !== null && p.statusCode >= 200 && p.statusCode < 300 && !p.fetchError && (!p.contentType || /html/i.test(p.contentType));
}
function isNoindex(p: AuditPage): boolean {
  return /noindex/i.test(p.robotsMeta ?? "");
}
function isHome(p: AuditPage): boolean {
  try {
    return new URL(p.url).pathname === "/";
  } catch {
    return false;
  }
}
const monthsBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / (1000 * 3600 * 24 * 30.4375);

function newestDate(p: AuditPage): { date: Date; source: string } | null {
  const candidates: Array<{ date: Date; source: string }> = [];
  if (p.lastmod) candidates.push({ date: p.lastmod, source: "lastmod" });
  for (const d of p.visibleDates) {
    const date = new Date(`${d}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) candidates.push({ date, source: "visible_date" });
  }
  candidates.sort((a, b) => b.date.getTime() - a.date.getTime());
  return candidates[0] ?? null;
}

export function evaluateRules(input: AuditInput): Finding[] {
  const out: Finding[] = [];
  const push = (f: Finding) => out.push(f);

  // robots.txt and AI crawler access, per host per bot
  for (const host of input.hosts) {
    if (host.robotsStatus !== null && host.robotsStatus >= 500) {
      push({ ruleId: "robots_txt_unavailable", severity: "high", hostId: host.id, pageId: null, detail: { host: host.host, status: host.robotsStatus, effect: "crawlers should assume full disallow" } });
      continue;
    }
    if (!host.robotsText) {
      push({ ruleId: "robots_txt_unavailable", severity: "info", hostId: host.id, pageId: null, detail: { host: host.host, status: host.robotsStatus, effect: "no robots.txt; everything allowed" } });
      continue;
    }
    const robots = parseRobots(host.robotsText);
    for (const bot of CORE_AI_BOTS) {
      const root = decide(robots, bot.name, "/");
      const groups = groupsFor(robots, bot.name);
      const specific = groups.some((g) => g.agents.includes(bot.name.toLowerCase()));
      const base = { host: host.host, bot: bot.name, operator: bot.operator, category: bot.category, group: specific ? bot.name : "*" };
      if (!root.allowed) {
        push({
          ruleId: "ai_crawler_blocked",
          severity: bot.category === "training" ? "info" : "high",
          hostId: host.id,
          pageId: null,
          detail: { ...base, rule: root.rule ? `Disallow: ${root.rule.pattern}` : null, robots_line: root.rule?.line ?? null },
        });
        continue;
      }
      if (specific) {
        const disallows = groups.flatMap((g) => g.rules.filter((r) => !r.allow));
        if (disallows.length) {
          push({
            ruleId: "ai_crawler_partially_blocked",
            severity: bot.category === "training" ? "info" : "low",
            hostId: host.id,
            pageId: null,
            detail: { ...base, disallow: disallows.map((r) => r.pattern).sort() },
          });
        }
      }
    }
  }

  // llms.txt
  for (const host of input.hosts) {
    if (host.llmsTxtStatus !== 200) {
      push({ ruleId: "llms_txt_missing", severity: "info", hostId: host.id, pageId: null, detail: { host: host.host, status: host.llmsTxtStatus, label: "low evidence of impact" } });
    }
  }

  const byHost = new Map<string, AuditPage[]>();
  for (const p of input.pages) {
    if (!byHost.has(p.hostId)) byHost.set(p.hostId, []);
    byHost.get(p.hostId)!.push(p);
  }

  // host level schema
  for (const host of input.hosts) {
    const pages = (byHost.get(host.id) ?? []).filter(isHtmlOk);
    if (!pages.length) continue;
    const hasUniversity = pages.some((p) => p.schemaTypes.some((t) => UNIVERSITY_TYPES.has(t)));
    if (host.isPrimary && !hasUniversity) {
      const home = pages.find(isHome);
      push({
        ruleId: "schema_collegeoruniversity_missing",
        severity: "medium",
        hostId: host.id,
        pageId: home?.id ?? null,
        detail: { host: host.host, pages_checked: pages.length },
      });
    }
    const orgPage = pages
      .map((p) => ({ p, nodes: schemaNodes(Array.isArray(p.schemaRaw) ? p.schemaRaw : []).filter((n) => nodeTypes(n).some((t) => ORG_TYPES.has(t))) }))
      .find((x) => x.nodes.length);
    if (orgPage && !orgPage.nodes.some((n) => n.sameAs !== undefined && n.sameAs !== null && n.sameAs !== "")) {
      push({ ruleId: "schema_org_sameas_missing", severity: "low", hostId: host.id, pageId: orgPage.p.id, detail: { host: host.host, url: orgPage.p.url, types: Array.from(new Set(orgPage.nodes.flatMap(nodeTypes))).sort() } });
    }
  }

  // page level
  const siteHosts = new Set(input.siteHosts);
  const pageByUrl = new Map(input.pages.map((p) => [p.url, p]));
  for (const p of input.pages) {
    if (!isHtmlOk(p)) continue;
    const path = new URL(p.url).pathname;
    const headingText = `${p.h1 ?? ""} ${p.title ?? ""}`;
    const types = new Set(p.schemaTypes);
    const faqCount = (p.faq ?? []).length;
    const htmlFaq = (p.faq ?? []).filter((f) => f.source !== "schema").length;
    const isProgram = PROGRAM_PATH.test(path) || DEGREE_IN_HEADING.test(p.h1 ?? "");
    const d = { url: p.url };

    if (p.renderMode === "js") {
      push({ ruleId: "js_only_content", severity: "high", hostId: p.hostId, pageId: p.id, detail: { ...d, raw_words: p.rawWordCount, rendered_words: p.wordCount } });
    }
    if (isNoindex(p)) continue;

    if (isProgram && !types.has("EducationalOccupationalProgram")) {
      push({ ruleId: "schema_program_missing", severity: "low", hostId: p.hostId, pageId: p.id, detail: { ...d, h1: p.h1 } });
    }
    if ((COURSE_PATH.test(path) || COURSE_HEADING.test(p.h1 ?? "")) && !types.has("Course")) {
      push({ ruleId: "schema_course_missing", severity: "low", hostId: p.hostId, pageId: p.id, detail: { ...d, h1: p.h1 } });
    }
    if (EVENT_PATH.test(path) && !types.has("Event") && (p.visibleDates.length > 0 || /\b(20\d\d)\b/.test(headingText))) {
      push({ ruleId: "schema_event_missing", severity: "low", hostId: p.hostId, pageId: p.id, detail: { ...d, h1: p.h1 } });
    }
    if (htmlFaq >= 2 && !types.has("FAQPage")) {
      push({ ruleId: "schema_faqpage_missing", severity: "low", hostId: p.hostId, pageId: p.id, detail: { ...d, faq_items: htmlFaq } });
    }
    if ((isProgram || ADMISSIONS_PATH.test(path)) && faqCount === 0) {
      push({ ruleId: "faq_absent", severity: "info", hostId: p.hostId, pageId: p.id, detail: { ...d, page_kind: isProgram ? "program" : "admissions" } });
    }
    const newest = newestDate(p);
    if (!newest) {
      push({ ruleId: "freshness_unknown", severity: "info", hostId: p.hostId, pageId: p.id, detail: d });
    } else {
      const months = monthsBetween(newest.date, input.asOf);
      if (months > 24) {
        push({ ruleId: "content_stale", severity: "low", hostId: p.hostId, pageId: p.id, detail: { ...d, newest: newest.date.toISOString().slice(0, 10), source: newest.source, months: Math.floor(months) } });
      }
    }
    if (!isHome(p) && (p.wordCount ?? 0) < 250) {
      push({ ruleId: "thin_page", severity: "low", hostId: p.hostId, pageId: p.id, detail: { ...d, words: p.wordCount ?? 0 } });
    }
    if (!p.metaDescription) {
      push({ ruleId: "meta_description_missing", severity: "low", hostId: p.hostId, pageId: p.id, detail: d });
    }
    if (p.canonical !== null) {
      let reason: string | null = null;
      let target: URL | null = null;
      try {
        target = new URL(p.canonical);
      } catch {
        reason = "malformed URL";
      }
      if (target) {
        const t = pageByUrl.get(target.toString());
        if (!siteHosts.has(target.hostname.toLowerCase())) reason = `points outside the site (${target.hostname})`;
        else if (t && t.statusCode !== null && t.statusCode >= 400) reason = `target returns HTTP ${t.statusCode}`;
        else if (t && t.fetchError) reason = `target failed: ${t.fetchError}`;
      }
      if (reason) push({ ruleId: "canonical_broken", severity: "medium", hostId: p.hostId, pageId: p.id, detail: { ...d, canonical: p.canonical, reason } });
    }
  }

  // duplicates within a host
  for (const [hostId, pages] of Array.from(byHost.entries())) {
    for (const [field, ruleId] of [
      ["title", "duplicate_title"],
      ["h1", "duplicate_h1"],
    ] as const) {
      const groups = new Map<string, AuditPage[]>();
      for (const p of pages.filter((x) => isHtmlOk(x) && !isNoindex(x))) {
        const v = (p[field] ?? "").trim();
        if (!v) continue;
        const key = v.toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
      }
      for (const group of Array.from(groups.values())) {
        if (group.length < 2) continue;
        const urls = group.map((g) => g.url).sort();
        for (const p of group) {
          push({ ruleId, severity: "low", hostId, pageId: p.id, detail: { url: p.url, [field]: p[field], duplicates: urls.length, other_urls: urls.filter((u) => u !== p.url).slice(0, 10) } });
        }
      }
    }
  }

  // PageSpeed (stored results only; the audit never calls the API)
  for (const r of input.pagespeed) {
    if (!r.ok) {
      push({ ruleId: "pagespeed_unavailable", severity: "info", hostId: r.hostId, pageId: r.pageId, detail: { url: r.url, strategy: r.strategy, error: r.error } });
    } else if (r.score !== null && r.score < 0.9) {
      push({ ruleId: "pagespeed_poor", severity: r.score < 0.5 ? "medium" : "low", hostId: r.hostId, pageId: r.pageId, detail: { url: r.url, strategy: r.strategy, score: r.score } });
    }
  }

  // entity consistency
  for (const c of input.entityChecks) {
    if (c.status === "mismatch") push({ ruleId: "entity_mismatch", severity: "medium", hostId: null, pageId: null, detail: { source: c.source, field: c.field, observed: c.observed, expected: c.expected } });
    else if (c.status === "missing") push({ ruleId: "entity_missing", severity: "low", hostId: null, pageId: null, detail: { source: c.source, field: c.field, expected: c.expected } });
  }

  return out;
}
