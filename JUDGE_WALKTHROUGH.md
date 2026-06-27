# Qship — ShipFlow AI — Judge Walkthrough (~3 minutes)

> **Evaluator?** Start with **[HACKATHON_SUBMISSION.md](./HACKATHON_SUBMISSION.md)** (one-pager) or **[DEMO.md](./DEMO.md)** (full guide + recording path).

| Service | Local |
|---------|-------|
| Web | http://localhost:3000 |
| **Demo login** | http://localhost:3000/api-auth/demo?next=/brief |
| **Scalar docs** | http://localhost:8000/docs |
| OpenAPI JSON | http://localhost:8000/openapi.json |
| MCP | `POST http://localhost:8000/mcp` |

Full demo script: **`DEMO.md`**

---

## 0. Setup (before judging — 30s)

```bash
pnpm db:migrate && pnpm db:seed && pnpm dev
```

`.env`: `DEMO_LOGIN_ENABLED=true`, `OPENAI_API_KEY=sk-...`, `DATABASE_URL=...`

---

## 1. Scalar docs (25s) — ★ Docs

1. Open **http://localhost:8000/docs**
2. Intro panel — delivery loop, architecture, **19 MCP tools**
3. Sidebar groups: **Feature Requests**, **GitHub**, **MCP & Streaming**, **Webhooks**
4. Expand **Feature Requests → POST /feature/requests** — request example + curl
5. Expand **Feature Requests → GET /feature/task-board**
6. Expand **MCP & Streaming → POST /mcp** — JSON-RPC examples + curl
7. Expand **Health → GET /ready**

---

## 2. Demo login (10s)

**http://localhost:3000/api-auth/demo?next=/brief**

| Email | `demo@qship.dev` |
| Password | `DemoPass123!` |

---

## 3. Pipeline overview (20s)

1. **`/brief`** — live counts from Postgres
2. Note **Needs attention** metric
3. → **`/requests`**

---

## 4. Intake hub (25s) — ★ Multi-channel

1. **`/inbox`**
2. Email → **Simulate** → **Send to pipeline**
3. Toast: triage complete · show in Requests

**Signal:** Email/support/call intake + webhook-ready (`POST /webhooks/intake`).

---

## 5. Feature loop (45s) — ★ Core Workflow

1. **`/requests`** → **OAuth login…** (seeded, `prd_ready`)
2. Show PRD, tasks, **delivery timeline**, next step
3. **Generate PRD with AI** on another request → **confirm dialog** (HITL)
4. **Open board** → **`/tasks`**

---

## 6. Kanban (20s)

1. **`/tasks`** — Backlog · To do · In progress · Review · Done
2. Move a task (e.g. In progress → Review)

**Signal:** PRD → engineering tasks → board · MCP `update_engineering_task_status`.

---

## 7. Agent (40s) — ★ AI Agent

1. **`/agent`** · attach feature (focus chip)
2. *"Check if CSV export already exists. What's stuck in human review?"*
3. Streaming + action cards + **19 tools**

---

## 8. Billing (20s) — ★ SaaS

1. **`/billing`** · show plans + credits
2. **Pay with Razorpay** → Netbanking → Success (test mode)

---

## 9. MCP curl (20s)

```bash
curl -s -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**19 tools** · `mcp-server.json` · CI: `tool-parity.test.ts`

---

## 10. GitHub (optional, 20s)

**`/settings`** → Connect GitHub App → Sync repos · **Open GitHub PR** on `/requests`

---

## What judges should score

| Criterion | Evidence |
|-----------|----------|
| **Detailed docs** | Scalar at `/docs` — tag groups, examples, MCP appendix |
| **Core workflow** | Intake → triage → PRD → Kanban → review → ship |
| **MCP** | 19 tools + `mcp-server.json` + CI parity |
| **AI workflows** | Agent SSE + feature focus + educate-if-exists |
| **SaaS** | Billing, pipeline overview, multi-tenant workspace |
| **Production hygiene** | Auth, HITL, webhooks HMAC, OpenAPI from tRPC |

---

## Rubric alignment

| Category (max) | Evidence |
|----------------|----------|
| Core Workflow (20) | Intake, Requests, Kanban, status flow |
| AI Agent (20) | Agent SSE, 19 tools, educate-if-exists, MCP |
| GitHub (15) | Settings, webhooks, open PR, Scalar routes |
| Review & Approval (15) | AI review, human_review, confirm dialogs |
| Engineering (15) | tRPC, Scalar, Neon, 52 tests, monorepo |
| SaaS UX (10) | Overview, intake, Kanban, billing, Cmd+K |
| Demo & Docs (5) | HACKATHON_SUBMISSION.md, DEMO.md, this file, Scalar |
