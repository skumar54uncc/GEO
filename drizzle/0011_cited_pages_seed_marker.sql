-- Demo/fixture seed marker on cited_pages (global by canonical URL). NULL = real or unmarked.
ALTER TABLE "cited_pages" ADD COLUMN "seed_marker" text;
CREATE INDEX "cited_pages_seed_marker" ON "cited_pages" ("seed_marker") WHERE "seed_marker" IS NOT NULL;
