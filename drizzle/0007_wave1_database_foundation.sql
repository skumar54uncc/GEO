CREATE TYPE "public"."citation_fetch_status" AS ENUM('pending', 'fetched', 'blocked', 'error', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."recommendation_lever" AS ENUM('technical', 'on_page', 'truth_layer', 'listing', 'earned_media', 'community', 'original_data');--> statement-breakpoint
CREATE TYPE "public"."evidence_grade" AS ENUM('A', 'B', 'C', 'D');--> statement-breakpoint
ALTER TYPE "public"."scan_status" ADD VALUE IF NOT EXISTS 'paused';--> statement-breakpoint

ALTER TABLE "organizations" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "theme_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint

ALTER TABLE "personas" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "typical_questions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint

ALTER TABLE "prompts" ADD COLUMN "embedding_dimension" integer;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_embedding_dimension_positive" CHECK ("embedding_dimension" IS NULL OR "embedding_dimension" > 0);--> statement-breakpoint
ALTER TABLE "crawl_pages" ADD COLUMN "embedding_dimension" integer;--> statement-breakpoint
ALTER TABLE "crawl_pages" ADD CONSTRAINT "crawl_pages_embedding_dimension_positive" CHECK ("embedding_dimension" IS NULL OR "embedding_dimension" > 0);--> statement-breakpoint
ALTER TABLE "cited_pages" ADD COLUMN "embedding_dimension" integer;--> statement-breakpoint
ALTER TABLE "cited_pages" ADD CONSTRAINT "cited_pages_embedding_dimension_positive" CHECK ("embedding_dimension" IS NULL OR "embedding_dimension" > 0);--> statement-breakpoint

ALTER TABLE "cited_pages" ADD COLUMN "fetch_status" "citation_fetch_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "cited_pages" ADD COLUMN "fetch_error" text;--> statement-breakpoint
ALTER TABLE "cited_pages" ADD COLUMN "robots_result" jsonb;--> statement-breakpoint
ALTER TABLE "cited_pages" ADD COLUMN "fetch_user_agent" text;--> statement-breakpoint
ALTER TABLE "cited_pages" ADD COLUMN "outbound_links" jsonb;--> statement-breakpoint
ALTER TABLE "cited_pages" ADD COLUMN "structured_features" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint

ALTER TABLE "recommendations" ADD COLUMN "lever_type" "recommendation_lever";--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "owner" text;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "evidence_grade" "evidence_grade";--> statement-breakpoint

ALTER TABLE "scans" ADD COLUMN "stop_loss_config" jsonb DEFAULT '{"first_draws":60,"error_or_blocked_rate":0.2,"cost_over_estimate_rate":0.25}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "paused_reason" text;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint

CREATE INDEX "draws_scan_dashboard" ON "draws" USING btree ("scan_id","engine","runner","status");--> statement-breakpoint
CREATE INDEX "judge_runs_draw_latest" ON "judge_runs" USING btree ("draw_id","seq" DESC);--> statement-breakpoint
CREATE INDEX "mentions_judge_run" ON "mentions" USING btree ("judge_run_id");--> statement-breakpoint
CREATE INDEX "claims_judge_run" ON "claims" USING btree ("judge_run_id");--> statement-breakpoint
CREATE INDEX "citations_draw" ON "citations" USING btree ("draw_id");--> statement-breakpoint
CREATE INDEX "citations_canonical_url" ON "citations" USING btree ("canonical_url") WHERE "canonical_url" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "fanout_queries_draw" ON "fanout_queries" USING btree ("draw_id");--> statement-breakpoint
CREATE INDEX "scans_campaign_created" ON "scans" USING btree ("campaign_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "cost_ledger_org_at" ON "cost_ledger" USING btree ("org_id","at" DESC);--> statement-breakpoint
CREATE INDEX "alerts_org_status_created" ON "alerts" USING btree ("org_id","status","created_at" DESC);--> statement-breakpoint
CREATE INDEX "alerts_campaign_status_created" ON "alerts" USING btree ("campaign_id","status","created_at" DESC) WHERE "campaign_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "demand_signals_campaign_source_fetched" ON "demand_signals" USING btree ("campaign_id","source","fetched_at" DESC);--> statement-breakpoint
CREATE INDEX "prompts_campaign_status_persona" ON "prompts" USING btree ("campaign_id","status","persona_id");--> statement-breakpoint
CREATE INDEX "recommendations_campaign_status" ON "recommendations" USING btree ("campaign_id","status","created_at" DESC);--> statement-breakpoint
CREATE INDEX "recommendations_campaign_lever" ON "recommendations" USING btree ("campaign_id","lever_type") WHERE "lever_type" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "strategy_reports_campaign_created" ON "strategy_reports" USING btree ("campaign_id","created_at" DESC);
