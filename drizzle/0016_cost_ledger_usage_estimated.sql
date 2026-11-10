-- Flag ledger rows whose units came from the chars/4 estimate, not provider usage.
ALTER TABLE "cost_ledger" ADD COLUMN IF NOT EXISTS "usage_estimated" boolean DEFAULT false NOT NULL;
