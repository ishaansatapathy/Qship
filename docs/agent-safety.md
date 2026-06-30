# Agent Safety & Production Guardrails

Qship runs AI agents continuously — in real-time request handlers, background Inngest sweeps, and a 37-tool MCP server. Every layer has explicit defences against abuse, runaway costs, hallucination, and prompt injection.

---

## 1. Prompt Injection Defence

**File:** `apps/api/src/agent/safety.ts` → `detectPromptInjection`

All user-supplied text that enters an agent prompt is scanned before the LLM call:

```
patterns checked (case-insensitive):
  "ignore previous instructions"
  "disregard your system prompt"
  "you are now DAN"
  "act as an unrestricted"
  "jailbreak"
  "SYSTEM:" injected mid-turn
  "###INSTRUCTIONS"
  … 12+ more patterns
```

- If a match is found → `{ injectionDetected: true, reason: "..." }` is returned.
- The agent route returns HTTP 400 with a stable error code `PROMPT_INJECTION_DETECTED` before any token is spent.
- **Deny-by-default:** unrecognised edge-cases that slip through are caught by the token budget (§ 5) and the output sanitiser (§ 6).

---

## 2. Rate Limiting

### Per-user agent rate limit

**File:** `apps/api/src/agent/rate-limit.ts`

| Window | Limit | Enforcement |
|--------|-------|-------------|
| 1 minute | 20 requests | sliding window |
| 1 hour | 200 requests | sliding window |

Implementation:
- **Primary:** Redis distributed counter (`REDIS_URL` configured) — survives multi-instance deploys.
- **Fallback:** In-memory LRU cache (single-node, used in dev/staging when Redis is unavailable).
- Requests that exceed the limit → HTTP 429 with `Retry-After` header.
- The fallback is explicitly logged (`rate_limit.fallback_to_memory`) so ops can detect Redis outages.

### Global API rate limiting

**File:** `apps/api/src/middleware/rate-limit.ts`

Express `express-rate-limit` middleware applied to:
- `/agent/stream` — 20 req/min per IP
- `/trpc` — 100 req/min per IP  
- `/webhooks/github` — 60 req/min (HMAC auth still required)
- `/mcp` — 30 req/min per IP

### AI review credit limits

**File:** `packages/services/review.ts` → `consumeAiReviewCredit`

Each organisation has an `aiReviewCredits` counter in Postgres.

| Plan | Credits/month |
|------|--------------|
| Free | 5 |
| Test (₹19) | 20 |
| Pro (₹999) | 100 |
| Enterprise | Unlimited |

`consumeAiReviewCredit` runs inside a database transaction with a `FOR UPDATE` row lock — prevents double-spend under concurrent requests. Credits below 0 → `ServiceError("PAYMENT_REQUIRED")` before any OpenAI call.

---

## 3. Retry Mechanisms

### Inngest built-in retry

Every Inngest function declares explicit retry config:

```typescript
retries: 3,
retryConfig: { initialInterval: "30s", multiplier: 2 }
```

The OpenAI call and the DB write are in **separate steps**:
```
step 1: AI call  → memoised by Inngest on success
step 2: DB write → retried without re-calling OpenAI
```

This means a failed DB write never results in a duplicate AI call or extra OpenAI spend.

### GitHub webhook outbox (2-minute cron)

**File:** `packages/services/inngest/functions.ts` → `githubWebhookOutboxFunction`

Failed webhook deliveries (e.g. GitHub sends event while DB is temporarily unavailable) are stored in a `github_webhook_outbox` Postgres table. A 2-minute Inngest cron drains the outbox:

```
every 2 minutes:
  SELECT * FROM github_webhook_outbox WHERE delivered = false ORDER BY created_at
  FOR EACH: re-run handler → mark delivered
  Idempotency: delivery_id prevents double-processing
```

### HTTP client retries

All outgoing HTTP calls (OpenAI, Slack webhook, deploy webhook) use `node-fetch` with a 30s timeout. Network errors surface as `ServiceError("INTERNAL")` — they do not silently swallow failures.

---

## 4. Fallback Strategies

### AI brief fallback

**File:** `packages/services/pipeline-overview.ts` → `buildFallbackBrief`

If the OpenAI call for the AI Morning Brief fails (network error, quota exceeded, etc.), a deterministic text brief is built from the database state:

```typescript
// No AI call — pure data
"${n} features active · ${blocking} blocking issues · next: [action item from DB]"
```

The UI always renders — it never shows an empty state due to an AI failure.

### PRD generation fallback

If `generateFeaturePrd` throws, the Inngest step fails and is retried (up to 3×). After all retries fail, the feature status is set to `prd_generating` (not errored) and an activity log entry is appended, so a human can manually trigger regeneration.

### Rate limit fallback (Redis → memory)

```typescript
if (!redisAvailable) {
  logger.warn("rate_limit.fallback_to_memory", { reason });
  return checkInMemoryRateLimit(userId);
}
```

The fallback does not silently remove rate limiting — it degrades to single-node enforcement.

### GitHub API fallback

If the GitHub API is unreachable when trying to post a review comment:
- The review result is **still persisted to the database**.
- The GitHub comment failure is logged as `pr_review.github_comment_failed`.
- The feature pipeline continues — human review gate is not blocked by a comment delivery failure.

---

## 5. Token Budget Enforcement

**File:** `apps/api/src/agent/safety.ts` → `enforceTokenBudget`

Each agent conversation is limited to a maximum context window before the agent is gracefully stopped:

| Model | Max input tokens | Max output tokens |
|-------|-----------------|------------------|
| gpt-4o-mini | 100,000 | 4,096 |

If the conversation history would exceed the limit:
1. Older messages are pruned (LRU — system prompt is always kept).
2. If even the system prompt + current turn exceeds the limit → `ServiceError("CONTEXT_LIMIT_EXCEEDED")`.
3. The agent responds with a user-readable error ("This conversation is too long — please start a new session") rather than silently truncating.

---

## 6. Output Sanitisation

**File:** `packages/services/feature-ai.ts` → `parseJsonAs`

Every AI response is parsed through a **Zod schema** before being stored or returned. If the AI returns:
- Unexpected fields → stripped (Zod `strip` mode)
- Missing required fields → defaults applied or `ServiceError` thrown
- Malformed JSON → `parseJsonAs` throws, step is retried by Inngest

Example schemas:
- `FeatureAiReviewSchema` — validates all 9 checklist dimensions, enforces `pass: boolean`
- `FeatureTriageSchema` — enforces priority in `["P0","P1","P2","P3"]`, effort in `["XS","S","M","L","XL"]`
- `PrdContentSchema` — 10 required sections, array defaults, `rollbackPlan: string`

**Hallucination guard on triage:** Priority and effort are constrained enum values. The AI cannot invent a new severity level.

---

## 7. Feature Scoping (Workspace Isolation)

**File:** `packages/services/feature-request.ts` → `assertFeatureInUserWorkspace`

Every agent tool call that accesses a feature runs:

```typescript
async function assertFeatureInUserWorkspace(featureId: string, userId: string) {
  const row = await db.query.featureRequests.findFirst({ where: eq(...) });
  if (!row) throw new ServiceError("NOT_FOUND", "Feature not found");
  const member = await db.query.organizationMembers.findFirst({ where: ... });
  if (!member) throw new ServiceError("FORBIDDEN", "Feature not in your workspace");
  return row;
}
```

This prevents any agent (or MCP client) from reading or mutating features belonging to another organisation, even if the feature ID is known.

---

## 8. GitHub Webhook HMAC Verification

**File:** `apps/api/src/github-webhook.ts`

```typescript
const sig = req.headers["x-hub-signature-256"];
const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
  return res.status(401).json({ error: "invalid_signature" });
}
```

- Uses `crypto.timingSafeEqual` (not `===`) to prevent timing-based signature forgery.
- `rawBody` is captured before any JSON parsing — avoids body-transform attacks.
- **Delivery ID idempotency:** `x-github-delivery` header stored; duplicate IDs return 200 without re-processing.

---

## 9. Human-in-the-Loop Gates

The system is designed so **AI is advisory, humans are final decision-makers**:

| Decision | Who decides | Mechanism |
|----------|------------|-----------|
| PRD approved for tasks | Human (PM/dev) | `prd_ready → planning` requires explicit approval in UI |
| Code shipped to production | Human (reviewer) | `approved → shipped` blocked until human clicks "Mark shipped" |
| Feature rejected | Human (reviewer) | `reject_feature` tRPC — AI cannot self-reject |
| AI review blocking | AI flags, human resolves | `resolved` field on each issue, human marks it done |

`validateHumanApprovalEligibility` is a **server-side** check (not just UI): even a direct API call to `approveFeature` fails with `PRECONDITION_FAILED` if blocking issues exist.

---

## 10. Autonomous Agent Concurrency Control

**File:** `packages/services/inngest/functions.ts` → `autonomousPipelineSweepFunction`

The hourly autonomous sweep uses Inngest concurrency limiting:

```typescript
concurrency: { limit: 1, key: "autonomous-sweep" }
```

Only one sweep runs at a time per deployment. If a sweep is still running when the next cron fires, the new run is queued (not duplicated). This prevents:
- Duplicate auto-triage mutations
- Duplicate duplicate-detection alerts
- Thundering herd on the OpenAI API

---

## 11. MCP API Key Binding

**File:** `apps/api/src/mcp/auth.ts`

MCP headless access requires:
```
Authorization: Bearer <SHIPFLOW_MCP_API_KEY>
```

The key is **bound to a single `SHIPFLOW_MCP_USER_ID`** in `.env`. There is no per-key permission scope — each deployment has one MCP key for one user. This prevents key sharing from escalating privileges across organisations.

---

## Summary

| Threat | Mitigation | Layer |
|--------|-----------|-------|
| Prompt injection | Pattern detection before LLM call | API middleware |
| API abuse | Sliding-window rate limits (Redis primary, memory fallback) | Express + agent middleware |
| AI runaway cost | Credit limits (DB-locked), token budget, per-request model cap | Services layer |
| Retry storms | Inngest step memoisation, concurrency limit (1) on sweep | Inngest |
| Webhook replay | Delivery-ID idempotency + HMAC-SHA256 timing-safe | Webhook handler |
| Cross-tenant data access | `assertFeatureInUserWorkspace` on every tool call | Services layer |
| Hallucination / bad output | Zod schema validation on every AI response | AI parsing layer |
| Partial failure | AI result and DB write in separate Inngest steps | Inngest workflow |
| GitHub comment failure | DB write first, comment best-effort, never blocks pipeline | PR review service |
| AI outage | Deterministic fallback briefs, status preserved, human can retry | Pipeline overview + Inngest |
