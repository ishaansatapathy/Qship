ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "github_installation_id" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "github_account_login" text;
