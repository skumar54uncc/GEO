CREATE TABLE "calibration_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"scan_id" uuid,
	"month" text NOT NULL,
	"engine" "engine" NOT NULL,
	"primary_runner" "runner" NOT NULL,
	"fallback_runner" "runner" NOT NULL,
	"n_prompts" integer NOT NULL,
	"mention_pairs" integer NOT NULL,
	"mention_agreement" numeric,
	"jaccard_pairs" integer NOT NULL,
	"citation_jaccard_mean" numeric,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canary_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"scan_id" uuid,
	"engine" "engine" NOT NULL,
	"runner" "runner" NOT NULL,
	"provider" text NOT NULL,
	"draw_id" uuid,
	"ok" boolean NOT NULL,
	"reason" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "draws_unique_cell";--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "span_start" integer;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "span_end" integer;--> statement-breakpoint
ALTER TABLE "draws" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "draws" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "draws" ADD COLUMN "experimental" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "draws" ADD COLUMN "params_hash" text;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "latitude" numeric;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "longitude" numeric;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "kind" text DEFAULT 'scan' NOT NULL;--> statement-breakpoint
ALTER TABLE "calibration_runs" ADD CONSTRAINT "calibration_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_runs" ADD CONSTRAINT "calibration_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_runs" ADD CONSTRAINT "calibration_runs_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canary_runs" ADD CONSTRAINT "canary_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canary_runs" ADD CONSTRAINT "canary_runs_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canary_runs" ADD CONSTRAINT "canary_runs_draw_id_draws_id_fk" FOREIGN KEY ("draw_id") REFERENCES "public"."draws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canary_runs_engine_at" ON "canary_runs" USING btree ("engine","at");--> statement-breakpoint
CREATE UNIQUE INDEX "draws_unique_cell" ON "draws" USING btree ("scan_id","prompt_id","engine","runner","region_id","draw_index","attempt");