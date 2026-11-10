-- Gate 3: campaign annotations + owned-citation-stopped alert kind.
ALTER TYPE "alert_kind" ADD VALUE IF NOT EXISTS 'owned_citation_stopped';

CREATE TABLE IF NOT EXISTS "campaign_annotations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id"),
  "kind" text NOT NULL,
  "occurred_on" date NOT NULL,
  "note" text NOT NULL,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "campaign_annotations_kind_check" CHECK (
    "kind" IN ('press_release', 'campaign_launch', 'content_launch')
  )
);

CREATE INDEX IF NOT EXISTS "campaign_annotations_campaign_occurred"
  ON "campaign_annotations" ("campaign_id", "occurred_on");
