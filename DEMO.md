# Qship — ShipFlow Judge Demo Guide

> **ShipFlow AI** is an AI-assisted product delivery platform. Every feature follows a structured loop — not ad-hoc code generation.

**Request → PRD → Tasks → Code → AI Review → Fixes → Re-Review → Human Approval → Ship**

---

## Quick Links

| What | Where |
|------|-------|
| Web app (local) | http://localhost:3000 |
| **Demo login** | http://localhost:3000/api-auth/demo?next=/brief |
| **Scalar API docs** | http://localhost:8000/docs |
| OpenAPI JSON | http://localhost:8000/openapi.json |
| MCP server | `POST http://localhost:8000/mcp` |
| GitHub repo | https://github.com/ishaansatapathy/Qship |
| Video script | [docs/DEMO_VIDEO_SCRIPT.md](./docs/DEMO_VIDEO_SCRIPT.md) |

> Replace localhost URLs with production hosts when deployed (Vercel + Railway/Render).

---

## Judge visuals — what to look for

| Screen | What judges should see | Open |
|--------|------------------------|------|
| **Pipeline overview** | Real DB counts by delivery stage | `/brief` |
| **Feature requests** | Submit, AI triage, PRD, tasks, delivery timeline | `/requests` |
| **ShipFlow Agent** | SSE streaming, 14 tools, feature attach, sessions | `/agent` |
| **Settings** | GitHub App connect, approval toggles | `/settings` |
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
- Submitted · In delivery · Awaiting approval · Shipped · Needs attention

Click through to **Requests** for detail.

**Scoring signal:** SaaS dashboard grounded in real workflow state.

---

### Step 3 — Feature requests hub (`/requests`) ★ Core loop

Open: **http://localhost:3000/requests**

**Seeded samples (after `pnpm db:seed`):**

| Feature | Status | What to show |
|---------|--------|--------------|
| OAuth login for enterprise customers | `prd_ready` | PRD + tasks + timeline |
| Bulk export for compliance reports | `human_review` | Awaiting human sign-off |
| Slack notification when PR is approved | `submitted` | Fresh request for triage demo |

**Live demo flow:**
1. Select **Slack notification…** → click **Run triage**
2. Click **Generate PRD** → confirm dialog (HITL)
3. Show **delivery timeline** + **summary** + **next step**
4. Open **Agent** with this feature attached → ask for task breakdown

**Scoring signal:** End-to-end discovery → planning path with AI + human gates.

---

### Step 4 — ShipFlow Agent (`/agent`) ★ AI depth

Open: **http://localhost:3000/agent**

The agent has **14 tools** — **full parity** with the MCP server (CI-verified):

| Category | Tools |
|----------|-------|
| Workspace | `get_workspace`, `get_pipeline_summary` |
| Features | `list_feature_requests`, `get_feature_request`, `create_feature_request`, `triage_feature_request`, `generate_feature_prd`, `generate_feature_tasks`, `add_clarification`, `update_feature_status` |
| Review | `run_ai_review`, `request_human_review` |
| GitHub | `github_connection_status`, `list_github_repositories` |

**Try these prompts:**
```
"What's in my pipeline? Anything stuck in human review?"
"Triage the Slack notification feature and list clarifying questions."
"Generate a PRD for the OAuth enterprise request — ask me before saving."
"Break the OAuth PRD into engineering tasks."
"Run an AI pre-ship review on the compliance export feature."
```

**Safety layers:** Prompt injection detection → token limit → rate limit (20/min) → human-in-the-loop prompt for PRD/tasks/ship → workspace scoping on every feature tool.

**Demo limits:** Demo account gets 3 agent AI runs per browser session (bar at top).

---

### Step 5 — Scalar API docs (★ judge docs)

Open: **http://localhost:8000/docs**

Production-grade **Scalar** reference:

- **Intro panel** — judge quick-start table, architecture, delivery loop, MCP tool list
- **Tag groups** — Feature Requests, GitHub, Workspace, Agent, MCP & Streaming, Webhooks
- **Request examples** — create feature, MCP tools/call
- **Reference paths** — `/mcp`, `/agent/stream`, `/webhooks/github`, `/ready`
- **curl code samples** — MCP tools/list, create feature

Local JSON: `http://localhost:8000/openapi.json`

Judge walkthrough: **`JUDGE_WALKTHROUGH.md`**

```bash
curl -s http://localhost:8000/openapi.json | head -c 400
```

---

### Step 6 — MCP server (live curl)

```bash
# Initialize
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# List all 14 tools
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

Configure Cursor/Claude: see **`mcp-server.json`**.

---

### Step 7 — GitHub integration

1. Open **http://localhost:3000/settings**
2. **Connect GitHub App** → install on your org
3. **Sync repositories** → list appears in Settings
4. Webhook URL: `{API_URL}/webhooks/github` (HMAC verified)

| Capability | Where |
|------------|-------|
| GitHub App install | Settings → Connect |
| List repos | tRPC `github.listRepositories` / MCP `list_github_repositories` |
| Webhook receiver | `POST /webhooks/github` |
| Org-scoped repo IDs | `${organizationId}-repo-${githubRepoId}` |

---

### Step 8 — MCP + AI workflows (★ depth for judges)

| # | Workflow | How to demo | Signal |
|---|----------|-------------|--------|
| 1 | **Submit → Triage → PRD** | Requests UI or Agent `create_feature_request` + `triage` + `generate_feature_prd` | Core loop |
| 2 | **PRD → Tasks → Planning** | Agent: *"Break into tasks"* → `generate_feature_tasks` | Planning phase |
| 3 | **AI pre-ship review** | Agent: `run_ai_review` on feature with PRD + tasks | Review loop |
| 4 | **Human approval gate** | Move to `human_review` → confirm in UI | HITL |
| 5 | **MCP from Cursor** | Point MCP at `/mcp`, call `get_pipeline_summary` | Platform extensibility |
| 6 | **Delivery timeline** | Open feature detail → timeline + summary panel | Audit trail |

---

## Feature Table

| Feature | Description | APIs / Tools |
|---------|-------------|--------------|
| **Pipeline overview** | Counts by delivery stage | `feature.pipelineSummary`, `get_pipeline_summary` |
| **Feature requests hub** | Submit, list, detail, status | `feature.*` tRPC, MCP feature tools |
| **AI triage** | Priority, effort, clarifying questions | OpenAI + `triage_feature_request` |
| **PRD generation** | Structured PRD JSON | OpenAI + `generate_feature_prd` |
| **Task breakdown** | Engineering tasks from PRD | OpenAI + `generate_feature_tasks` |
| **Delivery timeline** | Activity log + summary + next step | `feature.delivery` |
| **ShipFlow Agent (14 tools)** | Streaming copilot with sessions | `/agent/stream`, MCP parity |
| **MCP server (14 tools)** | JSON-RPC for external AI clients | `POST /mcp` |
| **GitHub App** | Connect org, list repos, webhooks | `github.*` tRPC, Octokit |
| **AI pre-ship review** | PRD/task review before human gate | `run_ai_review` |
| **Human review gate** | Status `human_review` → `approved` → `shipped` | UI confirm + agent tool |
| **Demo mode** | One-click login + AI limits | `/api-auth/demo`, demo bar |

**Agent tools: 14** · **MCP tools: 14** (verified by CI parity test)

---

## Engineering highlights (production quality)

### Security
- **Prompt injection detection** on every agent message
- **Workspace scoping** on all feature MCP/agent tools (`assertFeatureInUserWorkspace`)
- **GitHub webhook HMAC** — timing-safe compare
- **MCP API key** bound to single user id
- **Rate limiting** — agent 20/min/user, MCP 60/min/user

### Architecture
- **Shared tool executor** — `shipflow-agent-tools.ts` used by agent + MCP
- **CI tool parity** — agent tools === MCP manifest
- **Session persistence** — Postgres agent sessions + tool memory
- **Monorepo** — Turborepo, tRPC, Drizzle, BetterAuth

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
| Core workflow | `/requests` full loop |
| AI agent + MCP | 14 tools, streaming, parity test |
| GitHub integration | Settings + webhook + Scalar routes |
| Human-in-the-loop | Confirm dialogs, `human_review` status, agent prompt |
| README + walkthrough | README.md, DOCS.md, JUDGE_WALKTHROUGH.md |
| Demo video | docs/DEMO_VIDEO_SCRIPT.md (record & upload) |

---

## Related docs

| Doc | Purpose |
|-----|---------|
| [README.md](./README.md) | Setup, stack, deployment |
| [DOCS.md](./DOCS.md) | Full technical reference |
| [JUDGE_WALKTHROUGH.md](./JUDGE_WALKTHROUGH.md) | Timed 3-min path |
| [mcp-server.json](./mcp-server.json) | MCP client config |
| [docs/DEMO_VIDEO_SCRIPT.md](./docs/DEMO_VIDEO_SCRIPT.md) | 5-min recording script |
