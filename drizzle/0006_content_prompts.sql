ALTER TABLE "personas" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "draft_prefix" text;--> statement-breakpoint
CREATE UNIQUE INDEX "personas_key_unique" ON "personas" USING btree ("key") WHERE "key" is not null;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "persona_mode" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "doc_personas" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "suggested_personas" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "prompts_campaign_external" ON "prompts" USING btree ("campaign_id","external_id") WHERE "external_id" is not null;--> statement-breakpoint
ALTER TABLE "prompt_sets" ADD COLUMN "label" text;--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_sets_campaign_label" ON "prompt_sets" USING btree ("campaign_id","label") WHERE "label" is not null;
