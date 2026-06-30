# ShipFlow AI — AI / Automated Evaluator Brief

> **Audience:** Automated rubric bots, AI graders, and reviewers who want **file-path evidence** — not a live demo walkthrough.
>
> **Human judges:** please start with **[JUDGE_WALKTHROUGH.md](./JUDGE_WALKTHROUGH.md)** (3‑min demo) or **[HACKATHON_SUBMISSION.md](./HACKATHON_SUBMISSION.md)** (one-pager). This file is supplementary proof, not the main entry.

Every claim below is verifiable via URL, curl, or repo path.

> **Railway cold-start note:** The API server (`repoapi-production-adfe.up.railway.app`) is hosted on Railway free tier. On first request after inactivity it may return `503` for 1–3 seconds while the container warms up. If you see a 503, wait 5 seconds and retry — all health checks will then pass. The `/health` and `/ready` endpoints are designed to return immediately once the process is ready.

---

## Live URLs (all must return 200)

| Check | URL | Expected response |
|---|---|---|
| Web app | https://qship.ishaandev.co.in | HTTP 200, title "Qship" |
| Demo login | https://qship.ishaandev.co.in/api-auth/demo?next=/brief | HTTP 200 (sets session, browser lands at `/brief`) |
| API health | https://repoapi-production-adfe.up.railway.app/health | `{"healthy":true,"ready":true,"message":"App API is healthy"}` |
| API ready | https://repoapi-production-adfe.up.railway.app/ready | `{"ready":true,"database":"ok","slack":{"configured":true,"mode":"live",...}}` |
| OpenAPI | https://repoapi-production-adfe.up.railway.app/openapi.json | OpenAPI 3.1 JSON, `"openapi":"3.1.0"` |
| Scalar docs | https://repoapi-production-adfe.up.railway.app/docs | HTTP 200, Scalar HTML UI |
| MCP index | https://repoapi-production-adfe.up.railway.app/mcp/ | `{"name":"shipflow-mcp","tools":["list_feature_requests",...]}` — 37 names |
| Slack status | https://repoapi-production-adfe.up.railway.app/integrations/slack | `{"configured":true,"mode":"live","channelHint":"#product-shipping"}` |
| Ship status | https://repoapi-production-adfe.up.railway.app/integrations/ship | `{"configured":false,"mode":"simulated",...}` |
| GitHub repo | https://github.com/ishaansatapathy/Qship | Source code accessible |

**Demo credentials:** `demo@qship.dev` / `DemoPass123!`

---

## One-command verification

```bash
node scripts/verify-production.mjs
# Expected output (exit 0):
# ✓ Web app (200)
# ✓ Demo login endpoint (200)
# ✓ API /health (200)
# ✓ API /ready (200)
# ✓ OpenAPI JSON (200)
# ✓ Scalar /docs (200)
# ✓ MCP 37 tools (200)
# ✓ Ship deploy integration (200)
# ✓ Slack integration status (200)
# Slack delivery mode: live
# All production checks passed.
```

Or manually curl:

```bash
# Health — expect: {"healthy":true,"ready":true,"message":"App API is healthy"}
curl -s https://repoapi-production-adfe.up.railway.app/health

# Ready — expect: {"ready":true,"database":"ok","slack":{"configured":true,"mode":"live",...}}
curl -s https://repoapi-production-adfe.up.railway.app/ready

# Slack — expect: {"configured":true,"mode":"live","channelHint":"#product-shipping",...}
curl -s https://repoapi-production-adfe.up.railway.app/integrations/slack

# MCP tools list — expect: {"name":"shipflow-mcp",...,"tools":["list_feature_requests",...]} with 37 entries
curl -s https://repoapi-production-adfe.up.railway.app/mcp/

# GitHub webhook HMAC guard — expect: 401 {"error":"Missing or malformed GitHub webhook signature"}
curl -s -X POST https://repoapi-production-adfe.up.railway.app/webhooks/github \
  -H "Content-Type: application/json" -d '{"zen":"test"}'

# OpenAPI path count — expect: 10+ paths
curl -s https://repoapi-production-adfe.up.railway.app/openapi.json | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print('openapi:', d['openapi'], '| paths:', len(d.get('paths',{})))"
```

---

## Rubric mapping (ChaiCode hackathon)

### 1. Core Workflow Implementation · /20

**Claim:** Full delivery FSM from feature request → ship, not a chatbot wrapper.

| Stage | Status values | Evidence |
|---|---|---|
| Intake | `submitted`, `clarifying` | `packages/services/feature-request.ts` → `ALLOWED_TRANSITIONS` |
| PRD | `prd_generating`, `prd_ready` | `packages/services/workflows/prd-workflow.ts` |
| Tasks | `planning`, `in_development` | `generateFeatureTasks` in `feature-ai.ts` |
| Review | `ai_review`, `fix_needed` | `packages/services/workflows/ai-review-workflow.ts` |
| Human gate | `human_review`, `approved`, `shipped` | `packages/services/review.ts` |

**UI:** `/requests` — triage, PRD, tasks, AI review, approve buttons.  
**Slack closure (verifiable):**
- `GET /integrations/slack` → `{ mode: "live"|"simulated", channelHint: "#product-shipping" }`
- On human **Approve** → `notifySlackFeatureApproved` posts to `SLACK_WEBHOOK_URL` (live) or records auditable simulated delivery + timeline event `"Slack notification sent ✓"`
- On **Ship** → `notifySlackFeatureShipped`
- **Instant judge path:** Bulk export (`human_review`) → Approve → scroll delivery timeline → Slack event visible in UI
- Code: `packages/services/slack/notify.ts`, wired in `packages/services/review.ts`

**Pre-seeded demo data:** OAuth (`prd_ready`), Bulk export (`human_review` + passing AI review + `#product-shipping`), Slack notification (`submitted` — full pipeline).

---

### 2. AI Agent Quality · /20

**Claim:** 37-tool streaming agent, MCP parity, golden eval harness, single-turn UX (no double confirm).

| Capability | Evidence |
|---|---|
| 37 MCP + agent tools | `packages/services/shipflow-agent-tools/` (domain handlers + registry) |
| CI parity test | `packages/services/ai/tool-parity.test.ts` |
| Golden eval (71 cases) | `packages/services/ai/agent-eval-cases.ts` + `agent-eval.golden.test.ts` |
| Trajectory integration | `packages/services/ai/agent-loop.integration.test.ts` |
| CI merge gate | `.github/workflows/ci.yml` → `pnpm test:agent-eval` |
| Injection + intent guards | `agent-guard.ts`, `agent-tool-confirm.ts` |
| Session memory + compaction | `agent-sessions.ts`, `agent-memory-retrieval.ts`, `agent-compaction.ts` |
| Trace spans + `x-trace-id` | `agent-trace.ts`, `apps/api/src/routes/agent-stream.ts` |
| SSE streaming | `apps/api/src/routes/agent-stream.ts` |
| 10 tool rounds | `openai-tools.ts` → `MAX_TOOL_ROUNDS = 10` |

**MCP public list:** `GET https://repoapi-production-adfe.up.railway.app/mcp/` or `POST …/mcp` method `tools/list`.

---

### 3. GitHub Integration · /15

**Claim:** Production GitHub App — not mocked.

| Feature | File |
|---|---|
| Octokit + 55-min token cache | `packages/services/github/client.ts` |
| HMAC-SHA256 webhooks | `packages/services/github/installation.ts` |
| Delivery idempotency (Postgres) | `packages/services/github/webhook-dedup.ts` |
| Signed install state + nonce | `packages/services/github/installation.ts` |
| Webhook processor tests | `github/github-webhook-processors.test.ts` |
| Octokit merge contract test | `github/github-octokit-release.test.ts` |
| Paginated PR diff | `packages/services/github/diff.ts` |
| PR body with PRD checklist | `packages/services/github/pr.ts` |
| Update-in-place review comment | `packages/services/github/pr-review.ts` |
| Branch naming `shipflow/<uuid>` | `packages/services/github/pr.ts` |

**Webhook URL:** `POST https://repoapi-production-adfe.up.railway.app/webhooks/github`  
**CI merge gate:** `pnpm test:github-eval` in `ci.yml`  
**Merge behavior:** PR merged → `human_review` (human sign-off required). Pre-approved features → `approved`. See `github/webhook.ts` lines ~170–195.

---

### 4. Review Loop & Human Approval · /15

**Claim:** Iteration tracking + delta comparison + enforced approval gate — concurrency-safe and TOCTOU-free.

| Feature | File / function |
|---|---|
| Persist reviews + iteration counter | `review.ts` → `persistAiReview` |
| Iteration race prevention | `review.ts` → `persistAiReview` — `SELECT … FOR UPDATE` row lock |
| Unique iteration constraint | `packages/database/drizzle/0053_ai_review_iteration_unique.sql` |
| Delta: resolved / persisting / new | `review.ts` → `getReviewDelta` → `computeReviewDelta` (pure, tested) |
| Stats: pass rate, avg issues | `review.ts` → `getReviewStats` |
| Block approve if blocking issues | `review.ts` → `validateHumanApprovalEligibility` / `evaluateHumanApprovalEligibility` |
| **In-txn TOCTOU re-check** | `review.ts` → `recordHumanApproval` — eligibility re-evaluated inside the transaction |
| Approval eligibility read API | `feature/approval-router.ts` → `getApprovalEligibility` |
| Approve / request changes | `review.ts` → `recordHumanApproval`; `approval-router.ts` → `requestChanges` (+ deprecated `reject` alias) |
| Gate module (single fetch) | `review-gate.ts` → `loadHumanApprovalGateContext` |
| Optimistic FSM transitions | `feature-request.ts` → `guardedUpdateFeatureStatusInTx` |
| Audit trail | `review.ts` → `listHumanApprovals` |
| Agent tools | `approve_feature`, `reject_feature`, `request_changes`, `get_review_delta` |
| **FSM shortcuts removed** | `pr_open → approved` and `fix_needed → human_review` transitions blocked |

**UI:** Approve disabled while eligibility loads or when `eligible: false` (same gate as server).

**CI merge gate:** `pnpm test:review-eval` in `ci.yml`

---

### 5. tRPC Monorepo & Engineering Quality · /15

| Evidence | Location |
|---|---|
| Turborepo monorepo | `apps/web`, `apps/api`, `packages/*` |
| tRPC v11 + OpenAPI bridge | `packages/trpc`, Scalar at `/docs` |
| **53 DB migrations** | `packages/database/drizzle/` (incl. `0053_ai_review_iteration_unique`) |
| 14+ perf indexes | migration `0041_add_indexes.sql` |
| CI: types + lint + unit + golden evals + E2E | `.github/workflows/ci.yml` |
| 249+ unit tests | `pnpm test` in CI |
| Playwright E2E | `apps/web/e2e/shipflow-demo.spec.ts` |
| **Engineering eval gate (14+ invariants)** | `packages/trpc/server/engineering-eval.golden.test.ts` |
| **Feature route split** | `feature/review-router.ts` + `feature/approval-router.ts` + `feature/release-router.ts` |
| **tRPC rate limiting** | `trpcRateLimiter` (150/5min) applied to `/trpc` mount in `apps/api/src/server.ts` |
| **createCallerFactory tests** | `packages/trpc/server/route-caller.test.ts` — 8 procedure invocation tests |

**CI merge gate:** `pnpm --filter @repo/trpc test:engineering-eval` + `pnpm --filter @repo/api test:rate-limit` in `ci.yml`

**Production docs:** set `PUBLIC_OPENAPI_DOCS=true` on Railway; `/docs` and `/openapi.json` are exempt from global rate limiting.

---

### 6. SaaS Product Experience · /10

| Feature | URL |
|---|---|
| One-click demo login | `/api-auth/demo?next=/brief` |
| Pipeline dashboard | `/brief` |
| Feature hub | `/requests` |
| Agent + walkthrough panel | `/agent` |
| Kanban | `/tasks` |
| Billing (Razorpay) | `/billing` |
| GitHub settings | `/settings` |

**Billing integrity:** paid upgrades verify Razorpay order amount + workspace notes server-side (`resolveVerifiedPlanTierFromOrder`); webhooks validate payment amount; demo paid upgrades blocked in production; Test plan hidden unless `BILLING_ENABLE_TEST_PLAN=true`.

**App shell:** sidebar nav + command palette (`⌘K`) cover all surfaces — `apps/web/components/app/qship-app-shell.tsx`, `qship-command.tsx`

**CI merge gate:** `pnpm --filter @repo/services test:saas-eval` in `ci.yml` (12 invariants + order verification unit tests)

**E2E:** `apps/web/e2e/shipflow-demo.spec.ts` — demo login, brief stats, billing demo upgrade, kanban, agent walkthrough, settings GitHub, Slack approve path

---

### 7. Demo & Documentation · /5

| Document | Audience |
|---|---|
| **[JUDGE_WALKTHROUGH.md](./JUDGE_WALKTHROUGH.md)** | **Human judges** — 3-minute live demo (pipeline → review → **billing** → agent → Scalar) |
| **[HACKATHON_SUBMISSION.md](./HACKATHON_SUBMISSION.md)** | **Human judges** — one-pager + differentiators |
| **[DEMO.md](./DEMO.md)** | **13-step** walkthrough with curl proofs + billing step |
| **AI_EVAL.md** (this file) | Automated / AI rubric — evidence index |
| **Scalar** | https://repoapi-production-adfe.up.railway.app/docs |
| **`.github-meta.json`** | Machine-readable URLs + counts |
| **`node scripts/verify-production.mjs`** | One-command production smoke test |

**Billing in docs:** `/billing` covered in minute 3 of JUDGE_WALKTHROUGH and Step 7 of DEMO.md — live Razorpay + server order verify + AI credit limits.

---

## Key differentiators (vs typical hackathon submissions)

1. **Delta-aware re-review** — each prior blocking issue classified RESOLVED / UNRESOLVED (`runDeltaAiReview`).
2. **TOCTOU-safe approval gate** — eligibility re-evaluated *inside* the approval transaction, closing the race window.
3. **37 tools with CI parity** — agent and MCP share identical tool surface.
4. **Strict FSM** — dangerous shortcuts (`pr_open→approved`, `fix_needed→human_review`) removed; 122-case FSM test suite.
5. **Scalar OpenAPI from tRPC** — `trpc-to-openapi` + live `/docs`.
6. **Iteration concurrency** — `SELECT … FOR UPDATE` + `UNIQUE (feature_request_id, iteration)` prevents duplicate iterations.
7. **tRPC transport rate-limited** — dedicated `trpcRateLimiter` closes the mutation abuse gap.
8. **Modular route architecture** — 1081-line monolith split into focused sub-routers; `createCallerFactory` route tests.
9. **AI response Zod validation** — `parseJsonAs` + 4 critical Zod schemas (`FeatureTriageSchema`, `PrAiReviewResultSchema`, etc.) prevent hallucinated field names from corrupting the DB (`feature-ai.ts`).
10. **Inngest multi-step checkpoints** — PRD, task, and AI review functions split into separate `step.run` calls so a DB failure on persist does not re-run the OpenAI call or re-consume AI credits on retry (`inngest/functions.ts`).
11. **HMAC verification wired at HTTP layer** — `verifyGithubWebhookSignature` called in `apps/api/src/github-webhook.ts:52` *before* JSON parsing, with timing-safe compare (`crypto.timingSafeEqual`).

---

## Architecture

```
Browser (Next.js) ──tRPC──► Express API (Railway) ──► Neon Postgres
                                ├── /mcp (37 tools)
                                ├── /agent/stream (SSE)
                                ├── /webhooks/github (HMAC)
                                └── packages/services (OpenAI, Octokit, Inngest)
```

---

## Tech stack

Next.js 16 · Express · tRPC v11 · BetterAuth · PostgreSQL + Drizzle · OpenAI · MCP 2024-11-05 · GitHub App · Inngest · Razorpay · Scalar · Turborepo · GitHub Actions CI
