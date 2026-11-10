-- Persist the per-run estimate the editor approved at schedule create (re-estimate gate).
ALTER TABLE "schedules" ADD COLUMN "approved_estimate_usd" numeric;
