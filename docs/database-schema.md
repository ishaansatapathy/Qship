# Database Schema Notes

Qship uses **PostgreSQL 16** with **Drizzle ORM**. The schema is fully typed — all column types, relations, and enums are defined in `packages/database/schema/` and verified at build time.

**53 migrations · 14 performance indexes · 0 raw SQL in application code**

---

## Core tables

### `organizations`

Tenant root. Every feature, project, member, and GitHub connection is scoped to an org.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `name` | `text` | |
| `slug` | `text` UNIQUE | URL-safe identifier |
| `plan` | `text` | `"free" \| "test" \| "pro" \| "enterprise"` |
| `ai_review_credits` | `integer` | Default 5 (free). Decremented per AI review. |
| `billing_status` | `text` | `"active" \| "trial" \| "cancelled"` |
| `razorpay_payment_id` | `text` | Stored after webhook confirms payment |
| `created_at` | `timestamp` | |
| `updated_at` | `timestamp` | |

### `projects`

One project per org (extensible to multi-project).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` FK → `organizations` | |
| `name` | `text` | |
| `description` | `text` nullable | |

### `feature_requests`

Central entity — drives the entire delivery FSM.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `project_id` | `uuid` FK → `projects` | |
| `organization_id` | `uuid` FK → `organizations` | Denormalised for fast org-scoped queries |
| `title` | `text` | |
| `raw_request` | `text` | Original user submission |
| `source` | `text` | `"web" \| "email" \| "api" \| "github_issue" \| "support" \| "mcp"` |
| `status` | `feature_status` enum | See FSM below |
| `priority` | `text` | `"P0" \| "P1" \| "P2" \| "P3"` — set by AI triage |
| `effort_estimate` | `text` | `"XS" \| "S" \| "M" \| "L" \| "XL"` |
| `triage_result` | `jsonb` | Full AI triage output (stakeholder impact, clarifying questions, risk assessment) |
| `activity_log` | `jsonb[]` | Append-only audit trail of every status change and agent action |
| `created_at` | `timestamp` | |
| `updated_at` | `timestamp` | |

**`feature_status` enum values (delivery FSM):**

```
submitted → clarifying → duplicate_education
         ↘
          prd_generating → prd_ready → planning → in_development
                                                 → pr_open → ai_review
                                                           → fix_needed → ai_review (loop)
                                                           → human_review → approved → shipped
                                                                         → rejected
```

### `prds`

One PRD per feature (replaced on re-generation).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `feature_request_id` | `uuid` FK → `feature_requests` UNIQUE | |
| `content` | `jsonb` | `PrdContent` — 10 sections (problem statement, goals, non-goals, user stories, acceptance criteria, edge cases, success metrics, technical requirements, security requirements, rollback plan) |
| `version` | `integer` | Incremented on re-generation |
| `created_at` | `timestamp` | |

### `engineering_tasks`

Ordered list of tasks generated from the PRD.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `feature_request_id` | `uuid` FK → `feature_requests` | |
| `title` | `text` | |
| `description` | `text` | |
| `type` | `text` | `"backend" \| "frontend" \| "database" \| "testing" \| "devops"` |
| `status` | `text` | `"backlog" \| "todo" \| "in_progress" \| "done"` |
| `order_index` | `integer` | Display order on Kanban |
| `acceptance_criteria` | `text[]` | Per-task checklist (from AI) |
| `estimated_hours` | `integer` | |

### `repositories`

GitHub repos connected to an org. Synced via GitHub App installation.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` FK → `organizations` | |
| `github_repo_id` | `bigint` | GitHub's repo ID (stable across renames) |
| `owner` | `text` | GitHub owner (user or org) |
| `name` | `text` | Repo name |
| `full_name` | `text` | `"owner/name"` |
| `default_branch` | `text` | |
| `private` | `boolean` | |
| `installation_id` | `text` | GitHub App installation ID |

### `pull_requests`

PR rows are created by the GitHub `pull_request` webhook. Not user-entered.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `feature_request_id` | `uuid` FK → `feature_requests` nullable | Auto-linked by branch name pattern `shipflow/<feature-uuid>` |
| `repository_id` | `uuid` FK → `repositories` | |
| `github_pr_number` | `integer` | |
| `title` | `text` | |
| `state` | `text` | `"open" \| "closed" \| "merged"` |
| `url` | `text` | |
| `head_sha` | `text` | Used for inline diff annotations |
| `diff_text` | `text` | Cached diff (fetched on first review) |
| `review_comment_id` | `bigint` | GitHub comment ID for upsert |

### `ai_reviews`

One row per review iteration. Multiple rows per feature (each iteration is preserved for delta comparison).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `feature_request_id` | `uuid` FK → `feature_requests` | |
| `pull_request_id` | `uuid` FK → `pull_requests` nullable | Null for PRD-only reviews |
| `iteration` | `integer` | 1-based, incremented per review run |
| `raw_analysis` | `jsonb` | Full `PrAiReviewResult` (summary, findings, recommendation, pass, severity, 9 checklist dimensions) |
| `ready_for_human` | `boolean` | Computed from `pass` + zero blocking issues |
| `created_at` | `timestamp` | |

### `ai_review_issues`

One row per issue flagged in a review. Tracked individually for resolution.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `ai_review_id` | `uuid` FK → `ai_reviews` | |
| `severity` | `text` | `"blocking" \| "non_blocking"` |
| `category` | `text` | `"security" \| "performance" \| "correctness" \| "tests" \| "requirements" \| "edge_cases" \| "compatibility" \| "code_quality" \| "type_safety"` |
| `title` | `text` | |
| `description` | `text` | |
| `suggestion` | `text` nullable | |
| `file_path` | `text` nullable | For inline diff annotations |
| `line_number` | `text` nullable | |
| `requirement_ref` | `text` nullable | Which acceptance criterion this maps to |
| `resolved` | `boolean` | Developer marks as fixed |
| `resolution_notes` | `text` nullable | |
| `resolved_at` | `timestamp` nullable | |

### `human_approvals`

Audit trail for every human approval decision.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `feature_request_id` | `uuid` FK → `feature_requests` | |
| `reviewer_id` | `uuid` FK → `users` | |
| `decision` | `text` | `"approved" \| "rejected" \| "changes_requested"` |
| `notes` | `text` nullable | Reviewer's comment |
| `ai_review_id` | `uuid` FK → `ai_reviews` nullable | Snapshot of the review that was current at approval |
| `created_at` | `timestamp` | |

### `github_installations`

One row per GitHub App installation (org-level).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` FK → `organizations` | |
| `installation_id` | `text` | GitHub App installation ID |
| `github_account_login` | `text` | GitHub org/user login |
| `suspended` | `boolean` | Set on `installation.suspend` webhook |

### `github_webhook_outbox`

Retry queue for GitHub webhook deliveries that failed during initial processing.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `delivery_id` | `text` UNIQUE | `x-github-delivery` header — prevents double-processing |
| `event` | `text` | `"pull_request" \| "push" \| "issues" \| etc.` |
| `payload` | `jsonb` | Full webhook body |
| `delivered` | `boolean` | Set to true after successful replay |
| `attempts` | `integer` | Number of replay attempts |
| `last_error` | `text` nullable | Last failure reason |
| `created_at` | `timestamp` | |

### `workflow_runs`

Tracks Inngest workflow execution state visible in the UI.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `feature_request_id` | `uuid` FK → `feature_requests` | |
| `workflow_type` | `text` | `"prd_generation" \| "task_generation" \| "ai_review" \| "code_implement"` |
| `status` | `text` | `"pending" \| "running" \| "completed" \| "failed" \| "cancelled"` |
| `inngest_run_id` | `text` nullable | For deep-link to Inngest dashboard |
| `started_at` | `timestamp` | |
| `completed_at` | `timestamp` nullable | |

### `agent_sessions`

Chat history for the Qship Agent (`/agent`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users` | |
| `organization_id` | `uuid` FK → `organizations` | |
| `messages` | `jsonb[]` | Conversation history (role + content) |
| `created_at` | `timestamp` | |
| `updated_at` | `timestamp` | |

### BetterAuth tables

| Table | Purpose |
|-------|---------|
| `users` | Email, name, image, verified flag |
| `sessions` | Session token, expiry, user agent |
| `accounts` | OAuth provider link (Google) |
| `verifications` | Email verification tokens |

---

## Performance indexes

14 indexes cover the query patterns most exercised in production:

| Index | Table | Columns | Purpose |
|-------|-------|---------|---------|
| `idx_fr_project_status` | `feature_requests` | `(project_id, status)` | Pipeline board — list by stage |
| `idx_fr_org_created` | `feature_requests` | `(organization_id, created_at DESC)` | Recent features per org |
| `idx_fr_status` | `feature_requests` | `(status)` | Autonomous sweep (submitted features) |
| `idx_ai_reviews_feature` | `ai_reviews` | `(feature_request_id, created_at DESC)` | Latest review lookup |
| `idx_ai_issues_review` | `ai_review_issues` | `(ai_review_id)` | Issues per review |
| `idx_ai_issues_resolved` | `ai_review_issues` | `(resolved, severity)` | Blocking issue count |
| `idx_pr_feature` | `pull_requests` | `(feature_request_id)` | PR lookup for a feature |
| `idx_pr_repo_number` | `pull_requests` | `(repository_id, github_pr_number)` | Webhook dedup |
| `idx_repos_org` | `repositories` | `(organization_id)` | Repo list per org |
| `idx_repos_github_id` | `repositories` | `(github_repo_id)` | GitHub ID dedup on sync |
| `idx_ha_feature` | `human_approvals` | `(feature_request_id, created_at DESC)` | Approval history |
| `idx_tasks_feature` | `engineering_tasks` | `(feature_request_id, order_index)` | Ordered task board |
| `idx_outbox_delivered` | `github_webhook_outbox` | `(delivered, created_at)` | Outbox drain query |
| `idx_sessions_user` | `agent_sessions` | `(user_id, updated_at DESC)` | Session restore |

---

## Migrations

All 53 migrations live in `packages/database/migrations/`. They are applied automatically on API boot via `drizzle-kit migrate`. The migration history is append-only — no destructive `DROP` without a preceding `ALTER`.

```bash
# Apply all pending migrations
pnpm db:migrate

# Generate migration after schema change
pnpm db:generate

# Visual DB inspector
pnpm db:studio
```

---

## Drizzle ORM usage patterns

**Query builder (no raw SQL):**

```typescript
import { eq, desc, and, ne } from "@repo/database";
import db from "@repo/database";

// Type-safe — TypeScript error if column doesn't exist
const features = await db.query.featureRequests.findMany({
  where: and(
    eq(featureRequests.projectId, projectId),
    ne(featureRequests.status, "shipped"),
  ),
  orderBy: [desc(featureRequests.createdAt)],
  with: { prd: true, tasks: true, pullRequests: true },
});
```

**Transactions with row-level locks (for FSM transitions):**

```typescript
await withTransaction(async (tx) => {
  // SELECT ... FOR UPDATE via Drizzle
  const row = await tx.query.featureRequests.findFirst({
    where: eq(featureRequests.id, id),
    columns: { status: true },
  });
  await guardedUpdateFeatureStatusInTx(tx, id, "approved", "shipped");
});
```

The FSM transition guard (`guardedUpdateFeatureStatusInTx`) checks the current status inside the transaction — this prevents race conditions where two concurrent approval clicks both succeed.
