import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// pgvector column without a fixed dimension, so the embedding model can be chosen later.
// The model name is stored next to every vector; similarity search never mixes models.
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector";
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    return value
      .replace(/^\[|\]$/g, "")
      .split(",")
      .filter(Boolean)
      .map(Number);
  },
});

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ---------- enums ----------
export const roleEnum = pgEnum("role", ["admin", "editor", "viewer"]);
export const entityTypeEnum = pgEnum("entity_type", ["university"]);
export const aliasKindEnum = pgEnum("alias_kind", ["full", "short", "unit", "program"]);
export const competitorSourceEnum = pgEnum("competitor_source", ["ipeds_suggested", "manual"]);
export const discoveredViaEnum = pgEnum("discovered_via", ["sitemap", "ct_log", "link", "manual"]);
export const crawlStatusEnum = pgEnum("crawl_status", ["queued", "running", "complete", "failed"]);
export const renderModeEnum = pgEnum("render_mode", ["static", "js"]);
export const evidenceStrengthEnum = pgEnum("evidence_strength", ["strong", "moderate", "weak", "speculative"]);
export const severityEnum = pgEnum("severity", ["info", "low", "medium", "high", "critical"]);
export const entityCheckSourceEnum = pgEnum("entity_check_source", [
  "knowledge_graph",
  "wikidata",
  "wikipedia",
  "ipeds",
  "scorecard",
]);
export const entityCheckStatusEnum = pgEnum("entity_check_status", ["match", "mismatch", "missing"]);
export const campaignStatusEnum = pgEnum("campaign_status", ["draft", "active", "archived"]);
export const engineEnum = pgEnum("engine", [
  "chatgpt",
  "gemini",
  "claude",
  "perplexity",
  "google_aio",
  "google_ai_mode",
]);
export const runnerEnum = pgEnum("runner", [
  "ui_provider",
  "serp_provider",
  "api_search",
  "api_parametric",
  "manual_paste",
]);
export const fidelityEnum = pgEnum("fidelity", ["high", "medium", "low"]);
export const regionHonoredEnum = pgEnum("region_honored", ["yes", "no", "unknown"]);
export const drawStatusEnum = pgEnum("draw_status", ["ok", "empty", "error", "blocked"]);
export const intentEnum = pgEnum("intent", ["discovery", "comparison", "evaluation", "decision"]);
export const provenanceEnum = pgEnum("provenance", [
  "observed_ai_log",
  "web_query",
  "paa",
  "fanout",
  "synthesized",
  "custom",
]);
export const promptStatusEnum = pgEnum("prompt_status", ["draft", "approved", "rejected"]);
export const demandSourceEnum = pgEnum("demand_source", [
  "google_trends",
  "keyword_volume",
  "paa",
  "autocomplete",
  "related_search",
  "exa",
  "search_console",
]);
export const referralSourceEnum = pgEnum("referral_source", [
  "chatgpt",
  "perplexity",
  "gemini",
  "claude",
  "copilot",
  "other",
]);
export const seasonalKindEnum = pgEnum("seasonal_kind", [
  "admissions_deadline",
  "orientation",
  "commencement",
  "aid_deadline",
  "term_start",
  "custom",
]);
export const cadenceEnum = pgEnum("cadence", ["biweekly", "monthly", "manual"]);
export const scanStatusEnum = pgEnum("scan_status", [
  "estimating",
  "awaiting_approval",
  "running",
  "partial",
  "complete",
  "failed",
]);
export const storageEnum = pgEnum("storage", ["inline", "file"]);
export const fanoutSourceEnum = pgEnum("fanout_source", ["provider_field", "ui_visible"]);
export const sentimentEnum = pgEnum("sentiment", ["positive", "neutral", "negative", "mixed", "none"]);
export const mentionEntityEnum = pgEnum("mention_entity", ["brand", "competitor"]);
export const prominenceEnum = pgEnum("prominence", ["headline", "first_paragraph", "body", "footnote_only"]);
export const sourceClassEnum = pgEnum("source_class", [
  "owned",
  "competitor",
  "editorial",
  "ranking",
  "reference",
  "gov",
  "ugc",
  "other",
]);
export const verdictEnum = pgEnum("verdict", ["supported", "contradicted", "unverifiable"]);
export const recommendationKindEnum = pgEnum("recommendation_kind", ["gap", "content", "technical", "earned_media"]);
export const recommendationStatusEnum = pgEnum("recommendation_status", [
  "open",
  "in_progress",
  "published",
  "dismissed",
]);
export const alertKindEnum = pgEnum("alert_kind", [
  "significant_decline",
  "canary_failed",
  "budget_threshold",
  "provider_error_rate",
  "blocked",
]);
export const alertStatusEnum = pgEnum("alert_status", ["open", "acknowledged"]);

// ---------- 3.1 tenancy and access ----------
export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: roleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_org_user").on(t.orgId, t.userId)],
);

export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
});

// ---------- 3.2 brand, peers, facts ----------
export const brands = pgTable("brands", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  rootDomain: text("root_domain").notNull(),
  entityType: entityTypeEnum("entity_type").notNull().default("university"),
  ipedsUnitid: text("ipeds_unitid"),
  createdAt: createdAt(),
});

export const brandAliases = pgTable(
  "brand_aliases",
  {
    id: id(),
    brandId: uuid("brand_id").notNull().references(() => brands.id),
    alias: text("alias").notNull(),
    kind: aliasKindEnum("kind").notNull(),
    requiresContext: boolean("requires_context").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("brand_aliases_brand_alias").on(t.brandId, t.alias)],
);

export const brandDomains = pgTable(
  "brand_domains",
  {
    id: id(),
    brandId: uuid("brand_id").notNull().references(() => brands.id),
    domain: text("domain").notNull(),
    isOwned: boolean("is_owned").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("brand_domains_brand_domain").on(t.brandId, t.domain)],
);

export const competitors = pgTable(
  "competitors",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    ipedsUnitid: text("ipeds_unitid"),
    source: competitorSourceEnum("source").notNull().default("manual"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("competitors_org_name").on(t.orgId, t.name)],
);

export const competitorAliases = pgTable(
  "competitor_aliases",
  {
    id: id(),
    competitorId: uuid("competitor_id").notNull().references(() => competitors.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("competitor_aliases_comp_alias").on(t.competitorId, t.alias)],
);

export const competitorDomains = pgTable(
  "competitor_domains",
  {
    id: id(),
    competitorId: uuid("competitor_id").notNull().references(() => competitors.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("competitor_domains_comp_domain").on(t.competitorId, t.domain)],
);

export const factSets = pgTable(
  "fact_sets",
  {
    id: id(),
    brandId: uuid("brand_id").notNull().references(() => brands.id),
    version: integer("version").notNull(),
    frozenAt: ts("frozen_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("fact_sets_brand_version").on(t.brandId, t.version)],
);

export const facts = pgTable("facts", {
  id: id(),
  factSetId: uuid("fact_set_id").notNull().references(() => factSets.id),
  externalId: text("external_id"),
  text: text("text").notNull(),
  sourceUrl: text("source_url"),
  sourceLabel: text("source_label"),
  names: text("names").array().notNull().default(sql`'{}'::text[]`),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  needsConfirmation: boolean("needs_confirmation").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

// ---------- 3.3 site and audit ----------
export const sites = pgTable("sites", {
  id: id(),
  brandId: uuid("brand_id").notNull().references(() => brands.id),
  rootUrl: text("root_url").notNull(),
  createdAt: createdAt(),
});

export const siteHosts = pgTable(
  "site_hosts",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id),
    host: text("host").notNull(),
    discoveredVia: discoveredViaEnum("discovered_via").notNull(),
    included: boolean("included").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("site_hosts_site_host").on(t.siteId, t.host)],
);

export const crawlRuns = pgTable("crawl_runs", {
  id: id(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  status: crawlStatusEnum("status").notNull().default("queued"),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
  pageCount: integer("page_count").notNull().default(0),
  createdAt: createdAt(),
});

export const crawlPages = pgTable(
  "crawl_pages",
  {
    id: id(),
    crawlRunId: uuid("crawl_run_id").notNull().references(() => crawlRuns.id),
    hostId: uuid("host_id").notNull().references(() => siteHosts.id),
    url: text("url").notNull(),
    canonical: text("canonical"),
    statusCode: integer("status_code"),
    title: text("title"),
    h1: text("h1"),
    headings: jsonb("headings"),
    metaDescription: text("meta_description"),
    wordCount: integer("word_count"),
    lastmod: ts("lastmod"),
    schemaTypes: text("schema_types").array().notNull().default(sql`'{}'::text[]`),
    schemaRaw: jsonb("schema_raw"),
    faq: jsonb("faq"),
    renderMode: renderModeEnum("render_mode"),
    contentHash: text("content_hash"),
    textRef: text("text_ref"),
    embedding: vector("embedding"),
    embeddingModel: text("embedding_model"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("crawl_pages_run_url").on(t.crawlRunId, t.url)],
);

export const auditRules = pgTable("audit_rules", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  why: text("why").notNull(),
  evidenceStrength: evidenceStrengthEnum("evidence_strength").notNull(),
  createdAt: createdAt(),
});

export const auditFindings = pgTable("audit_findings", {
  id: id(),
  crawlRunId: uuid("crawl_run_id").notNull().references(() => crawlRuns.id),
  ruleId: text("rule_id").notNull().references(() => auditRules.id),
  severity: severityEnum("severity").notNull(),
  hostId: uuid("host_id").references(() => siteHosts.id),
  pageId: uuid("page_id").references(() => crawlPages.id),
  detail: jsonb("detail"),
  createdAt: createdAt(),
});

export const botHits = pgTable("bot_hits", {
  id: id(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  hostId: uuid("host_id").references(() => siteHosts.id),
  path: text("path").notNull(),
  userAgent: text("user_agent").notNull(),
  botName: text("bot_name").notNull(),
  statusCode: integer("status_code"),
  hitAt: ts("hit_at").notNull(),
  sourceFileSha256: text("source_file_sha256").notNull(),
  createdAt: createdAt(),
});

// ---------- 3.4 campaigns, personas, regions, prompts ----------
export const campaigns = pgTable("campaigns", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  brandId: uuid("brand_id").notNull().references(() => brands.id),
  name: text("name").notNull(),
  topic: text("topic").notNull().default(""),
  status: campaignStatusEnum("status").notNull().default("draft"),
  // Campaign scoped config: subtopics, assets, last_location_note, migration markers.
  settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const personas = pgTable("personas", {
  id: id(),
  orgId: uuid("org_id").references(() => organizations.id),
  name: text("name").notNull(),
  goal: text("goal").notNull().default(""),
  background: text("background").notNull().default(""),
  vocabulary: text("vocabulary").notNull().default(""),
  notes: text("notes").notNull().default(""),
  legacyKey: text("legacy_key"),
  createdAt: createdAt(),
});

export const regions = pgTable("regions", {
  id: id(),
  country: text("country"),
  state: text("state"),
  city: text("city"),
  language: text("language"),
  serpLocation: text("serp_location"),
  label: text("label").notNull().unique(),
  createdAt: createdAt(),
});

export const seasonalEvents = pgTable("seasonal_events", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  kind: seasonalKindEnum("kind").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  recurrence: text("recurrence"),
  sourceUrl: text("source_url"),
  createdAt: createdAt(),
});

export const campaignEngines = pgTable(
  "campaign_engines",
  {
    id: id(),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    engine: engineEnum("engine").notNull(),
    runner: runnerEnum("runner").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("campaign_engines_unique").on(t.campaignId, t.engine, t.runner)],
);

export const campaignRegions = pgTable(
  "campaign_regions",
  {
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    regionId: uuid("region_id").notNull().references(() => regions.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.regionId] })],
);

export const campaignPersonas = pgTable(
  "campaign_personas",
  {
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    personaId: uuid("persona_id").notNull().references(() => personas.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.personaId] })],
);

export const prompts = pgTable(
  "prompts",
  {
    id: id(),
    // Numeric handle used by the legacy screens. Legacy SQLite ids are preserved here.
    seq: bigint("seq", { mode: "number" }).generatedByDefaultAsIdentity().notNull().unique(),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
    text: text("text").notNull(),
    personaId: uuid("persona_id").references(() => personas.id),
    intent: intentEnum("intent"),
    funnelStage: text("funnel_stage"),
    branded: boolean("branded").notNull().default(false),
    provenance: provenanceEnum("provenance").notNull(),
    demandEvidence: jsonb("demand_evidence"),
    status: promptStatusEnum("status").notNull().default("draft"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    version: integer("version").notNull().default(1),
    embedding: vector("embedding"),
    embeddingModel: text("embedding_model"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("prompts_campaign").on(t.campaignId)],
);

export const promptSets = pgTable(
  "prompt_sets",
  {
    id: id(),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
    version: integer("version").notNull(),
    sha256: text("sha256"),
    frozenAt: ts("frozen_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("prompt_sets_campaign_version").on(t.campaignId, t.version)],
);

export const promptSetItems = pgTable(
  "prompt_set_items",
  {
    id: id(),
    promptSetId: uuid("prompt_set_id").notNull().references(() => promptSets.id),
    promptId: uuid("prompt_id").notNull().references(() => prompts.id),
    promptTextSnapshot: text("prompt_text_snapshot").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("prompt_set_items_set_prompt").on(t.promptSetId, t.promptId)],
);

// ---------- 3.5 demand ----------
export const rawPayloads = pgTable("raw_payloads", {
  sha256: text("sha256").primaryKey(),
  content: text("content"),
  bytes: integer("bytes").notNull(),
  storage: storageEnum("storage").notNull(),
  path: text("path"),
  mediaType: text("media_type").notNull(),
  createdAt: createdAt(),
});

export const demandSignals = pgTable("demand_signals", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  source: demandSourceEnum("source").notNull(),
  term: text("term").notNull(),
  regionId: uuid("region_id").references(() => regions.id),
  value: jsonb("value"),
  rawPayloadId: text("raw_payload_id").references(() => rawPayloads.sha256),
  fetchedAt: ts("fetched_at").notNull().defaultNow(),
  createdAt: createdAt(),
});

export const searchConsoleQueries = pgTable("search_console_queries", {
  id: id(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  query: text("query").notNull(),
  page: text("page"),
  country: text("country"),
  device: text("device"),
  clicks: integer("clicks").notNull().default(0),
  impressions: integer("impressions").notNull().default(0),
  ctr: numeric("ctr"),
  position: numeric("position"),
  date: date("date").notNull(),
  createdAt: createdAt(),
});

export const aiReferralTraffic = pgTable("ai_referral_traffic", {
  id: id(),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  source: referralSourceEnum("source").notNull(),
  landingPage: text("landing_page"),
  sessions: integer("sessions").notNull().default(0),
  engagedSessions: integer("engaged_sessions").notNull().default(0),
  conversions: jsonb("conversions"),
  date: date("date").notNull(),
  createdAt: createdAt(),
});

// ---------- 3.6 scans and the draw ledger ----------
export const schedules = pgTable("schedules", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  cadence: cadenceEnum("cadence").notNull(),
  promptSetId: uuid("prompt_set_id").notNull().references(() => promptSets.id),
  nextRunAt: ts("next_run_at"),
  budgetCapUsd: numeric("budget_cap_usd"),
  createdAt: createdAt(),
});

export const scans = pgTable("scans", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  promptSetId: uuid("prompt_set_id").references(() => promptSets.id),
  scheduleId: uuid("schedule_id").references(() => schedules.id),
  name: text("name").notNull().default(""),
  status: scanStatusEnum("status").notNull(),
  estimate: jsonb("estimate"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: ts("approved_at"),
  createdAt: createdAt(),
});

export const draws = pgTable(
  "draws",
  {
    id: id(),
    // Numeric handle used by the legacy screens (legacy response id).
    seq: bigint("seq", { mode: "number" }).generatedByDefaultAsIdentity().notNull().unique(),
    scanId: uuid("scan_id").notNull().references(() => scans.id),
    promptId: uuid("prompt_id").notNull().references(() => prompts.id),
    // Null only for ad hoc captures of prompts that are not in any frozen set.
    promptSetId: uuid("prompt_set_id").references(() => promptSets.id),
    engine: engineEnum("engine").notNull(),
    runner: runnerEnum("runner").notNull(),
    fidelity: fidelityEnum("fidelity").notNull(),
    provider: text("provider").notNull(),
    modelBuild: text("model_build").notNull().default("unknown"),
    regionId: uuid("region_id").notNull().references(() => regions.id),
    regionHonored: regionHonoredEnum("region_honored").notNull().default("unknown"),
    drawIndex: integer("draw_index").notNull(),
    status: drawStatusEnum("status").notNull(),
    answerText: text("answer_text").notNull(),
    rawPayloadId: text("raw_payload_id").references(() => rawPayloads.sha256),
    costUnits: numeric("cost_units").notNull().default("0"),
    costUsd: numeric("cost_usd"),
    latencyMs: integer("latency_ms"),
    capturedAt: ts("captured_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("draws_unique_cell").on(t.scanId, t.promptId, t.engine, t.runner, t.regionId, t.drawIndex),
    index("draws_prompt").on(t.promptId),
  ],
);

export const fanoutQueries = pgTable("fanout_queries", {
  id: id(),
  drawId: uuid("draw_id").notNull().references(() => draws.id),
  query: text("query").notNull(),
  source: fanoutSourceEnum("source").notNull(),
  createdAt: createdAt(),
});

export const serpSnapshots = pgTable(
  "serp_snapshots",
  {
    id: id(),
    query: text("query").notNull(),
    promptId: uuid("prompt_id").references(() => prompts.id),
    regionId: uuid("region_id").references(() => regions.id),
    engine: text("engine").notNull(),
    fetchedAt: ts("fetched_at").notNull(),
    rawPayloadId: text("raw_payload_id").references(() => rawPayloads.sha256),
    organic: jsonb("organic").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("serp_snapshots_prompt").on(t.promptId)],
);

// Cache by full params for every paid provider. A refresh is a new row; lookups take the latest.
export const providerCache = pgTable(
  "provider_cache",
  {
    id: id(),
    provider: text("provider").notNull(),
    engine: text("engine").notNull(),
    paramsHash: text("params_hash").notNull(),
    params: jsonb("params").notNull(),
    rawPayloadId: text("raw_payload_id")
      .notNull()
      .references(() => rawPayloads.sha256),
    units: numeric("units").notNull().default("0"),
    createdAt: createdAt(),
  },
  (t) => [index("provider_cache_hash").on(t.provider, t.paramsHash)],
);

// ---------- 3.7 parsing and judging ----------
export const judgeRuns = pgTable(
  "judge_runs",
  {
    id: id(),
    seq: bigint("seq", { mode: "number" }).generatedByDefaultAsIdentity().notNull().unique(),
    drawId: uuid("draw_id").notNull().references(() => draws.id),
    judgeModel: text("judge_model").notNull(),
    judgePromptVersion: text("judge_prompt_version").notNull(),
    rawOutput: text("raw_output").notNull(),
    parsed: jsonb("parsed"),
    repairUsed: boolean("repair_used").notNull().default(false),
    error: text("error"),
    manualOverride: jsonb("manual_override"),
    sentiment: sentimentEnum("sentiment"),
    sentimentSpanStart: integer("sentiment_span_start"),
    sentimentSpanEnd: integer("sentiment_span_end"),
    createdAt: createdAt(),
  },
  (t) => [index("judge_runs_draw").on(t.drawId)],
);

export const mentions = pgTable("mentions", {
  id: id(),
  judgeRunId: uuid("judge_run_id").notNull().references(() => judgeRuns.id),
  entityType: mentionEntityEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  aliasMatched: text("alias_matched"),
  spanStart: integer("span_start"),
  spanEnd: integer("span_end"),
  listPosition: integer("list_position"),
  prominence: prominenceEnum("prominence"),
  createdAt: createdAt(),
});

export const citations = pgTable("citations", {
  id: id(),
  drawId: uuid("draw_id").notNull().references(() => draws.id),
  url: text("url").notNull(),
  canonicalUrl: text("canonical_url"),
  domain: text("domain").notNull(),
  position: integer("position"),
  // Null when the source did not say whether the citation was a link.
  linked: boolean("linked"),
  sourceClass: sourceClassEnum("source_class").notNull(),
  createdAt: createdAt(),
});

export const claims = pgTable("claims", {
  id: id(),
  judgeRunId: uuid("judge_run_id").notNull().references(() => judgeRuns.id),
  text: text("text").notNull(),
  spanStart: integer("span_start"),
  spanEnd: integer("span_end"),
  factId: uuid("fact_id").references(() => facts.id),
  verdict: verdictEnum("verdict").notNull(),
  createdAt: createdAt(),
});

export const citedPages = pgTable("cited_pages", {
  id: id(),
  canonicalUrl: text("canonical_url").notNull().unique(),
  fetchedAt: ts("fetched_at"),
  statusCode: integer("status_code"),
  title: text("title"),
  h1: text("h1"),
  h2s: text("h2s").array().notNull().default(sql`'{}'::text[]`),
  publishedAt: ts("published_at"),
  updatedAt: ts("updated_at"),
  wordCount: integer("word_count"),
  schemaTypes: text("schema_types").array().notNull().default(sql`'{}'::text[]`),
  faq: jsonb("faq"),
  contentType: text("content_type"),
  textRef: text("text_ref"),
  embedding: vector("embedding"),
  embeddingModel: text("embedding_model"),
  createdAt: createdAt(),
});

export const goldLabels = pgTable("gold_labels", {
  id: id(),
  drawId: uuid("draw_id").notNull().references(() => draws.id),
  labelerUserId: uuid("labeler_user_id").notNull().references(() => users.id),
  field: text("field").notNull(),
  value: jsonb("value").notNull(),
  createdAt: createdAt(),
});

// ---------- 3.8 action and outcomes ----------
export const recommendations = pgTable("recommendations", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  kind: recommendationKindEnum("kind").notNull(),
  payload: jsonb("payload").notNull(),
  evidence: jsonb("evidence"),
  targetPromptIds: uuid("target_prompt_ids").array().notNull().default(sql`'{}'::uuid[]`),
  status: recommendationStatusEnum("status").notNull().default("open"),
  baselineScanId: uuid("baseline_scan_id").references(() => scans.id),
  publishedAt: ts("published_at"),
  followupScanId: uuid("followup_scan_id").references(() => scans.id),
  createdAt: createdAt(),
});

export const strategyReports = pgTable("strategy_reports", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  topic: text("topic").notNull(),
  inputs: jsonb("inputs").notNull(),
  output: jsonb("output").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

// ---------- 3.9 ops ----------
export const providerAccounts = pgTable(
  "provider_accounts",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    provider: text("provider").notNull(),
    monthlyBudgetUsd: numeric("monthly_budget_usd"),
    spentUsdMonth: numeric("spent_usd_month").notNull().default("0"),
    perScanCapUsd: numeric("per_scan_cap_usd"),
    // Credit based providers (SerpAPI). USD per credit is null when the plan is unknown.
    creditsStarting: integer("credits_starting"),
    creditsRemaining: integer("credits_remaining"),
    perRunCapUnits: integer("per_run_cap_units"),
    creditUnitUsd: numeric("credit_unit_usd"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("provider_accounts_org_provider").on(t.orgId, t.provider)],
);

export const costLedger = pgTable(
  "cost_ledger",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    provider: text("provider").notNull(),
    scanId: uuid("scan_id").references(() => scans.id),
    drawId: uuid("draw_id").references(() => draws.id),
    units: numeric("units").notNull().default("0"),
    // Null when the USD price of a unit is unknown.
    usd: numeric("usd"),
    at: ts("at").notNull().defaultNow(),
    engine: text("engine"),
    paramsHash: text("params_hash"),
    ok: boolean("ok").notNull(),
    cached: boolean("cached").notNull().default(false),
    error: text("error"),
    promptId: uuid("prompt_id").references(() => prompts.id),
    createdAt: createdAt(),
  },
  (t) => [index("cost_ledger_provider_at").on(t.provider, t.at)],
);

export const modelEvents = pgTable("model_events", {
  id: id(),
  engine: engineEnum("engine").notNull(),
  occurredOn: date("occurred_on").notNull(),
  note: text("note").notNull(),
  sourceUrl: text("source_url"),
  createdAt: createdAt(),
});

export const alerts = pgTable("alerts", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  kind: alertKindEnum("kind").notNull(),
  payload: jsonb("payload"),
  status: alertStatusEnum("status").notNull().default("open"),
  acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    orgId: uuid("org_id").references(() => organizations.id),
    userId: uuid("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("audit_log_org_at").on(t.orgId, t.at)],
);

export const IMMUTABLE_TABLES = ["draws", "raw_payloads", "prompt_set_items", "audit_log"] as const;
