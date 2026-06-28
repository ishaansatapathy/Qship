-- Migration 0041: Add performance indexes
-- Covers all high-frequency query patterns identified in the ShipFlow domain:
-- org-scoped feature listing, Kanban board loading, AI review lookup,
-- webhook routing, and active workflow polling.

-- ── feature_requests ─────────────────────────────────────────────────────────

-- Primary list query: requests for an org filtered/sorted by status.
CREATE INDEX IF NOT EXISTS idx_feature_requests_org_status
  ON feature_requests(organization_id, status);
--> statement-breakpoint

-- Project-scoped request listing.
CREATE INDEX IF NOT EXISTS idx_feature_requests_project_id
  ON feature_requests(project_id);
--> statement-breakpoint

-- Chronological ordering within an org (dashboard default sort).
CREATE INDEX IF NOT EXISTS idx_feature_requests_org_created
  ON feature_requests(organization_id, created_at DESC);
--> statement-breakpoint

-- ── clarification_messages ────────────────────────────────────────────────────

-- All messages for a given feature request (clarification thread load).
CREATE INDEX IF NOT EXISTS idx_clarification_messages_feature_id
  ON clarification_messages(feature_request_id);
--> statement-breakpoint

-- ── engineering_tasks ────────────────────────────────────────────────────────

-- Kanban board: tasks ordered by position within a feature.
CREATE INDEX IF NOT EXISTS idx_engineering_tasks_feature_sort
  ON engineering_tasks(feature_request_id, sort_order);
--> statement-breakpoint

-- Status filter (e.g., "show only in-progress tasks").
CREATE INDEX IF NOT EXISTS idx_engineering_tasks_feature_status
  ON engineering_tasks(feature_request_id, status);
--> statement-breakpoint

-- ── pull_requests ─────────────────────────────────────────────────────────────

-- Feature-scoped PR listing.
CREATE INDEX IF NOT EXISTS idx_pull_requests_feature_id
  ON pull_requests(feature_request_id);
--> statement-breakpoint

-- Repository-scoped PR listing.
CREATE INDEX IF NOT EXISTS idx_pull_requests_repository_id
  ON pull_requests(repository_id);
--> statement-breakpoint

-- Prevents duplicate records from concurrent webhook deliveries.
-- A PR number is unique within a repository.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pull_requests_repo_pr_number
  ON pull_requests(repository_id, github_pr_number);
--> statement-breakpoint

-- ── ai_reviews ────────────────────────────────────────────────────────────────

-- All review iterations for a feature, ordered by time.
CREATE INDEX IF NOT EXISTS idx_ai_reviews_feature_id
  ON ai_reviews(feature_request_id, created_at DESC);
--> statement-breakpoint

-- PR-scoped review lookup (AI review history for a given PR).
CREATE INDEX IF NOT EXISTS idx_ai_reviews_pull_request_id
  ON ai_reviews(pull_request_id);
--> statement-breakpoint

-- ── ai_review_issues ─────────────────────────────────────────────────────────

-- All issues for a review pass.
CREATE INDEX IF NOT EXISTS idx_ai_review_issues_review_id
  ON ai_review_issues(ai_review_id);
--> statement-breakpoint

-- ── workflow_runs ─────────────────────────────────────────────────────────────

-- Active workflow polling: find pending/running runs for a feature.
CREATE INDEX IF NOT EXISTS idx_workflow_runs_feature_status
  ON workflow_runs(feature_request_id, status);
--> statement-breakpoint

-- Inngest event correlation (resume/cancel by event ID).
CREATE INDEX IF NOT EXISTS idx_workflow_runs_inngest_event
  ON workflow_runs(inngest_event_id)
  WHERE inngest_event_id IS NOT NULL;
--> statement-breakpoint

-- ── organizations ─────────────────────────────────────────────────────────────

-- GitHub App webhook routing: match installation ID to org.
CREATE INDEX IF NOT EXISTS idx_organizations_github_installation
  ON organizations(github_installation_id)
  WHERE github_installation_id IS NOT NULL;
--> statement-breakpoint

-- ── repositories ─────────────────────────────────────────────────────────────

-- Dedupe rows sharing the same full_name before adding the unique index.
WITH ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY full_name
      ORDER BY updated_at DESC, created_at DESC
    ) AS keep_id
  FROM repositories
),
dupes AS (
  SELECT id AS dupe_id, keep_id
  FROM ranked
  WHERE id <> keep_id
)
UPDATE pull_requests pr
SET repository_id = d.keep_id
FROM dupes d
WHERE pr.repository_id = d.dupe_id;
--> statement-breakpoint

DELETE FROM repositories r
USING (
  SELECT id AS dupe_id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY full_name
        ORDER BY updated_at DESC, created_at DESC
      ) AS rn
    FROM repositories
  ) x
  WHERE rn > 1
) d
WHERE r.id = d.dupe_id;
--> statement-breakpoint

-- Webhook routing: incoming events carry `repository.full_name`.
CREATE UNIQUE INDEX IF NOT EXISTS idx_repositories_full_name
  ON repositories(full_name);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_repositories_org_id
  ON repositories(organization_id);
