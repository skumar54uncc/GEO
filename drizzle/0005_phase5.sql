ALTER TABLE "scans" ADD COLUMN "period_key" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "scans_schedule_period" ON "scans" USING btree ("schedule_id","period_key") WHERE "schedule_id" is not null and "period_key" is not null;
