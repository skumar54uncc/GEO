CREATE TYPE "public"."bot_log_format" AS ENUM('common', 'combined', 'cloudflare_json');--> statement-breakpoint
CREATE TYPE "public"."entity_candidate_kind" AS ENUM('name', 'alias', 'college', 'program', 'research_center', 'ranking_claim', 'location');--> statement-breakpoint
CREATE TYPE "public"."extraction_method" AS ENUM('schema', 'title', 'heading', 'navigation', 'text');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('proposed', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TABLE "audit_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crawl_run_id" uuid NOT NULL,
	"rules_version" text NOT NULL,
	"finding_count" integer NOT NULL,
	"findings_sha256" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_log_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"file_sha256" text NOT NULL,
	"file_name" text,
	"format" "bot_log_format" NOT NULL,
	"lines_total" integer NOT NULL,
	"lines_unparsed" integer NOT NULL,
	"bot_lines" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"crawl_run_id" uuid,
	"kind" "entity_candidate_kind" NOT NULL,
	"value" text NOT NULL,
	"normalized" text NOT NULL,
	"source_url" text NOT NULL,
	"source_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"method" "extraction_method" NOT NULL,
	"evidence" text,
	"details" jsonb,
	"group_label" text,
	"group_source" text,
	"requires_context" boolean DEFAULT false NOT NULL,
	"status" "review_status" DEFAULT 'proposed' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"source" "entity_check_source" NOT NULL,
	"field" text NOT NULL,
	"observed" jsonb,
	"expected" jsonb,
	"status" "entity_check_status" NOT NULL,
	"raw_payload_id" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagespeed_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crawl_run_id" uuid NOT NULL,
	"page_id" uuid,
	"url" text NOT NULL,
	"strategy" text NOT NULL,
	"ok" boolean NOT NULL,
	"performance_score" numeric,
	"metrics" jsonb,
	"raw_payload_id" text,
	"error" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "peer_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"ipeds_unitid" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"state" text,
	"website" text,
	"score" numeric,
	"reasons" jsonb NOT NULL,
	"raw_payload_id" text,
	"status" "review_status" DEFAULT 'proposed' NOT NULL,
	"competitor_id" uuid,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_findings" ADD COLUMN "audit_run_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_hits" ADD COLUMN "host" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "profile" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "competitors" ADD COLUMN "reasons" jsonb;--> statement-breakpoint
ALTER TABLE "crawl_pages" ADD COLUMN "raw_word_count" integer;--> statement-breakpoint
ALTER TABLE "crawl_pages" ADD COLUMN "outbound_links" jsonb;--> statement-breakpoint
ALTER TABLE "crawl_pages" ADD COLUMN "visible_dates" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "crawl_pages" ADD COLUMN "robots_meta" text;--> statement-breakpoint
ALTER TABLE "crawl_pages" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "crawl_pages" ADD COLUMN "fetch_error" text;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD COLUMN "page_cap_per_host" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD COLUMN "host_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD COLUMN "hosts_done" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "discovered_via_all" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "included_by_user" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "resolves" boolean;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "root_status" integer;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "root_final_url" text;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "login_portal" boolean;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "exclude_reason" text;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "robots_status" integer;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "robots_ref" text;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "sitemap_count" integer;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "sitemap_url_count" integer;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "sitemap_ref" text;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "llms_txt_status" integer;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "site_hosts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "discovery" jsonb;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "discovery_error" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "discovered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_runs" ADD CONSTRAINT "audit_runs_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_runs" ADD CONSTRAINT "audit_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_log_imports" ADD CONSTRAINT "bot_log_imports_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_log_imports" ADD CONSTRAINT "bot_log_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_candidates" ADD CONSTRAINT "entity_candidates_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_candidates" ADD CONSTRAINT "entity_candidates_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_candidates" ADD CONSTRAINT "entity_candidates_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_checks" ADD CONSTRAINT "entity_checks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_checks" ADD CONSTRAINT "entity_checks_raw_payload_id_raw_payloads_sha256_fk" FOREIGN KEY ("raw_payload_id") REFERENCES "public"."raw_payloads"("sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagespeed_results" ADD CONSTRAINT "pagespeed_results_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagespeed_results" ADD CONSTRAINT "pagespeed_results_page_id_crawl_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."crawl_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagespeed_results" ADD CONSTRAINT "pagespeed_results_raw_payload_id_raw_payloads_sha256_fk" FOREIGN KEY ("raw_payload_id") REFERENCES "public"."raw_payloads"("sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_suggestions" ADD CONSTRAINT "peer_suggestions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_suggestions" ADD CONSTRAINT "peer_suggestions_raw_payload_id_raw_payloads_sha256_fk" FOREIGN KEY ("raw_payload_id") REFERENCES "public"."raw_payloads"("sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_suggestions" ADD CONSTRAINT "peer_suggestions_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_suggestions" ADD CONSTRAINT "peer_suggestions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bot_log_imports_site_file" ON "bot_log_imports" USING btree ("site_id","file_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_candidates_site_kind_norm" ON "entity_candidates" USING btree ("site_id","kind","normalized");--> statement-breakpoint
CREATE INDEX "entity_checks_brand" ON "entity_checks" USING btree ("brand_id","checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pagespeed_results_run_url" ON "pagespeed_results" USING btree ("crawl_run_id","url","strategy");--> statement-breakpoint
CREATE UNIQUE INDEX "peer_suggestions_site_unitid" ON "peer_suggestions" USING btree ("site_id","ipeds_unitid");--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_findings_run" ON "audit_findings" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "bot_hits_site_bot" ON "bot_hits" USING btree ("site_id","bot_name");