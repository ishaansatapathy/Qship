-- Default agent auto-approve ON for new users (matches settings FALLBACK + demo UX).
ALTER TABLE "shipflow_users" ALTER COLUMN "auto_approve_agent_email" SET DEFAULT true;
