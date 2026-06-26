# Qship — ShipFlow AI — Judge Walkthrough (~3 minutes)

> **Evaluator?** Start with **[DEMO.md](./DEMO.md)** for the full walkthrough, curl examples, MCP map, and scoring checklist.

| Service | Local | Production (replace when deployed) |
|---------|-------|----------------------------------|
| Web app | http://localhost:3000 | `https://your-app.vercel.app` |
| **Scalar API docs** | http://localhost:8000/docs | `https://your-api.example.com/docs` |
| OpenAPI JSON | http://localhost:8000/openapi.json | same host `/openapi.json` |
| MCP server | `POST http://localhost:8000/mcp` | same host `/mcp` |
| Demo login | http://localhost:3000/api-auth/demo?next=/brief | same path on web host |

Full demo script: **`DEMO.md`** · Technical guide: **`DOCS.md`** · Video script: **`docs/DEMO_VIDEO_SCRIPT.md`**

---

## 1. Scalar docs (30s) — ★ Docs full marks

1. Open **http://localhost:8000/docs**
2. Read the **intro panel** — delivery loop, architecture diagram, demo login table, **14 MCP tools appendix**
3. Sidebar groups: **Feature Requests**, **GitHub**, **Workspace**, **Agent**, **MCP & Streaming**, **Webhooks**
4. Expand **Feature Requests → POST /feature/requests** — create a feature with AI triage
5. Expand **MCP & Streaming → POST /mcp** — JSON-RPC examples + curl code sample
6. Expand **Health → GET /ready** — readiness probe (CI uses this)
7. Expand **Webhooks → POST /webhooks/github** — HMAC verification documented

> In dev, Scalar loads automatically. Set `PUBLIC_OPENAPI_DOCS=true` in production.

---

## 2. Demo login (15s)

1. Ensure seed ran: `pnpm db:seed`
2. Set `DEMO_LOGIN_ENABLED=true` in `.env`
3. Open **http://localhost:3000/api-auth/demo?next=/brief**

| Field | Value |
|-------|-------|
| Email | `demo@qship.dev` |
| Password | `DemoPass123!` |

Seeded workspace includes **3 sample feature requests** at different pipeline stages.

---

## 3. Pipeline overview (30s)

1. Open **`/brief`** — pipeline counts (submitted, in delivery, awaiting approval, shipped)
2. Point at **needs attention** metric
3. Navigate to **`/requests`** — full feature hub

**Scoring signal:** Real DB-backed pipeline, not hardcoded UI.

---

## 4. Feature request loop (60s)

1. Open **`/requests`** → select **OAuth login for enterprise customers** (seeded, `prd_ready`)
2. Show **PRD**, **tasks**, **delivery timeline**, **summary**, **next step**
3. Click **New request** → submit a short feature → watch **AI triage**
4. **Generate PRD** → confirm dialog (human-in-the-loop)
5. Show timeline updating

**Scoring signal:** Core workflow — request → triage → PRD → tasks path.

---

## 5. ShipFlow Agent (45s)

1. Open **`/agent`**
2. Attach a feature from the picker (focus chip)
3. Ask: *"What's the pipeline summary? Triage the Slack notification request and suggest next steps."*
4. Show **streaming**, **action cards**, **session sidebar**

**Scoring signal:** 14 tools, workspace-scoped, SSE streaming, tool memory.

---

## 6. MCP curl (30s)

```bash
# List 14 tools (no auth)
curl -s -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Pipeline summary (auth required — session cookie or Bearer MCP key)
curl -s -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_pipeline_summary","arguments":{}}}'
```

Manifest: **`mcp-server.json`** · CI parity: `packages/services/ai/tool-parity.test.ts`

---

## 7. GitHub (optional, 30s)

1. Open **`/settings`**
2. **Connect GitHub App** → install on org → **Sync repositories**
3. Scalar: **GET /github/repositories**

**Scoring signal:** Real Octokit integration, org-scoped repos, webhook HMAC.

---

## What judges should score

| Criterion | Evidence |
|-----------|----------|
| **Detailed docs** | Scalar at `/docs` — intro, tag groups, MCP appendix, curl samples |
| **Core workflow** | `/requests` → triage → PRD → tasks → status |
| **AI Agent** | `/agent` SSE + 14 tools + feature focus |
| **MCP** | `POST /mcp` — 14 tools, `mcp-server.json` |
| **GitHub** | Settings connect + webhook docs |
| **Human-in-the-loop** | Confirm dialogs on PRD/ship; agent prompt gates sensitive actions |
| **Production hygiene** | `/health`, `/ready`, BetterAuth, typed tRPC, CI pipeline |
| **Demo** | One-click login + seeded data + video script |

---

## Hackathon marking alignment

| Category (max) | Where to look |
|----------------|---------------|
| Core Workflow (20) | `/requests`, delivery timeline, status flow |
| AI Agent (20) | `/agent`, MCP, tool parity test |
| GitHub (15) | Settings, `/github/*` Scalar routes, webhook |
| Review & Approval (15) | AI review tool, human_review status, confirm dialogs |
| tRPC / Engineering (15) | Monorepo, Scalar, CI, types |
| SaaS UX (10) | Pipeline overview, command palette, demo bar |
| Demo & Docs (5) | This file + DEMO.md + Scalar + video script |
