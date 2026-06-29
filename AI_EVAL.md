# ShipFlow AI — AI / Automated Evaluator Brief

> **For strict rubric scoring without a live walkthrough.** Every claim below is verifiable via URL, curl, or file path in the repo.

---

## Live URLs (all must return 200)

| Check | URL | Expected |
|---|---|---|
| Web app | https://qship.ishaandev.co.in | HTTP 200 |
| Demo login | https://qship.ishaandev.co.in/api-auth/demo?next=/brief | Redirect → `/brief` |
| API health | https://repoapi-production-adfe.up.railway.app/health | `healthy: true` |
| API ready | https://repoapi-production-adfe.up.railway.app/ready | `ready: true` |
| OpenAPI | https://repoapi-production-adfe.up.railway.app/openapi.json | OpenAPI 3.1 JSON |
| Scalar docs | https://repoapi-production-adfe.up.railway.app/docs | Scalar UI |
| MCP index | https://repoapi-production-adfe.up.railway.app/mcp/ | JSON with **37** tool names |
| Slack status | https://repoapi-production-adfe.up.railway.app/integrations/slack | `{ mode, channelHint }` |
| GitHub repo | https://github.com/ishaansatapathy/Qship | Source code |

**Demo credentials:** `demo@qship.dev` / `DemoPass123!`

---

## One-command verification

```bash
node scripts/verify-production.mjs
```

Or manually:

```bash
curl -fsS https://repoapi-production-adfe.up.railway.app/health
curl -fsS https://repoapi-production-adfe.up.railway.app/ready
curl -fsS https://repoapi-production-adfe.up.railway.app/openapi.json >/dev/null
curl -fsS https://repoapi-production-adfe.up.railway.app/docs >/dev/null
curl -fsS https://repoapi-production-adfe.up.railway.app/integrations/slack
curl -s https://repoapi-production-adfe.up.railway.app/mcp/ | grep -o '"tools":\[.*\]' | tr ',' '\n' | wc -l
# Expect: 37 tools in array
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
| Golden eval (49 cases) | `packages/services/ai/agent-eval-cases.ts` + `agent-eval.golden.test.ts` |
| Trajectory integration | `packages/services/ai/agent-loop.integration.test.ts` |
| CI merge gate | `.github/workflows/ci.yml` → `pnpm test:agent-eval` |
| Injection + intent guards | `agent-guard.ts`, `agent-tool-confirm.ts` |
| Session memory + compaction | `agent-sessions.ts`, `agent-memory-retrieval.ts`, `agent-compaction.ts` |
| Trace spans + `x-trace-id` | `agent-trace.ts`, `apps/api/src/routes/agent-stream.ts` |
| SSE streaming | `apps/api/src/routes/agent-stream.ts` |
| 8 tool rounds | `openai-tools.ts` → `MAX_TOOL_ROUNDS = 8` |

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
| Paginated PR diff | `packages/services/github/diff.ts` |
| PR body with PRD checklist | `packages/services/github/pr.ts` |
| Update-in-place review comment | `packages/services/github/pr-review.ts` |
| Branch naming `shipflow/<uuid>` | `packages/services/github/pr.ts` |

**Webhook URL:** `POST https://repoapi-production-adfe.up.railway.app/webhooks/github`  
**CI merge gate:** `pnpm test:github-eval` in `ci.yml`  
**Merge behavior:** PR merged → `human_review` (human sign-off required). Pre-approved features → `approved`. See `github/webhook.ts` lines ~170–195.

---

### 4. Review Loop & Human Approval · /15

**Claim:** Iteration tracking + delta comparison + enforced approval gate.

| Feature | File / function |
|---|---|
| Persist reviews + iteration counter | `review.ts` → `persistAiReview` |
| Delta: resolved / persisting / new | `review.ts` → `getReviewDelta` |
| Stats: pass rate, avg issues | `review.ts` → `getReviewStats` |
| Block approve if blocking issues | `review.ts` → `validateHumanApprovalEligibility` |
| Approve / reject / changes | `review.ts` → `recordHumanApproval` |
| Audit trail | `review.ts` → `listHumanApprovals` |
| Agent tools | `approve_feature`, `reject_feature`, `request_changes`, `get_review_delta` |

**UI:** Approve button disabled when AI has unresolved blocking issues (same validation as agent tool).

---

### 5. tRPC Monorepo & Engineering Quality · /15

| Evidence | Location |
|---|---|
| Turborepo monorepo | `apps/web`, `apps/api`, `packages/*` |
| tRPC v11 + OpenAPI bridge | `packages/trpc`, Scalar at `/docs` |
| 43 DB migrations | `packages/database/drizzle/` |
| 14 perf indexes | migration `0041_add_indexes.sql` |
| CI: types + lint + unit + agent eval + E2E | `.github/workflows/ci.yml` |
| 249+ unit tests | `pnpm test` in CI |
| Playwright E2E | `apps/web/e2e/shipflow-demo.spec.ts` |

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

---

### 7. Demo & Documentation · /5

| Document | Purpose |
|---|---|
| **AI_EVAL.md** (this file) | Automated / AI rubric scoring |
| **HACKATHON_SUBMISSION.md** | One-pager + differentiators |
| **JUDGE_WALKTHROUGH.md** | Timed demo script |
| **DEMO.md** | Full step-by-step |
| **Scalar** | https://repoapi-production-adfe.up.railway.app/docs |
| **`.github-meta.json`** | Machine-readable URLs + counts |

---

## Key differentiators (vs typical hackathon submissions)

1. **Delta-aware re-review** — each prior blocking issue classified RESOLVED / UNRESOLVED (`runDeltaAiReview`).
2. **Approval gate at all entry points** — UI, tRPC, and agent tool (`validateHumanApprovalEligibility`).
3. **37 tools with CI parity** — agent and MCP share identical tool surface.
4. **FSM-validated workflow** — illegal status jumps rejected (`guardedUpdateFeatureStatus`).
5. **Scalar OpenAPI from tRPC** — `trpc-to-openapi` + live `/docs`.

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
