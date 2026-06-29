-- Speed up approval idempotency lookups.
CREATE INDEX IF NOT EXISTS "idx_human_approvals_feature_decision"
  ON "human_approvals" ("feature_request_id", "decision", "created_at" DESC);
