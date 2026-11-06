ALTER TYPE "public"."demand_source" ADD VALUE IF NOT EXISTS 'llm_mentions';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "source_class_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "domain" text NOT NULL,
  "source_class" "source_class" NOT NULL,
  "kind" text NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "source_class_overrides_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id"),
  CONSTRAINT "source_class_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "source_class_overrides_org_domain" ON "source_class_overrides" USING btree ("org_id","domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_class_overrides_org" ON "source_class_overrides" USING btree ("org_id");
