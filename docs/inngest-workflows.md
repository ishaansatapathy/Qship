# Inngest Workflows

Qship uses **Inngest** for all long-running, retry-safe asynchronous operations. The Inngest endpoint is served at `POST /api/inngest` on the Railway API.

**Key design principle:** Every workflow splits the expensive AI call from the database write into separate steps. If the DB write fails and Inngest retries, the AI call is not re-run — the result is memoised in Inngest state. This prevents duplicate AI spend and duplicate data.

---

## Workflow inventory

| Function ID | Trigger | Purpose |
|-------------|---------|---------|
| `shipflow-generate-prd` | `shipflow/prd.generate` event | Generate PRD from feature request |
| `shipflow-generate-tasks` | `shipflow/tasks.generate` event | Convert PRD to engineering tasks |
| `shipflow-ai-review` | `shipflow/ai.review` event | Run AI code review on a PR |
| `shipflow-code-implement` | `shipflow/code.implement` event | AI code generation → GitHub branch → PR |
| `shipflow-github-webhook-outbox` | Cron `*/2 * * * *` | Drain failed webhook deliveries |
| `shipflow-autonomous-pipeline-sweep` | Cron `0 * * * *` | Hourly sweep: triage, duplicates, stale alerts |

---

## PRD Generation (`shipflow-generate-prd`)

```
trigger: feature.dispatchPrdGeneration(featureId)

step 1 — "prd-ai-generation":
  fetchRepoSnippetsForTask(featureId)   // scan linked GitHub repo
  generateFeaturePrd(request, repoContext)  // OpenAI call
  → returns: PrdContent (10 sections)
  memoised: yes (Inngest stores result; retry skips AI call)

step 2 — "prd-persist":
  db.insert(prds, { content: prdContent })
  guardedUpdateFeatureStatus(featureId, "prd_generating", "prd_ready")
  appendFeatureActivity(featureId, "PRD generated")
```

**Error handling:**
- If step 1 fails (OpenAI outage, rate limit): Inngest retries up to 3× with exponential backoff (30s → 60s → 120s)
- If step 2 fails after step 1 succeeded: retried without re-calling OpenAI
- After all retries fail: feature remains in `prd_generating`, activity log updated with error — human can manually retry

---

## Task Generation (`shipflow-generate-tasks`)

```
trigger: feature.dispatchTaskGeneration(featureId)

step 1 — "tasks-ai-generation":
  loadPrd(featureId)
  generateFeatureTasks(prd)   // OpenAI call → 5–9 ordered tasks
  memoised: yes

step 2 — "tasks-persist":
  db.insert(engineeringTasks, [...tasks])
  guardedUpdateFeatureStatus(featureId, "prd_ready", "planning")
```

---

## AI Review (`shipflow-ai-review`)

```
trigger: feature.dispatchAiReview(featureId, pullRequestId?)

step 1 — "review-fetch-diff":
  fetchPullRequestDiff(octokit, owner, repo, prNumber)
  → PullRequestDiff (files, patches, headSha)

step 2 — "review-ai":
  if iteration >= 2:
    runDeltaAiReview(previousReview, newDiff, prd, tasks)  // delta mode
  else:
    runPrAiReview(diff, prd, tasks)   // full review
  → PrAiReviewResult (pass, issues[], checklistResults[])
  memoised: yes

step 3 — "review-persist":
  db.insert(aiReviews, { rawAnalysis, readyForHuman })
  db.insert(aiReviewIssues, [...issues])
  guardedUpdateFeatureStatus(featureId, ..., "ai_review" | "fix_needed" | "human_review")

step 4 — "review-github-comment" (best-effort):
  upsertReviewComment(octokit, prNumber, reviewBody)
  if blocking issues with filePath:
    postInlineAnnotations(octokit, headSha, issues)
  if blocking issues with filePath:
    generateBlockingIssueFixes(diffText, issues)  // AI auto-fix patches
    → post separate GitHub comment
```

Step 4 is fire-and-forget (never blocks the pipeline).

---

## Code Implementation (`shipflow-code-implement`)

```
trigger: feature.dispatchCodeImplementation(featureId, repoId)

step 1 — "impl-generate-code":
  loadPrd(featureId)
  loadTasks(featureId)
  generateImplementationCode(prd, tasks, repoContext)  // OpenAI
  memoised: yes

step 2 — "impl-github":
  createBranch(owner, repo, "shipflow/<featureId>")
  commitFiles(branch, generatedFiles)
  openPullRequest(branch, prTitle, prBody)
  → PR created and linked to feature

step 3 — "impl-persist":
  db.update(featureRequests, { status: "pr_open" })
```

---

## GitHub Webhook Outbox (`shipflow-github-webhook-outbox`)

```
schedule: every 2 minutes  ("*/2 * * * *")
concurrency: 1 (never runs twice simultaneously)

for each undelivered row in github_webhook_outbox:
  re-run handler(event, payload)
  mark delivered = true
  idempotency: delivery_id UNIQUE — safe to run multiple times
```

**Purpose:** If the API is briefly unavailable when GitHub sends a webhook, the raw payload is stored in the outbox and replayed here. This prevents missed PR events from stalling the delivery pipeline.

---

## Autonomous Pipeline Sweep (`shipflow-autonomous-pipeline-sweep`)

```
schedule: every hour  ("0 * * * *")
concurrency: { limit: 1, key: "autonomous-sweep" }
  → only one sweep runs at a time across all instances

for each organization:

  1. AUTO-TRIAGE
     submitted features with no triage result:
       triageFeatureRequest(title, rawRequest)
       db.update(featureRequests, { triageResult, priority, effortEstimate })
       appendFeatureActivity("Auto-triaged by AI agent")

  2. DUPLICATE DETECTION
     recently created features (< 48 hours):
       detectSimilarFeatureRequests(newFeature, activePipeline)
       if hasSimilar:
         appendFeatureActivity("Potential duplicate detected: [link to similar]")

  3. STALE ALERTS
     features not updated in > 7 days:
       appendFeatureActivity("⚠ Stale: no activity for 7+ days. Consider reprioritising.")
```

**Concurrency guard:** The `concurrency: { limit: 1 }` setting means if a sweep is still running when the next cron fires, the new invocation is queued (not duplicated). This prevents:
- Duplicate auto-triage mutations
- Duplicate duplicate-detection alerts
- Thundering herd on OpenAI

---

## In-process fallback (local development)

When `INNGEST_USE_CLOUD=true` is not set, workflows run synchronously in-process using Inngest's serve handler. This means:
- Local development works without an Inngest account
- The identical code path runs — no mocking
- Step memoisation is bypassed (no Inngest state store locally)

To switch to cloud mode:
```env
INNGEST_USE_CLOUD=true
INNGEST_EVENT_KEY=your-event-key
INNGEST_SIGNING_KEY=your-signing-key
```

---

## Retry configuration

```typescript
// All functions
retries: 3,
retryConfig: {
  initialInterval: "30s",
  multiplier: 2,   // 30s → 60s → 120s
}
```

Inngest also supports `cancelOn` for workflow cancellation (e.g. cancel a PRD generation if the user manually changes the feature status).

---

## Workflow progress visibility

Every Inngest step that completes appends an entry to `feature_requests.activity_log`. The delivery timeline in the UI reads this log, so workflow progress is visible in real-time:

```
[AI agent]  PRD generation started
[AI agent]  Repo context fetched: 5 relevant files from github.com/org/repo
[AI agent]  PRD generated (version 1)
[AI agent]  Status → prd_ready
```
