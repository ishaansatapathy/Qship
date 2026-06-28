# ShipFlow AI — Demo Guide

> **Evaluating?** Jump directly to [Judge Walkthrough](#judge-walkthrough-12-steps) below.
> Timed 3-minute path: **[JUDGE_WALKTHROUGH.md](./JUDGE_WALKTHROUGH.md)**
> Rubric map: **[HACKATHON_SUBMISSION.md](./HACKATHON_SUBMISSION.md)**

---

## Live URLs (verify these first)

```bash
# All three must return 200
curl -fsS https://qship.ishaandev.co.in              # Web app
curl -fsS https://api.qship.ishaandev.co.in/health  # API liveness
curl -fsS https://api.qship.ishaandev.co.in/ready   # API + DB readiness
```

| Service | URL | Auth |
|---|---|---|
| Web app | https://qship.ishaandev.co.in | — |
| **One-click demo login** | https://qship.ishaandev.co.in/api-auth/demo?next=/brief | none |
| Scalar API docs | https://api.qship.ishaandev.co.in/docs | none |
| API health | https://api.qship.ishaandev.co.in/health | none |
| API readiness | https://api.qship.ishaandev.co.in/ready | none |
| OpenAPI JSON | https://api.qship.ishaandev.co.in/openapi.json | none |
| MCP server | `POST https://api.qship.ishaandev.co.in/mcp` | none for `tools/list` |

---

## One-click login

Open in browser → automatically signs in as the demo user:

```
https://qship.ishaandev.co.in/api-auth/demo?next=/brief
```

| Field | Value |
|---|---|
| Email | `demo@qship.dev` |
| Password | `DemoPass123!` |

---

## Judge walkthrough — 12 steps

### Step 1 · Pipeline overview (`/brief`)

> **URL:** https://qship.ishaandev.co.in/brief

After demo login you land here. You'll see:
- Counts of features by pipeline stage (submitted, in PRD, in review, shipped)
- The core delivery loop diagram
- Quick-access links to pending actions

**What to observe:** Real-time pipeline health at a glance — like a PM's control tower.

---

### Step 2 · Submit a feature request (`/requests`)

> **URL:** https://qship.ishaandev.co.in/requests

Click **"+ New request"** and submit:

```
Title: Rate limiting on authentication endpoints
Request: We're seeing brute-force login attempts from multiple IPs.
         We need per-IP rate limiting on /sign-in and /mfa endpoints
         with exponential backoff, configurable thresholds, and Redis-backed
         counters. Lockout after 10 failures in 5 minutes. Alert on repeated lockouts.
```

**What to observe:** Automatic **duplicate capability check** fires before creation. New feature appears in `submitted` status.

---

### Step 3 · AI triage

On the new feature, click **"Run Triage"**.

**What to observe:**
- Priority: P0 (security) with risk factors enumerated
- `riskLevel: critical`, `breakingChangeRisk: true`
- 2–3 clarifying questions generated
- `stakeholderImpact` covering security + engineering + compliance

---

### Step 4 · Generate PRD

Click **"Generate PRD"**.

**What to observe (new in this version):**
- `problemStatement` — cites actual user pain
- `goals` — 3–5 measurable outcomes
- `acceptanceCriteria` — 6–12 Given/When/Then testable criteria
- **`technicalRequirements`** — API surface, performance budgets (p95 targets)
- **`securityRequirements`** — auth checks, rate limit algorithm, audit logging
- **`testingStrategy`** — test scenarios per acceptance criterion
- **`rollbackPlan`** — how to safely revert without data loss

---

### Step 5 · Generate engineering tasks

Click **"Generate Tasks"**.

**What to observe (new in this version):**
- Tasks have `type` field: `backend / frontend / infra / testing / docs`
- Each task has its own `acceptanceCriteria`
- Testing task is always included (CI enforced)
- Tasks ordered: schema/API → implementation → UI → tests → docs

---

### Step 6 · Engineering Kanban (`/tasks`)

> **URL:** https://qship.ishaandev.co.in/tasks

**What to observe:** Kanban board — drag tasks across backlog → todo → in_progress → review → done. Moves tracked in activity timeline.

---

### Step 7 · AI review loop

Back on the feature, click **"Run AI Review"**.

**Iteration 1 — full 9-dimension review:**

| Dimension | What it checks |
|---|---|
| PRD Requirements | All acceptance criteria mapped to diff |
| Security | Auth guards, injection, secrets, rate limiting |
| Performance | N+1 queries, unbounded pagination, blocking calls |
| Error Handling | Unhandled rejections, silent catch blocks |
| Type Safety | `any` types, missing null checks |
| Tests | Test files in diff, coverage signals |
| Edge Cases | PRD edge cases in implementation |
| Compatibility | Breaking API changes, migration files |
| Code Quality | `console.log`, dead code, magic constants |

**Iteration 2+ — delta re-review (differentiator):**

After fixing issues and re-running, the AI specifically checks:
- `RESOLVED: [issue title]` — fix verified in new diff
- `UNRESOLVED: [issue title]` — still present, why
- Any regressions introduced

---

### Step 8 · Review delta and stats

On any feature with 2+ review iterations:

```bash
# Via agent chat at /agent:
"Show me what changed between the last two review iterations"
"What is the review health for the rate limiting feature?"
```

**What to observe:**
- `resolved` / `persisting` / `newIssues` arrays
- `overallProgress: improved | same | regressed`
- `iterationCount`, `passRate`, `averageIssuesPerIteration`

---

### Step 9 · Human approval gate

When AI review passes (`readyForHuman: true`), the **"Approve" / "Reject" / "Request Changes"** buttons appear.

**What to observe:**
- Approval is **blocked** if AI review has blocking issues (`validateHumanApprovalEligibility`)
- Decision is written to `humanApprovals` table with reviewer, timestamp, notes
- Activity timeline shows the decision
- `changes_requested` → sends back to `fix_needed`
- `approved` → moves to `approved` status, enables ship

**Via agent:**
```
"Approve the rate limiting feature — AI review passed all security checks"
"Request changes on feature X — the error handling in the middleware is incomplete"
```

---

### Step 10 · Ship

Click **"Ship"** (appears after `approved` status).

**What to observe:** Status → `shipped`. Final `humanApprovals` record created. Activity: "Feature shipped to production 🚀".

---

### Step 11 · ShipFlow Agent (`/agent`)

> **URL:** https://qship.ishaandev.co.in/agent

Try these exact prompts:

```
"Give me a summary of the entire delivery pipeline"
```
→ Calls `get_pipeline_summary`, renders counts + chart

```
"Triage all submitted feature requests and tell me which ones need PRDs"
```
→ Calls `list_feature_requests` + `triage_feature_request` in a loop

```
"Generate a PRD for the most recent submitted feature"
```
→ Calls `list_feature_requests`, `generate_feature_prd`, streams progress

```
"Run an AI review and show me the review history"
```
→ Calls `run_ai_review`, `list_ai_reviews`, `get_review_delta`

```
"Show me all features waiting for human approval"
```
→ Calls `list_feature_requests` filtered by status

**What to observe:**
- Streamed token-by-token responses
- Action cards rendered inline (feature cards, Kanban updates, review summaries)
- Agent asks before destructive actions (PRD regeneration, ship)
- 20/min rate limit enforced

---

### Step 12 · Scalar API docs

> **URL:** https://api.qship.ishaandev.co.in/docs

**What to observe:**
- Judge quick-start table at the top of the info panel
- Tag groups: Getting started / ShipFlow core / AI platform / Integrations
- Interactive code samples with `curl` examples
- MCP tool manifest with all 25 tool descriptions
- `/mcp`, `/agent/stream`, `/webhooks/github` documented as reference paths

---

## API verification (curl)

### Health checks

```bash
curl -fsS https://api.qship.ishaandev.co.in/health
# → {"status":"ok","timestamp":"..."}

curl -fsS https://api.qship.ishaandev.co.in/ready
# → {"ready":true,"db":"connected","timestamp":"..."}
```

### MCP tools list (no auth required)

```bash
curl -s -X POST https://api.qship.ishaandev.co.in/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
tools = r['result']['tools']
print(f'Total tools: {len(tools)}')
for t in tools:
    print(f'  {t[\"name\"]}')
"
```

Expected: **25 tools** listed.

### OpenAPI schema

```bash
curl -s https://api.qship.ishaandev.co.in/openapi.json \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('Paths:', len(d.get('paths',{})))"
```

### GitHub webhook test (HMAC verification)

```bash
# This should return 401 (signature missing) — confirming HMAC guard is live:
curl -s -X POST https://api.qship.ishaandev.co.in/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: ping" \
  -d '{"zen":"test"}'
# → {"error":"Missing or malformed GitHub webhook signature"}
```

---

## Local setup (5 minutes)

```bash
git clone https://github.com/ishaansatapathy/Qship.git
cd Qship
pnpm install
cp .env.example .env
# Edit .env: set DATABASE_URL, BETTER_AUTH_SECRET, OPENAI_API_KEY
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev
```

Open: http://localhost:3000/api-auth/demo?next=/brief

Verify locally:
```bash
curl http://localhost:8000/health
curl http://localhost:8000/ready
curl -s -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | python3 -m json.tool | grep '"name"' | wc -l
# → 25
```

---

## Seeded data

`pnpm db:seed` creates:

| Item | Details |
|---|---|
| User | `demo@qship.dev` / `DemoPass123!` |
| Organisation | ShipFlow Demo Org |
| Project | Core Platform |
| Feature 1 | `submitted` — "Rate limiting on auth endpoints" |
| Feature 2 | `prd_ready` — "CSV export for audit log" |
| Feature 3 | `human_review` — "Dark mode toggle" (AI review passed) |

---

## Engineering highlights

| Area | Implementation |
|---|---|
| **Monorepo** | Turborepo + pnpm — shared types, zero duplication |
| **Type safety** | 100% TypeScript, `pnpm check-types` zero errors enforced in CI |
| **Database** | 42 Drizzle migrations, 14 perf indexes, proper boolean/integer types (not text) |
| **AI prompts** | 9-dimension PR review checklist, delta re-review, technical PRD with rollback plan |
| **GitHub** | 55-min token cache, paginated repo sync, idempotent webhook delivery |
| **CI** | Parallel static + integration + E2E jobs, Playwright artifacts on failure |
| **Security** | HMAC-SHA256 webhooks, approval gate validation, scoped tool execution |
| **MCP** | 25 tools, CI parity test, JSON-RPC 2.0 spec-compliant |

---

## Scoring checklist (self-assessment)

| Criterion | Evidence | Location |
|---|---|---|
| Working demo | One-click login, all pages load | https://qship.ishaandev.co.in |
| API live | `/health`, `/ready`, `/docs` all 200 | https://api.qship.ishaandev.co.in |
| AI agent quality | 9-dim review, delta re-review, 25 tools | `/agent`, `feature-ai.ts` |
| Review loop | Iteration tracking, delta, approval gate | `review.ts`, `/requests` |
| Human approval | Validate → approve/reject/changes | UI + agent tools |
| GitHub integration | Webhooks, PR link, AI comment | `packages/services/github/` |
| MCP | 25 tools, spec-compliant, public list | `POST /mcp` |
| Documentation | README + DEMO + JUDGE_WALKTHROUGH + ARCHITECTURE | This repo |
| Code quality | TypeScript strict, CI green, Drizzle migrations | `.github/workflows/ci.yml` |
| Deployment | Vercel (web + API) + Neon DB | live URLs above |
