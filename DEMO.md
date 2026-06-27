# Qship — ShipFlow Judge Demo Guide

> **ShipFlow AI** is an AI-assisted product delivery platform. Every feature follows a structured loop — not ad-hoc code generation.

**Request → PRD → Tasks → Code → AI Review → Fixes → Re-Review → Human Approval → Ship**

---

## Quick Links

| What | Local | Production |
|------|-------|--------------|
| Web app | http://localhost:3000 | https://qship.ishaandev.co.in |
| **Demo login** | http://localhost:3000/api-auth/demo?next=/brief | https://qship.ishaandev.co.in/api-auth/demo?next=/brief |
| **Scalar API docs** | http://localhost:8000/docs | https://api.qship.ishaandev.co.in/docs |
| OpenAPI JSON | http://localhost:8000/openapi.json | https://api.qship.ishaandev.co.in/openapi.json |
| MCP server | `POST http://localhost:8000/mcp` | `POST https://api.qship.ishaandev.co.in/mcp` |
| GitHub repo | https://github.com/ishaansatapathy/Qship | — |

Deploy: **[DEPLOY.md](./DEPLOY.md)**

---

## Judge visuals — what to look for

| Screen | What judges should see | Open |
|--------|------------------------|------|
| **Pipeline overview** | Real Postgres counts by delivery stage, needs-attention | `/brief` |
| **External intake** | Email / support / call simulate → same pipeline | `/inbox` |
| **Feature requests** | Submit, AI triage, PRD, tasks, delivery timeline, confirm dialogs | `/requests` |
| **Engineering Kanban** | 5 columns, task cards, status dropdown | `/tasks` |
| **ShipFlow Agent** | SSE streaming, 19 tools, feature attach, sessions | `/agent` |
| **Billing** | Free / Pro / Enterprise, Razorpay checkout (test mode) | `/billing` |
| **Settings** | GitHub App connect, repo sync | `/settings` |
| **Scalar API docs** | Intro guide, tag groups, MCP appendix, curl samples | `/docs` |
| **Analytics** | Pipeline metrics | `/analytics` |

**Contextual memory (not a stateless chatbot):** Agent **sessions** persist in Postgres, **tool memory** recalls prior tool results, and **feature focus** pins a request into the system prompt.

---

## 3-Minute Judge Walkthrough

### Step 1 — Demo login (15s)

```bash
pnpm db:migrate && pnpm db:seed
```

Set in `.env`:

```env
DEMO_LOGIN_ENABLED=true
DEMO_USER_EMAIL=demo@qship.dev
DEMO_USER_PASSWORD=DemoPass123!
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...   # Neon recommended
```

Open: **http://localhost:3000/api-auth/demo?next=/brief**

| Field | Value |
|-------|-------|
| Email | `demo@qship.dev` |
| Password | `DemoPass123!` |

**Scoring signal:** Zero-friction judge access, seeded pipeline data.

---

### Step 2 — Pipeline overview (`/brief`) ★ Lead feature

Open: **http://localhost:3000/brief**

Shows live counts from Postgres:
- Total · In delivery · Needs attention · Awaiting approval · Shipped

Click **Today's focus** CTA or a **Needs attention** card → opens `/requests`.

**Scoring signal:** SaaS dashboard grounded in real workflow state.

---

### Step 3 — Multi-channel intake (`/inbox`) ★ Differentiator

Open: **http://localhost:3000/inbox**

1. On **Email** card → click **Simulate**
2. Pre-filled sample: *CSV export for compliance audit* from `legal@acme.com`
3. Click **Send to pipeline** → toast: intake received, triage complete
4. Row appears in **Recent intake** — same pipeline as in-app requests

Production path: signed webhook at `POST /webhooks/intake` · MCP tool `intake_from_channel`.

**Scoring signal:** Email, support tickets, and customer calls feed one delivery pipeline.

---

### Step 4 — Feature requests hub (`/requests`) ★ Core loop

Open: **http://localhost:3000/requests**

**Seeded samples (after `pnpm db:seed`):**

| Feature | Status | What to show |
|---------|--------|--------------|
| OAuth login for enterprise customers | `prd_ready` | PRD + tasks + delivery timeline |
| Bulk export for compliance reports | `human_review` | AI review + **Approve for ship** gate |
| Slack notification when PR is approved | `submitted` | Live triage → PRD demo |

**Live demo flow:**
1. Select **Slack notification…**
2. Click **Generate PRD with AI** → confirm dialog (HITL) → **Generate PRD**
3. Click **Generate engineering tasks** when PRD appears
4. Show **delivery timeline**, **summary**, **next step**
5. Click **Open board** → `/tasks`

Optional: **New feature request** → fill Title + What & why → **Submit & triage**

**Scoring signal:** End-to-end discovery → planning with AI + human gates.

---

### Step 5 — Engineering Kanban (`/tasks`) ★ Core loop

Open: **http://localhost:3000/tasks**

Five columns: **Backlog · To do · In progress · Review · Done**

1. Find a task card (OAuth feature)
2. **Move to** dropdown → change **In progress** → **Review**
3. Card moves optimistically across columns

MCP: `update_engineering_task_status` · REST: `PATCH /api/feature/tasks/{id}/status`

**Scoring signal:** PRD breaks into real engineering tasks on a board.

---

### Step 6 — ShipFlow Agent (`/agent`) ★ AI depth

Open: **http://localhost:3000/agent**

The agent has **19 tools** — **full parity** with the MCP server (CI-verified):

| Category | Tools |
|----------|-------|
| Workspace | `get_workspace`, `get_pipeline_summary` |
| Features | `list_feature_requests`, `get_feature_request`, `create_feature_request`, `triage_feature_request`, `generate_feature_prd`, `generate_feature_tasks`, `add_clarification`, `update_feature_status` |
| Review | `run_ai_review`, `request_human_review`, `list_ai_reviews` |
| Delivery | `get_feature_delivery`, `check_existing_capability` |
| Intake | `intake_from_channel` |
| Kanban | `update_engineering_task_status` |
| GitHub | `github_connection_status`, `list_github_repositories` |

**Try these prompts:**
```
"What's in my pipeline? Anything stuck in human review?"
"Check if we already built CSV export — don't duplicate work."
"Triage the Slack notification feature and list clarifying questions."
"Get delivery timeline for the OAuth feature and tell me the next step."
"Run an AI pre-ship review on the compliance export feature."
```

Attach a feature via focus chip before asking feature-specific questions.

**Safety layers:** Prompt injection detection → token limit → rate limit (20/min) → human-in-the-loop confirm for PRD/ship in UI → workspace scoping on every feature tool → `check_existing_capability` educates instead of rebuilding.

**Demo limits:** Demo account gets 3 agent AI runs per browser session.

---

### Step 7 — Human approval (`/requests`) ★ Review gate

1. Select **Bulk export for compliance reports** (`human_review`)
2. Show **AI review** section (iteration, blocking/non-blocking issues)
3. Click **Approve for ship** → confirm dialog → **Approve**
4. Status → **Approved** → **Mark shipped** available

**Scoring signal:** AI review + explicit human sign-off before release.

---

### Step 8 — Billing + Razorpay (`/billing`) ★ SaaS

Open: **http://localhost:3000/billing**

1. Show **Free · Pro · Enterprise** plans with AI review credits + repo limits
2. Banner: **Razorpay checkout is live** (when keys set) or demo fallback
3. **Pay with Razorpay** on Pro → modal → **Netbanking** → **Success** (test mode)
4. Toast: upgraded · credits update

Test payment tips: use Netbanking Success; avoid international cards in test mode.

**Scoring signal:** Monetization built in — not a hackathon-only UI.

---

### Step 9 — Scalar API docs (★ judge docs)

Open: **http://localhost:8000/docs**

Full **Scalar** reference — every REST route documented with:

- **Intro panel** — judge quick-start table, architecture diagram, delivery loop, **19 MCP tools appendix**
- **Tag groups** — Getting started (Health), ShipFlow core (Feature Requests, Workspace, GitHub), AI platform (Agent, MCP & Streaming), Integrations (Webhooks)
- **Request examples** — create feature, generate PRD, intake, task board, MCP tools/call
- **Reference paths** — `/mcp`, `/agent/stream`, `/webhooks/github`, `/webhooks/intake`, `/ready`
- **curl code samples** — MCP tools/list, create feature, readiness probe

**Expand in Scalar (recommended order):**
1. **Health → GET /ready** — curl sample
2. **Feature Requests → GET /feature/pipeline-summary**
3. **Feature Requests → POST /feature/requests** — `runTriage: true`
4. **Feature Requests → POST /feature/intake** — multi-channel body
5. **Feature Requests → GET /feature/task-board**
6. **MCP & Streaming → POST /mcp** — JSON-RPC examples + tool manifest
7. **MCP & Streaming → POST /agent/stream** — SSE with `focusContextId`
8. **Webhooks → POST /webhooks/github** — HMAC note

Local JSON: `http://localhost:8000/openapi.json`

Judge walkthrough: **`JUDGE_WALKTHROUGH.md`**

```bash
curl -s http://localhost:8000/openapi.json | head -c 400
curl -fsS http://localhost:8000/ready
```

---

### Step 10 — MCP server (live curl)

```bash
# Initialize
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# List all 19 tools (no auth)
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# Pipeline summary (requires auth)
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie-from-browser>" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_pipeline_summary","arguments":{}}}'
```

Headless auth: set `SHIPFLOW_MCP_API_KEY` + `SHIPFLOW_MCP_USER_ID`, then:

```bash
curl -X POST http://localhost:8000/mcp \
  -H "Authorization: Bearer $SHIPFLOW_MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_feature_requests","arguments":{"limit":5}}}'
```

MCP exposes: `tools/list`, `tools/call`, `initialize`, `resources/list`, `prompts/list` — MCP 2024-11-05 compliance.

Configure Cursor/Claude: see **`mcp-server.json`**.

---

### Step 11 — GitHub integration

1. Open **http://localhost:3000/settings**
2. **Connect GitHub App** → install on your org
3. **Sync repositories** → list appears in Settings
4. On `/requests`: **Open GitHub PR** creates branch `shipflow/<uuid>`
5. Webhook URL: `{API_URL}/webhooks/github` (HMAC verified)

| Capability | Where |
|------------|-------|
| GitHub App install | Settings → Connect |
| List repos | tRPC `github.listRepositories` / MCP `list_github_repositories` |
| Open PR from feature | **Open GitHub PR** button on `/requests` |
| Webhook receiver | `POST /webhooks/github` |
| AI review with diff | `run_ai_review` when PR linked |

---

### Step 12 — MCP + AI workflows (★ depth for judges)

| # | Workflow | How to demo | Signal |
|---|----------|-------------|--------|
| 1 | **Intake → Pipeline** | `/inbox` Simulate Email → `/requests` | Multi-channel intake |
| 2 | **Submit → Triage → PRD** | Requests UI or Agent `create_feature_request` + `generate_feature_prd` | Core loop |
| 3 | **PRD → Tasks → Kanban** | Generate tasks → `/tasks` move card | Planning + engineering UX |
| 4 | **Duplicate education** | Agent: *"Do we already have CSV export?"* → `check_existing_capability` | Smart agent, not rebuild-everything |
| 5 | **AI pre-ship review** | `run_ai_review` on feature with PRD + linked PR diff | Review loop |
| 6 | **Human approval gate** | Bulk export → **Approve for ship** | HITL |
| 7 | **Razorpay upgrade** | `/billing` Netbanking Success | SaaS monetization |
| 8 | **MCP from Cursor** | Point MCP at `/mcp`, call `get_pipeline_summary` | Platform extensibility |
| 9 | **Delivery timeline** | Feature detail → timeline + summary panel | Audit trail |

---

## 5-Minute Demo Recording Path

Use this table when recording your submission video. Full click-level detail is in the steps above.

| Time | Screen | Wow moment |
|------|--------|------------|
| 0:00 | Landing → demo login | Problem statement hook |
| 0:30 | `/brief` | Real pipeline counts from Postgres |
| 1:00 | `/inbox` → Simulate → Send | Multi-channel intake |
| 1:45 | `/requests` → PRD (confirm dialog) | HITL + delivery timeline |
| 2:30 | `/tasks` | Kanban — move task across columns |
| 3:00 | `/agent` → attach feature | 19 tools, streaming, action cards |
| 3:45 | `/billing` → Razorpay | SaaS monetization |
| 4:15 | `:8000/docs` | Scalar + MCP curl |
| 4:45 | Close on `/brief` | GitHub repo + `#chaicode` |

---

## Feature Table

| Feature | Description | APIs / Tools |
|---------|-------------|--------------|
| **Pipeline overview** | Counts by delivery stage | `feature.pipelineSummary`, `get_pipeline_summary` |
| **External intake** | Email, support, call, webhook | `/inbox`, `POST /webhooks/intake`, `intake_from_channel` |
| **Feature requests hub** | Submit, list, detail, status | `feature.*` tRPC, MCP feature tools |
| **AI triage** | Priority, effort, clarifying questions | OpenAI + `triage_feature_request` |
| **Duplicate education** | Warn before rebuilding | `check_existing_capability` |
| **PRD generation** | Structured PRD JSON | OpenAI + `generate_feature_prd` |
| **Task breakdown** | Engineering tasks from PRD | `generate_feature_tasks` |
| **Engineering Kanban** | 5-column board | `/tasks`, `update_engineering_task_status` |
| **Delivery timeline** | Activity log + summary + next step | `get_feature_delivery`, `feature.delivery` |
| **ShipFlow Agent (19 tools)** | Streaming copilot with sessions | `/agent/stream`, MCP parity |
| **MCP server (19 tools)** | JSON-RPC for external AI clients | `POST /mcp` |
| **GitHub App** | Connect org, open PR, webhooks | `github.*` tRPC, Octokit |
| **AI pre-ship review** | PRD/task/PR diff review | `run_ai_review`, `list_ai_reviews` |
| **Human review gate** | `human_review` → `approved` → `shipped` | UI confirm + agent tool |
| **Billing** | Razorpay checkout, plan tiers | `billing.*` tRPC, `/webhooks/razorpay` |
| **Scalar API docs** | OpenAPI from tRPC, judge intro | `/docs` |
| **Demo mode** | One-click login + AI limits | `/api-auth/demo` |

**Agent tools: 19** · **MCP tools: 19** (verified by CI parity test)

---

## Integration Map

| Capability | Where | API / Tool |
|-----------|-------|------------|
| Submit feature request | `/requests`, Agent, MCP | `create_feature_request`, `POST /feature/requests` |
| AI triage | Requests UI, Agent, MCP | `triage_feature_request`, OpenAI |
| Duplicate check | Create + Agent | `check_existing_capability` |
| Generate PRD | Requests UI, Agent, MCP | `generate_feature_prd`, `POST /feature/requests/{id}/prd` |
| Generate tasks | Requests UI, Agent, MCP | `generate_feature_tasks` |
| Kanban board | `/tasks` | `GET /feature/task-board`, `update_engineering_task_status` |
| Pipeline summary | `/brief`, Agent, MCP | `get_pipeline_summary` |
| Delivery timeline | Requests detail | `get_feature_delivery` |
| Multi-channel intake | `/inbox`, webhook | `intake_from_channel`, `POST /webhooks/intake` |
| AI pre-ship review | Requests UI, Agent | `run_ai_review`, `list_ai_reviews` |
| Human approval | Requests UI | `human_review` → `approved` → `shipped` |
| GitHub App | `/settings` | `github_connection_status`, Octokit |
| Open PR | `/requests` | `POST /feature/requests/{id}/pull-request` |
| GitHub webhooks | API | `POST /webhooks/github` (HMAC) |
| Agent streaming | `/agent` | `POST /agent/stream` (SSE) |
| MCP server | External clients | `POST /mcp` (JSON-RPC) |
| Razorpay billing | `/billing` | `billing.createCheckout`, `/webhooks/razorpay` |
| OpenAPI docs | Scalar | `/docs`, `/openapi.json` |

---

## Engineering highlights (production quality)

### Security
- **Prompt injection detection** on every agent message
- **Workspace scoping** on all feature MCP/agent tools
- **GitHub webhook HMAC** — timing-safe compare
- **MCP API key** bound to single user id
- **Rate limiting** — agent 20/min/user, MCP 60/min/user
- **Intake webhook** — shared secret when configured

### Architecture
- **Shared tool executor** — `shipflow-agent-tools.ts` used by agent + MCP
- **CI tool parity** — agent tools === MCP manifest (`tool-parity.test.ts`)
- **Session persistence** — Postgres agent sessions + tool memory
- **Monorepo** — Turborepo, tRPC, Drizzle, BetterAuth, Inngest workflows

### Observability
- Structured logging via `@repo/logger`
- tRPC request IDs in errors
- `/health` + `/ready` endpoints

---

## Scoring checklist

| Criterion | Evidence in this repo |
|-----------|----------------------|
| Interactive API docs | Scalar at `/docs` |
| Demo without setup pain | `/api-auth/demo` + `pnpm db:seed` |
| Core workflow | `/inbox`, `/requests`, `/tasks` full loop |
| AI agent + MCP | 19 tools, streaming, parity test |
| GitHub integration | Settings + webhook + open PR |
| Human-in-the-loop | Confirm dialogs, `human_review`, agent guards |
| SaaS UX | Billing, Kanban, intake, Cmd+K |
| README + walkthrough | README.md, DOCS.md, JUDGE_WALKTHROUGH.md, HACKATHON_SUBMISSION.md |

---

## Related docs

| Doc | Purpose |
|-----|---------|
| [README.md](./README.md) | Setup, stack, deployment |
| [DOCS.md](./DOCS.md) | Full technical reference |
| [JUDGE_WALKTHROUGH.md](./JUDGE_WALKTHROUGH.md) | Timed 3-min path |
| [HACKATHON_SUBMISSION.md](./HACKATHON_SUBMISSION.md) | One-pager + rubric map |
| [mcp-server.json](./mcp-server.json) | MCP client config |
