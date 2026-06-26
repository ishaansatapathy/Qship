# Qship — ShipFlow Technical Documentation

> **AI-assisted product delivery platform** for the ChaiCode hackathon — tRPC monorepo SaaS.

| Resource | URL |
|----------|-----|
| Web app (local) | http://localhost:3000 |
| **Scalar API docs** | http://localhost:8000/docs |
| OpenAPI JSON | http://localhost:8000/openapi.json |
| ShipFlow MCP | `POST http://localhost:8000/mcp` |
| Agent SSE | `POST http://localhost:8000/agent/stream` |
| GitHub webhook | `POST http://localhost:8000/webhooks/github` |

Related: [`README.md`](README.md) · [`DEMO.md`](DEMO.md) · [`JUDGE_WALKTHROUGH.md`](JUDGE_WALKTHROUGH.md) · [`mcp-server.json`](mcp-server.json)

---

## 1. Architecture

```
Next.js (web)  ──tRPC/REST──►  Express API  ──Octokit──►  GitHub App
     │                              │
     │                              ├── Postgres (features, PRDs, sessions)
     │                              ├── MCP (14 tools)
     │                              └── OpenAI (triage, PRD, review)
     └── SSE /agent/stream ◄────────┘
```

| Component | Stack |
|-----------|-------|
| Frontend | Next.js 16, tRPC client, Qship design system |
| API | Express, tRPC v11, trpc-to-openapi → Scalar |
| Auth | BetterAuth — email/password + Google OAuth |
| Database | PostgreSQL + Drizzle ORM |
| AI | OpenAI gpt-4o-mini (configurable via `OPENAI_MODEL`) |
| MCP | MCP 2024-11-05 — 14 ShipFlow tools |

### Monorepo layout

```
apps/
├── api/          # Express — /trpc, /api, /mcp, /agent/stream, webhooks
└── web/          # Next.js — dashboard, landing, auth proxies

packages/
├── trpc/         # Routers: feature, github, agent, workspace, auth
├── services/     # Domain logic, agent, GitHub, feature-ai
├── database/     # Drizzle schema + migrations
├── auth/         # BetterAuth + seed scripts
└── logger/
```

---

## 2. Authentication

### Browser (web app)

1. Sign in at `/sign-in` — Google OAuth or email/password (BetterAuth)
2. Session cookies set httpOnly
3. tRPC calls proxied via `/trpc/[...path]` with cookie forwarding

### Demo login (judges)

```
GET /api-auth/demo?next=/brief
```

Requires `DEMO_LOGIN_ENABLED=true` and `pnpm db:seed`.

### Headless / MCP

```
Authorization: Bearer <SHIPFLOW_MCP_API_KEY>
```

Must match `SHIPFLOW_MCP_USER_ID` — scoped to one user.

---

## 3. REST API (OpenAPI / Scalar)

tRPC procedures with `.meta({ openapi: ... })` are exposed as REST under **`/api/*`**.

Documented in Scalar with tag groups, intro markdown, MCP appendix, and curl samples.

### Feature Requests

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/feature/statuses` | Pipeline statuses + core loop description |
| GET | `/feature/workspace` | User's org + project |
| GET | `/feature/pipeline-summary` | Counts by stage |
| GET | `/feature/requests` | List features |
| GET | `/feature/requests/{id}` | Feature detail |
| GET | `/feature/requests/{id}/delivery` | Timeline + summary + next step |
| POST | `/feature/requests` | Create (+ optional triage) |
| POST | `/feature/requests/{id}/prd` | Generate PRD |
| PATCH | `/feature/requests/{id}/status` | Update status |

### GitHub

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/github/connection` | Connection status |
| GET | `/github/install-url` | GitHub App install URL |
| GET | `/github/repositories` | Linked repos |

### Workspace & Agent

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/workspace` | Org membership |
| GET | `/agent/status` | OpenAI configured? model name? |
| GET | `/health` | Health check (tRPC) |

### Example curl — create feature

```bash
curl -X POST http://localhost:8000/api/feature/requests \
  -H "Content-Type: application/json" \
  -H "Cookie: <better-auth-session-cookie>" \
  -d '{
    "title": "Audit log export",
    "rawRequest": "Compliance team needs CSV export of shipped features with approver names.",
    "runTriage": true
  }'
```

---

## 4. Delivery pipeline statuses

```
submitted → clarifying → prd_generating → prd_ready → planning → plan_approved
→ in_development → pr_open → ai_review → fix_needed → human_review → approved → shipped
```

| Phase | Statuses |
|-------|----------|
| Discovery | submitted, clarifying, duplicate_education, rejected, prd_generating, prd_ready |
| Planning | planning, plan_approved |
| Development | in_development, pr_open |
| AI Review | ai_review, fix_needed |
| Release | human_review, approved, shipped |

---

## 5. MCP (14 tools)

**Endpoint:** `POST /mcp` (JSON-RPC 2.0)

### Public (no auth)

- `initialize`
- `tools/list`
- `resources/list`
- `prompts/list`

### Protected

- `tools/call` — session cookie or bearer MCP key

### Tool list

| Tool | Purpose |
|------|---------|
| `get_workspace` | Org + project for user |
| `list_feature_requests` | Pipeline list |
| `get_feature_request` | Full detail |
| `create_feature_request` | Submit request |
| `triage_feature_request` | AI triage |
| `generate_feature_prd` | AI PRD |
| `generate_feature_tasks` | Task breakdown |
| `add_clarification` | Clarification message |
| `run_ai_review` | Pre-ship AI review |
| `request_human_review` | Move to human_review |
| `update_feature_status` | Status transition |
| `get_pipeline_summary` | Stage counts |
| `github_connection_status` | GitHub connected? |
| `list_github_repositories` | Linked repos |

**CI parity:** `packages/services/ai/tool-parity.test.ts`

### Example curl

```bash
curl -s -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## 6. Agent (SSE streaming)

| Endpoint | Purpose |
|----------|---------|
| `POST /agent/stream` | SSE streaming chat with 14 ShipFlow tools |

Rate limit: **20 requests/min/user**.

Features:
- Session persistence (`agent.*` tRPC routes)
- Tool memory (last 12 tool results per session)
- Feature focus via agent session (`feature:<uuid>` prefix on focus id)
- Prompt injection guards + token budget

Blocking variant: `agent.chat` tRPC mutation (same tools).

---

## 7. GitHub integration

| Component | Details |
|-----------|---------|
| GitHub App | `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_SLUG` |
| Install flow | Settings → install URL with org state |
| Repo sync | `github.syncInstallation` — Octokit list repos |
| Webhook | `POST /webhooks/github` — HMAC-SHA256 |

---

## 8. Database schema (high level)

| Table | Purpose |
|-------|---------|
| `shipflow_users`, sessions, accounts | BetterAuth |
| `organizations`, `organization_members` | Multi-tenant workspace |
| `projects` | Delivery project per org |
| `feature_requests` | Core entity + status workflow |
| `feature_prds` | Structured PRD JSON |
| `engineering_tasks` | Kanban tasks |
| `clarification_messages` | Q&A on features |
| `repositories` | GitHub repo links |
| `agent_chat_sessions` | Agent session state |

Migrations: `packages/database/drizzle/` · Seed: `pnpm db:seed`

---

## 9. Non-REST endpoints (Scalar reference section)

| Path | Method | Purpose |
|------|--------|---------|
| `/health` | GET | Liveness + optional DB ping |
| `/ready` | GET | Readiness (DB required) |
| `/openapi.json` | GET | OpenAPI spec |
| `/docs` | GET | Scalar UI |
| `/mcp` | POST | MCP JSON-RPC |
| `/agent/stream` | POST | Agent SSE |
| `/webhooks/github` | POST | GitHub App events |
| `/trpc/*` | * | tRPC (primary client transport) |

---

## 10. Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL |
| `BETTER_AUTH_SECRET` | Yes | Session signing (≥32 chars) |
| `BETTER_AUTH_URL` | Yes | Auth base URL (web origin) |
| `OPENAI_API_KEY` | For AI | Triage, PRD, agent, review |
| `GITHUB_APP_*` | For GitHub | App id, key, slug, webhook secret |
| `GOOGLE_CLIENT_ID/SECRET` | For Google sign-in | BetterAuth OAuth |
| `DEMO_LOGIN_ENABLED` | Demo | One-click judge login |
| `SHIPFLOW_MCP_API_KEY` | MCP scripts | Headless MCP auth |
| `SHIPFLOW_MCP_USER_ID` | MCP scripts | Bound user |

See [`.env.example`](./.env.example).

---

## 11. Local development

```bash
pnpm install
cp .env.example .env
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev
```

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API | http://localhost:8000 |
| **Scalar docs** | http://localhost:8000/docs |

---

## 12. Judge checklist (documentation)

| Criterion | Evidence |
|-----------|----------|
| Interactive API docs | Scalar at `/docs` |
| MCP manifest | `mcp-server.json` |
| Demo script | `DEMO.md` |
| Walkthrough | `JUDGE_WALKTHROUGH.md` |
| Video script | `docs/DEMO_VIDEO_SCRIPT.md` |
| CI | `.github/workflows/ci.yml` |
