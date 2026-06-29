-- Drop dead pending-confirmation column and restore prod-safe auto-approve default.
ALTER TABLE "agent_chat_sessions" DROP COLUMN IF EXISTS "pending_confirmation";
ALTER TABLE "shipflow_users" ALTER COLUMN "auto_approve_agent_email" SET DEFAULT false;
