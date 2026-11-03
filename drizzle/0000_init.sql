CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."alert_kind" AS ENUM('significant_decline', 'canary_failed', 'budget_threshold', 'provider_error_rate', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('open', 'acknowledged');--> statement-breakpoint
CREATE TYPE "public"."alias_kind" AS ENUM('full', 'short', 'unit', 'program');--> statement-breakpoint
CREATE TYPE "public"."cadence" AS ENUM('biweekly', 'monthly', 'manual');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."competitor_source" AS ENUM('ipeds_suggested', 'manual');--> statement-breakpoint
CREATE TYPE "public"."crawl_status" AS ENUM('queued', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."demand_source" AS ENUM('google_trends', 'keyword_volume', 'paa', 'autocomplete', 'related_search', 'exa', 'search_console');--> statement-breakpoint
CREATE TYPE "public"."discovered_via" AS ENUM('sitemap', 'ct_log', 'link', 'manual');--> statement-breakpoint
CREATE TYPE "public"."draw_status" AS ENUM('ok', 'empty', 'error', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."engine" AS ENUM('chatgpt', 'gemini', 'claude', 'perplexity', 'google_aio', 'google_ai_mode');--> statement-breakpoint
CREATE TYPE "public"."entity_check_source" AS ENUM('knowledge_graph', 'wikidata', 'wikipedia', 'ipeds', 'scorecard');--> statement-breakpoint
CREATE TYPE "public"."entity_check_status" AS ENUM('match', 'mismatch', 'missing');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('university');--> statement-breakpoint
CREATE TYPE "public"."evidence_strength" AS ENUM('strong', 'moderate', 'weak', 'speculative');--> statement-breakpoint
CREATE TYPE "public"."fanout_source" AS ENUM('provider_field', 'ui_visible');--> statement-breakpoint
CREATE TYPE "public"."fidelity" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."intent" AS ENUM('discovery', 'comparison', 'evaluation', 'decision');--> statement-breakpoint
CREATE TYPE "public"."mention_entity" AS ENUM('brand', 'competitor');--> statement-breakpoint
CREATE TYPE "public"."prominence" AS ENUM('headline', 'first_paragraph', 'body', 'footnote_only');--> statement-breakpoint
CREATE TYPE "public"."prompt_status" AS ENUM('draft', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."provenance" AS ENUM('observed_ai_log', 'web_query', 'paa', 'fanout', 'synthesized', 'custom');--> statement-breakpoint
CREATE TYPE "public"."recommendation_kind" AS ENUM('gap', 'content', 'technical', 'earned_media');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('open', 'in_progress', 'published', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."referral_source" AS ENUM('chatgpt', 'perplexity', 'gemini', 'claude', 'copilot', 'other');--> statement-breakpoint
CREATE TYPE "public"."region_honored" AS ENUM('yes', 'no', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."render_mode" AS ENUM('static', 'js');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."runner" AS ENUM('ui_provider', 'serp_provider', 'api_search', 'api_parametric', 'manual_paste');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('estimating', 'awaiting_approval', 'running', 'partial', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."seasonal_kind" AS ENUM('admissions_deadline', 'orientation', 'commencement', 'aid_deadline', 'term_start', 'custom');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'neutral', 'negative', 'mixed', 'none');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."source_class" AS ENUM('owned', 'competitor', 'editorial', 'ranking', 'reference', 'gov', 'ugc', 'other');--> statement-breakpoint
CREATE TYPE "public"."storage" AS ENUM('inline', 'file');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('supported', 'contradicted', 'unverifiable');--> statement-breakpoint
CREATE TABLE "ai_referral_traffic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"source" "referral_source" NOT NULL,
	"landing_page" text,
	"sessions" integer DEFAULT 0 NOT NULL,
	"engaged_sessions" integer DEFAULT 0 NOT NULL,
	"conversions" jsonb,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"kind" "alert_kind" NOT NULL,
	"payload" jsonb,
	"status" "alert_status" DEFAULT 'open' NOT NULL,
	"acknowledged_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crawl_run_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"severity" "severity" NOT NULL,
	"host_id" uuid,
	"page_id" uuid,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"why" text NOT NULL,
	"evidence_strength" "evidence_strength" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"host_id" uuid,
	"path" text NOT NULL,
	"user_agent" text NOT NULL,
	"bot_name" text NOT NULL,
	"status_code" integer,
	"hit_at" timestamp with time zone NOT NULL,
	"source_file_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"kind" "alias_kind" NOT NULL,
	"requires_context" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"is_owned" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"root_domain" text NOT NULL,
	"entity_type" "entity_type" DEFAULT 'university' NOT NULL,
	"ipeds_unitid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_engines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"engine" "engine" NOT NULL,
	"runner" "runner" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_personas" (
	"campaign_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_personas_campaign_id_persona_id_pk" PRIMARY KEY("campaign_id","persona_id")
);
--> statement-breakpoint
CREATE TABLE "campaign_regions" (
	"campaign_id" uuid NOT NULL,
	"region_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_regions_campaign_id_region_id_pk" PRIMARY KEY("campaign_id","region_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draw_id" uuid NOT NULL,
	"url" text NOT NULL,
	"canonical_url" text,
	"domain" text NOT NULL,
	"position" integer,
	"linked" boolean,
	"source_class" "source_class" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cited_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_url" text NOT NULL,
	"fetched_at" timestamp with time zone,
	"status_code" integer,
	"title" text,
	"h1" text,
	"h2s" text[] DEFAULT '{}'::text[] NOT NULL,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"word_count" integer,
	"schema_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"faq" jsonb,
	"content_type" text,
	"text_ref" text,
	"embedding" vector,
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cited_pages_canonical_url_unique" UNIQUE("canonical_url")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judge_run_id" uuid NOT NULL,
	"text" text NOT NULL,
	"span_start" integer,
	"span_end" integer,
	"fact_id" uuid,
	"verdict" "verdict" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ipeds_unitid" text,
	"source" "competitor_source" DEFAULT 'manual' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"scan_id" uuid,
	"draw_id" uuid,
	"units" numeric DEFAULT '0' NOT NULL,
	"usd" numeric,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"engine" text,
	"params_hash" text,
	"ok" boolean NOT NULL,
	"cached" boolean DEFAULT false NOT NULL,
	"error" text,
	"prompt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawl_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crawl_run_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"url" text NOT NULL,
	"canonical" text,
	"status_code" integer,
	"title" text,
	"h1" text,
	"headings" jsonb,
	"meta_description" text,
	"word_count" integer,
	"lastmod" timestamp with time zone,
	"schema_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"schema_raw" jsonb,
	"faq" jsonb,
	"render_mode" "render_mode",
	"content_hash" text,
	"text_ref" text,
	"embedding" vector,
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawl_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"status" "crawl_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"page_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demand_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"source" "demand_source" NOT NULL,
	"term" text NOT NULL,
	"region_id" uuid,
	"value" jsonb,
	"raw_payload_id" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draws" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED BY DEFAULT AS IDENTITY (sequence name "draws_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"scan_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"prompt_set_id" uuid,
	"engine" "engine" NOT NULL,
	"runner" "runner" NOT NULL,
	"fidelity" "fidelity" NOT NULL,
	"provider" text NOT NULL,
	"model_build" text DEFAULT 'unknown' NOT NULL,
	"region_id" uuid NOT NULL,
	"region_honored" "region_honored" DEFAULT 'unknown' NOT NULL,
	"draw_index" integer NOT NULL,
	"status" "draw_status" NOT NULL,
	"answer_text" text NOT NULL,
	"raw_payload_id" text,
	"cost_units" numeric DEFAULT '0' NOT NULL,
	"cost_usd" numeric,
	"latency_ms" integer,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draws_seq_unique" UNIQUE("seq")
);
--> statement-breakpoint
CREATE TABLE "fact_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"frozen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fact_set_id" uuid NOT NULL,
	"external_id" text,
	"text" text NOT NULL,
	"source_url" text,
	"source_label" text,
	"names" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"needs_confirmation" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fanout_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draw_id" uuid NOT NULL,
	"query" text NOT NULL,
	"source" "fanout_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gold_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draw_id" uuid NOT NULL,
	"labeler_user_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judge_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED BY DEFAULT AS IDENTITY (sequence name "judge_runs_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"draw_id" uuid NOT NULL,
	"judge_model" text NOT NULL,
	"judge_prompt_version" text NOT NULL,
	"raw_output" text NOT NULL,
	"parsed" jsonb,
	"repair_used" boolean DEFAULT false NOT NULL,
	"error" text,
	"manual_override" jsonb,
	"sentiment" "sentiment",
	"sentiment_span_start" integer,
	"sentiment_span_end" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judge_runs_seq_unique" UNIQUE("seq")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judge_run_id" uuid NOT NULL,
	"entity_type" "mention_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"alias_matched" text,
	"span_start" integer,
	"span_end" integer,
	"list_position" integer,
	"prominence" "prominence",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engine" "engine" NOT NULL,
	"occurred_on" date NOT NULL,
	"note" text NOT NULL,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"name" text NOT NULL,
	"goal" text DEFAULT '' NOT NULL,
	"background" text DEFAULT '' NOT NULL,
	"vocabulary" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"legacy_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_set_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_set_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"prompt_text_snapshot" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"sha256" text,
	"frozen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED BY DEFAULT AS IDENTITY (sequence name "prompts_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"campaign_id" uuid NOT NULL,
	"text" text NOT NULL,
	"persona_id" uuid,
	"intent" "intent",
	"funnel_stage" text,
	"branded" boolean DEFAULT false NOT NULL,
	"provenance" "provenance" NOT NULL,
	"demand_evidence" jsonb,
	"status" "prompt_status" DEFAULT 'draft' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"embedding" vector,
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompts_seq_unique" UNIQUE("seq")
);
--> statement-breakpoint
CREATE TABLE "provider_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"monthly_budget_usd" numeric,
	"spent_usd_month" numeric DEFAULT '0' NOT NULL,
	"per_scan_cap_usd" numeric,
	"credits_starting" integer,
	"credits_remaining" integer,
	"per_run_cap_units" integer,
	"credit_unit_usd" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"engine" text NOT NULL,
	"params_hash" text NOT NULL,
	"params" jsonb NOT NULL,
	"raw_payload_id" text NOT NULL,
	"units" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_payloads" (
	"sha256" text PRIMARY KEY NOT NULL,
	"content" text,
	"bytes" integer NOT NULL,
	"storage" "storage" NOT NULL,
	"path" text,
	"media_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"kind" "recommendation_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"evidence" jsonb,
	"target_prompt_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" "recommendation_status" DEFAULT 'open' NOT NULL,
	"baseline_scan_id" uuid,
	"published_at" timestamp with time zone,
	"followup_scan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text,
	"state" text,
	"city" text,
	"language" text,
	"serp_location" text,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regions_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"prompt_set_id" uuid,
	"schedule_id" uuid,
	"name" text DEFAULT '' NOT NULL,
	"status" "scan_status" NOT NULL,
	"estimate" jsonb,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"cadence" "cadence" NOT NULL,
	"prompt_set_id" uuid NOT NULL,
	"next_run_at" timestamp with time zone,
	"budget_cap_usd" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_console_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"query" text NOT NULL,
	"page" text,
	"country" text,
	"device" text,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"ctr" numeric,
	"position" numeric,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasonal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "seasonal_kind" NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"recurrence" text,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serp_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"prompt_id" uuid,
	"region_id" uuid,
	"engine" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"raw_payload_id" text,
	"organic" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "site_hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"host" text NOT NULL,
	"discovered_via" "discovered_via" NOT NULL,
	"included" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"root_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_referral_traffic" ADD CONSTRAINT "ai_referral_traffic_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_rule_id_audit_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."audit_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_host_id_site_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."site_hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_page_id_crawl_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."crawl_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_hits" ADD CONSTRAINT "bot_hits_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_hits" ADD CONSTRAINT "bot_hits_host_id_site_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."site_hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_aliases" ADD CONSTRAINT "brand_aliases_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_domains" ADD CONSTRAINT "brand_domains_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_engines" ADD CONSTRAINT "campaign_engines_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_personas" ADD CONSTRAINT "campaign_personas_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_personas" ADD CONSTRAINT "campaign_personas_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_regions" ADD CONSTRAINT "campaign_regions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_regions" ADD CONSTRAINT "campaign_regions_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_draw_id_draws_id_fk" FOREIGN KEY ("draw_id") REFERENCES "public"."draws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_judge_run_id_judge_runs_id_fk" FOREIGN KEY ("judge_run_id") REFERENCES "public"."judge_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_fact_id_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."facts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_aliases" ADD CONSTRAINT "competitor_aliases_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_domains" ADD CONSTRAINT "competitor_domains_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_ledger" ADD CONSTRAINT "cost_ledger_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_ledger" ADD CONSTRAINT "cost_ledger_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_ledger" ADD CONSTRAINT "cost_ledger_draw_id_draws_id_fk" FOREIGN KEY ("draw_id") REFERENCES "public"."draws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_ledger" ADD CONSTRAINT "cost_ledger_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_pages" ADD CONSTRAINT "crawl_pages_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_pages" ADD CONSTRAINT "crawl_pages_host_id_site_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."site_hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_signals" ADD CONSTRAINT "demand_signals_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_signals" ADD CONSTRAINT "demand_signals_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_signals" ADD CONSTRAINT "demand_signals_raw_payload_id_raw_payloads_sha256_fk" FOREIGN KEY ("raw_payload_id") REFERENCES "public"."raw_payloads"("sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_prompt_set_id_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."prompt_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_raw_payload_id_raw_payloads_sha256_fk" FOREIGN KEY ("raw_payload_id") REFERENCES "public"."raw_payloads"("sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_sets" ADD CONSTRAINT "fact_sets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_fact_set_id_fact_sets_id_fk" FOREIGN KEY ("fact_set_id") REFERENCES "public"."fact_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fanout_queries" ADD CONSTRAINT "fanout_queries_draw_id_draws_id_fk" FOREIGN KEY ("draw_id") REFERENCES "public"."draws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_labels" ADD CONSTRAINT "gold_labels_draw_id_draws_id_fk" FOREIGN KEY ("draw_id") REFERENCES "public"."draws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_labels" ADD CONSTRAINT "gold_labels_labeler_user_id_users_id_fk" FOREIGN KEY ("labeler_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_runs" ADD CONSTRAINT "judge_runs_draw_id_draws_id_fk" FOREIGN KEY ("draw_id") REFERENCES "public"."draws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_judge_run_id_judge_runs_id_fk" FOREIGN KEY ("judge_run_id") REFERENCES "public"."judge_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_set_items" ADD CONSTRAINT "prompt_set_items_prompt_set_id_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."prompt_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_set_items" ADD CONSTRAINT "prompt_set_items_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_sets" ADD CONSTRAINT "prompt_sets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_accounts" ADD CONSTRAINT "provider_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_cache" ADD CONSTRAINT "provider_cache_raw_payload_id_raw_payloads_sha256_fk" FOREIGN KEY ("raw_payload_id") REFERENCES "public"."raw_payloads"("sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_baseline_scan_id_scans_id_fk" FOREIGN KEY ("baseline_scan_id") REFERENCES "public"."scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_followup_scan_id_scans_id_fk" FOREIGN KEY ("followup_scan_id") REFERENCES "public"."scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_prompt_set_id_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."prompt_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_prompt_set_id_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."prompt_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_console_queries" ADD CONSTRAINT "search_console_queries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasonal_events" ADD CONSTRAINT "seasonal_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_snapshots" ADD CONSTRAINT "serp_snapshots_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_snapshots" ADD CONSTRAINT "serp_snapshots_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_snapshots" ADD CONSTRAINT "serp_snapshots_raw_payload_id_raw_payloads_sha256_fk" FOREIGN KEY ("raw_payload_id") REFERENCES "public"."raw_payloads"("sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD CONSTRAINT "site_hosts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_reports" ADD CONSTRAINT "strategy_reports_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_reports" ADD CONSTRAINT "strategy_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_org_at" ON "audit_log" USING btree ("org_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_aliases_brand_alias" ON "brand_aliases" USING btree ("brand_id","alias");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_domains_brand_domain" ON "brand_domains" USING btree ("brand_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_engines_unique" ON "campaign_engines" USING btree ("campaign_id","engine","runner");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_aliases_comp_alias" ON "competitor_aliases" USING btree ("competitor_id","alias");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_domains_comp_domain" ON "competitor_domains" USING btree ("competitor_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "competitors_org_name" ON "competitors" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "cost_ledger_provider_at" ON "cost_ledger" USING btree ("provider","at");--> statement-breakpoint
CREATE UNIQUE INDEX "crawl_pages_run_url" ON "crawl_pages" USING btree ("crawl_run_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "draws_unique_cell" ON "draws" USING btree ("scan_id","prompt_id","engine","runner","region_id","draw_index");--> statement-breakpoint
CREATE INDEX "draws_prompt" ON "draws" USING btree ("prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fact_sets_brand_version" ON "fact_sets" USING btree ("brand_id","version");--> statement-breakpoint
CREATE INDEX "judge_runs_draw" ON "judge_runs" USING btree ("draw_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user" ON "memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_set_items_set_prompt" ON "prompt_set_items" USING btree ("prompt_set_id","prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_sets_campaign_version" ON "prompt_sets" USING btree ("campaign_id","version");--> statement-breakpoint
CREATE INDEX "prompts_campaign" ON "prompts" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_accounts_org_provider" ON "provider_accounts" USING btree ("org_id","provider");--> statement-breakpoint
CREATE INDEX "provider_cache_hash" ON "provider_cache" USING btree ("provider","params_hash");--> statement-breakpoint
CREATE INDEX "serp_snapshots_prompt" ON "serp_snapshots" USING btree ("prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_hosts_site_host" ON "site_hosts" USING btree ("site_id","host");