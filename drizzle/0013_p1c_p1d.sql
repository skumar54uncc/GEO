-- P1c: fixture provenance + prompt author. P1d: campaign target + scan analyst note.
ALTER TYPE "provenance" ADD VALUE IF NOT EXISTS 'fixture';

ALTER TABLE "prompts" ADD COLUMN IF NOT EXISTS "author_id" uuid REFERENCES "users"("id");
CREATE INDEX IF NOT EXISTS "prompts_author" ON "prompts" ("author_id") WHERE "author_id" IS NOT NULL;

ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "target" jsonb;

ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "analyst_note" text;
ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "analyst_note_author_id" uuid REFERENCES "users"("id");
ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "analyst_note_at" timestamp with time zone;
ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "analyst_note_status" text;
-- analyst_note_status: null | draft | published. "draft" = AI draft pending editor edit+approval.
