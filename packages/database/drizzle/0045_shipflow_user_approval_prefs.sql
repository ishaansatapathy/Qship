ALTER TABLE "shipflow_users" ADD COLUMN IF NOT EXISTS "auto_approve_email" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "shipflow_users" ADD COLUMN IF NOT EXISTS "auto_approve_agent_email" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "shipflow_users" ADD COLUMN IF NOT EXISTS "auto_approve_calendar" boolean DEFAULT false NOT NULL;
