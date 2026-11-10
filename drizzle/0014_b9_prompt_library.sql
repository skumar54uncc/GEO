-- P2 B9: prompt library category + approved-by for CSV/PDF export.
ALTER TABLE "prompts" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE "prompts" ADD COLUMN IF NOT EXISTS "approved_by_id" uuid REFERENCES "users"("id");
CREATE INDEX IF NOT EXISTS "prompts_approved_by" ON "prompts" ("approved_by_id") WHERE "approved_by_id" IS NOT NULL;
