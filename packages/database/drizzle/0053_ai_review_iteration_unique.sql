-- Enforce monotonic, non-duplicate iteration numbers per feature review cycle.
-- The SELECT … FOR UPDATE in persistAiReview serialises concurrent reviews;
-- this constraint is a last-line-of-defence safety net that prevents silent
-- data corruption if the advisory lock is ever bypassed.
ALTER TABLE "ai_reviews"
  ADD CONSTRAINT "ai_reviews_feature_request_iteration_unique"
  UNIQUE ("feature_request_id", "iteration");
