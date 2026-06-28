-- Make pull_request_id nullable on ai_reviews so PRD-only reviews (no linked PR)
-- can be persisted to the database, enabling the human-approval gate to work
-- for features that don't have a GitHub PR attached.

ALTER TABLE "ai_reviews"
  ALTER COLUMN "pull_request_id" DROP NOT NULL;
