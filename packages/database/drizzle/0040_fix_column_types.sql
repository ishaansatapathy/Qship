-- Migration 0040: Fix column type anti-patterns
-- Converts text-encoded booleans/integers to their proper SQL types and
-- introduces two new enum types for billing_status and clarification_role.
--
-- All conversions use USING expressions so existing data is preserved
-- without an intermediate NULL step.

-- ── New enum types ────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE billing_status AS ENUM (
    'active', 'past_due', 'canceled', 'trialing', 'paused'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE clarification_role AS ENUM ('user', 'agent', 'system');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ── organizations ─────────────────────────────────────────────────────────────

-- ai_review_credits: text → integer
ALTER TABLE organizations ALTER COLUMN ai_review_credits DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE organizations
  ALTER COLUMN ai_review_credits TYPE integer
  USING ai_review_credits::integer;
--> statement-breakpoint
ALTER TABLE organizations ALTER COLUMN ai_review_credits SET DEFAULT 10;
ALTER TABLE organizations ALTER COLUMN ai_review_credits SET NOT NULL;
--> statement-breakpoint

-- repository_limit: text → integer
ALTER TABLE organizations ALTER COLUMN repository_limit DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE organizations
  ALTER COLUMN repository_limit TYPE integer
  USING repository_limit::integer;
--> statement-breakpoint
ALTER TABLE organizations ALTER COLUMN repository_limit SET DEFAULT 1;
ALTER TABLE organizations ALTER COLUMN repository_limit SET NOT NULL;
--> statement-breakpoint

-- billing_status: text → billing_status enum
ALTER TABLE organizations ALTER COLUMN billing_status DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE organizations
  ALTER COLUMN billing_status TYPE billing_status
  USING billing_status::text::billing_status;
--> statement-breakpoint
ALTER TABLE organizations ALTER COLUMN billing_status SET DEFAULT 'active';
ALTER TABLE organizations ALTER COLUMN billing_status SET NOT NULL;
--> statement-breakpoint

-- ── clarification_messages ────────────────────────────────────────────────────

-- role: text → clarification_role enum
ALTER TABLE clarification_messages
  ALTER COLUMN role TYPE clarification_role
  USING role::text::clarification_role;
--> statement-breakpoint
ALTER TABLE clarification_messages ALTER COLUMN role SET NOT NULL;
--> statement-breakpoint

-- ── ai_reviews ────────────────────────────────────────────────────────────────

-- ready_for_human: text → boolean
ALTER TABLE ai_reviews ALTER COLUMN ready_for_human DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE ai_reviews
  ALTER COLUMN ready_for_human TYPE boolean
  USING (ready_for_human = 'true');
--> statement-breakpoint
ALTER TABLE ai_reviews ALTER COLUMN ready_for_human SET DEFAULT false;
ALTER TABLE ai_reviews ALTER COLUMN ready_for_human SET NOT NULL;
--> statement-breakpoint

-- ── ai_review_issues ─────────────────────────────────────────────────────────

-- resolved: text → boolean
ALTER TABLE ai_review_issues ALTER COLUMN resolved DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE ai_review_issues
  ALTER COLUMN resolved TYPE boolean
  USING (resolved = 'true');
--> statement-breakpoint
ALTER TABLE ai_review_issues ALTER COLUMN resolved SET DEFAULT false;
ALTER TABLE ai_review_issues ALTER COLUMN resolved SET NOT NULL;
--> statement-breakpoint

-- ── workflow_runs ─────────────────────────────────────────────────────────────

-- progress: text → integer (range [0, 100])
ALTER TABLE workflow_runs ALTER COLUMN progress DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE workflow_runs
  ALTER COLUMN progress TYPE integer
  USING progress::integer;
--> statement-breakpoint
ALTER TABLE workflow_runs ALTER COLUMN progress SET DEFAULT 0;
ALTER TABLE workflow_runs ALTER COLUMN progress SET NOT NULL;
