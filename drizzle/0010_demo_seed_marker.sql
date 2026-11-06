-- Additive demo/fixture seed marker. NULL = real or unmarked. Never rewrite existing rows.
ALTER TABLE "raw_payloads" ADD COLUMN "seed_marker" text;
ALTER TABLE "draws" ADD COLUMN "seed_marker" text;
ALTER TABLE "recommendations" ADD COLUMN "seed_marker" text;
ALTER TABLE "strategy_reports" ADD COLUMN "seed_marker" text;
ALTER TABLE "cost_ledger" ADD COLUMN "seed_marker" text;

CREATE INDEX "draws_seed_marker" ON "draws" ("seed_marker") WHERE "seed_marker" IS NOT NULL;
CREATE INDEX "recommendations_seed_marker" ON "recommendations" ("seed_marker") WHERE "seed_marker" IS NOT NULL;
CREATE INDEX "strategy_reports_seed_marker" ON "strategy_reports" ("seed_marker") WHERE "seed_marker" IS NOT NULL;
CREATE INDEX "cost_ledger_seed_marker" ON "cost_ledger" ("seed_marker") WHERE "seed_marker" IS NOT NULL;
CREATE INDEX "raw_payloads_seed_marker" ON "raw_payloads" ("seed_marker") WHERE "seed_marker" IS NOT NULL;
