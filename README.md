# ShipFlow AI

> **AI-assisted product delivery platform** — move features from **request → PRD → tasks → code → AI review → human approval → ship**.

---

## 🔗 Live demo (zero setup — open in browser)

| Resource | URL |
|---|---|
| **Web app** (Vercel) | **https://qship.ishaandev.co.in** |
| **One-click demo login** | **https://qship.ishaandev.co.in/api-auth/demo?next=/brief** |
| **API** (Railway) | **https://repoapi-production-adfe.up.railway.app** |
| **Scalar API docs** | **https://repoapi-production-adfe.up.railway.app/docs** |
| **API health** | https://repoapi-production-adfe.up.railway.app/health |
| **API readiness** | https://repoapi-production-adfe.up.railway.app/ready |
| **MCP tools list** | `POST https://repoapi-production-adfe.up.railway.app/mcp` |
| **OpenAPI JSON** | https://repoapi-production-adfe.up.railway.app/openapi.json |

```bash
# Quick smoke check before a demo
curl -fsS https://qship.ishaandev.co.in
curl -fsS https://repoapi-production-adfe.up.railway.app/health
curl -fsS https://repoapi-production-adfe.up.railway.app/ready
curl -s -X POST https://repoapi-production-adfe.up.railway.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']['tools']), 'tools')"
```

| Demo credential | Value |
|---|---|
| Email | `demo@qship.dev` |
| Password | `DemoPass123!` |

---

## 🎬 Demo video

> **[▶ Watch 5-min walkthrough](https://youtu.be/ShipFlowAI-demo)** _(link in submission email)_

---

## 📋 Judge / evaluator? Start here

| Document | Purpose |
|---|---|
| **[DEMO.md](./DEMO.md)** | Step-by-step judge guide with curl proofs and agent prompts |
| **[JUDGE_WALKTHROUGH.md](./JUDGE_WALKTHROUGH.md)** | 3-minute timed scoring path per rubric criterion |
| **[HACKATHON_SUBMISSION.md](./HACKATHON_SUBMISSION.md)** | One-pager: rubric map + differentiators |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Full technical deep-dive |
| **[ENGINEERING.md](./ENGINEERING.md)** | Monorepo structure, security middleware, CI gates (rubric map) |

---

## Core delivery loop

```
Feature Request → Triage → Clarifying Questions → PRD → Engineering Tasks
      → Code (GitHub PR) → AI Review → Fix Loop → Human Approval → Ship
```

Every stage is tracked in real time, queryable via tRPC, accessible via 35 MCP tools, and navigable through the ShipFlow Agent chat.

---

## Feature map

| Feature | Where to see it | tRPC / MCP / API |
|---|---|---|
| **Pipeline overview** | `/brief` — counts by stage, next actions | `get_pipeline_summary` |
| **Feature requests** | `/requests` — submit, triage, timeline | `feature.*`, `list_feature_requests` |
| **AI triage** | Click "Run Triage" on any request | `triage_feature_request` |
| **Clarifying questions** | Auto-generated after triage | `add_clarification` |
| **PRD generation** | "Generate PRD" button | `generate_feature_prd` |
| **Task breakdown** | "Generate Tasks" after PRD | `generate_feature_tasks` |
| **Task walkthrough (Agent)** | "Explain in Agent" on any task | `explain_engineering_task`, `advance_task_walkthrough` |
| **Engineering Kanban** | `/tasks` — backlog → done | `update_engineering_task_status` |
| **Delivery timeline** | Right panel on any request | `get_feature_delivery` |
| **AI pre-ship review** | "Run AI Review" button | `run_ai_review` |
| **Delta re-review** | Automatic on iteration ≥ 2 | `get_review_delta`, `get_review_stats` |
| **Human approval gate** | Approve / reject / changes UI + agent | `approve_feature`, `reject_feature`, `request_changes` |
| **Approval audit trail** | Timeline events per decision | `get_approval_history` |
| **ShipFlow Agent** | `/agent` — 35-tool streaming copilot | `POST /agent/stream` |
| **MCP server** | Cursor / Claude integration | `POST /mcp` — 35 tools |
| **GitHub App connect** | `/settings` — install + repo sync | `github.*` tRPC |
| **GitHub PR webhook** | Auto-links PRs to features | `POST /webhooks/github` |
| **Duplicate detection** | Before every new feature | `check_existing_capability` |
| **Multi-channel intake** | Email / support / API ingestion | `intake_from_channel` |
| **Analytics** | `/analytics` — delivery metrics | `shipflow-observability` |
| **Billing** | `/billing` — Razorpay checkout | billing tRPC |
| **Scalar API docs** | Production OpenAPI reference | `GET /docs` |

---

## ShipFlow Agent — 35 tools

The streaming agent at `/agent` and the MCP server at `/mcp` share the same 35 tools, verified by CI parity test.

| Category | Tools |
|---|---|
| **Workspace** | `get_workspace`, `get_pipeline_summary` |
| **Features** | `list_feature_requests`, `get_feature_request`, `create_feature_request`, `triage_feature_request`, `generate_feature_prd`, `generate_feature_tasks`, `add_clarification`, `update_feature_status`, `get_feature_delivery` |
| **Review loop** | `run_ai_review`, `list_ai_reviews`, `get_review_delta`, `get_review_stats` |
| **Task walkthrough** | `explain_engineering_task`, `advance_task_walkthrough` |
| **Human approval** | `request_human_review`, `approve_feature`, `reject_feature`, `request_changes`, `get_approval_history` |
| **Kanban** | `update_engineering_task_status` |
| **Intake** | `create_feature_request`, `intake_from_channel`, `check_existing_capability` |
| **GitHub** | `github_connection_status`, `list_github_repositories` |

### Sample agent prompts

```
"Triage all submitted features and generate PRDs for the P0 ones"
"Run the AI review on the authentication feature and tell me what's blocking"
"Show me what changed between the last two review iterations on feature <id>"
"Approve the OAuth feature — it passed all acceptance criteria in the last review"
"What's the current state of my delivery pipeline?"
```

---

## Production deployment

| Layer | Host | Notes |
|---|---|---|
| **Web** | Vercel → `qship.ishaandev.co.in` | Next.js 16 frontend |
| **API** | Railway → `repoapi-production-adfe.up.railway.app` | Long-lived Express server (workflows, webhooks, MCP) |
| **Database** | Neon Postgres | Shared `DATABASE_URL`; migrations run on API boot |

**Vercel (web) env vars** — point the browser and server-side fetches at Railway:

```env
API_INTERNAL_URL=https://repoapi-production-adfe.up.railway.app
BASE_URL=https://repoapi-production-adfe.up.railway.app
NEXT_PUBLIC_API_BASE_URL=https://repoapi-production-adfe.up.railway.app
BETTER_AUTH_URL=https://qship.ishaandev.co.in
CLIENT_URL=https://qship.ishaandev.co.in
```

**Railway (API) env vars** — same secrets as local `.env` (OpenAI, BetterAuth, Neon, GitHub App, demo login). Set `BASE_URL` to the Railway URL above. Migrations apply automatically on deploy (`pnpm db:migrate` via startup).

**GitHub App webhook URL:** `https://repoapi-production-adfe.up.railway.app/webhooks/github`

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│              Browser (Next.js on Vercel — qship.ishaandev.co.in)   │
│  /brief      Pipeline overview + counts by stage                   │
│  /requests   Feature hub — submit, triage, PRD, tasks, timeline    │
│  /agent      ShipFlow Agent — SSE streaming, 35 tools              │
│  /tasks      Engineering Kanban (backlog → todo → done)            │
│  /analytics  Delivery metrics + throughput                         │
│  /settings   GitHub App connect + repo sync + approval toggles     │
│  /billing    Razorpay subscription management                      │
└────────────────────────┬───────────────────────────────────────────┘
                         │  tRPC + REST (OpenAPI/Scalar)
┌────────────────────────▼───────────────────────────────────────────┐
│        Express API (apps/api on Railway — long-lived process)      │
│  /trpc              Type-safe tRPC procedures (all features)        │
│  /api/*             REST — trpc-to-openapi auto-generated           │
│  /mcp               MCP 2024-11-05 JSON-RPC — 35 ShipFlow tools    │
│  /agent/stream      SSE streaming agent (rate-limited, guardrailed) │
│  /webhooks/github   GitHub App events (HMAC-SHA256 verified)       │
│  /health  /ready    Liveness + readiness probes                    │
│  /docs              Scalar OpenAPI reference (judge UI)            │
└──────────┬──────────────────────────────┬──────────────────────────┘
           │                              │
┌──────────▼───────────┐      ┌───────────▼────────────────────────┐
│ Neon Postgres +      │      │  OpenAI (gpt-4o-mini)              │
│ Drizzle ORM          │      │  Triage, PRD, tasks, pre-ship      │
│ features, PRDs,      │      │  review, delta re-review           │
│ tasks, reviews,      │      ├────────────────────────────────────┤
│ approvals, GitHub,   │      │  GitHub App (Octokit)              │
│ agent sessions       │      │  Install, repo sync, PR webhooks,  │
│ 43 migrations        │      │  AI review comments, token cache   │
│ 14 performance idx   │      │                                    │
└───────────────────────┘      └────────────────────────────────────┘
```

### Package structure

| Package | Purpose |
|---|---|
| `apps/web` | Next.js 16 — full UI with custom Qship design system |
| `apps/api` | Express + tRPC + OpenAPI/Scalar + MCP + agent SSE |
| `packages/trpc` | Shared type-safe tRPC routers |
| `packages/services` | Domain logic — features, AI, GitHub, review, billing |
| `packages/database` | Drizzle ORM — schema, migrations, relations, indexes |
| `packages/auth` | BetterAuth — Google OAuth + email/password + demo |

---

## Tech stack

| Layer | Technology |
|---|---|
| **Monorepo** | Turborepo + pnpm workspaces |
| **Frontend** | Next.js 16, React 19, custom Qship design system |
| **API** | Express, tRPC v11, trpc-to-openapi, Scalar |
| **Auth** | BetterAuth — Google OAuth, email/password, demo login |
| **Database** | PostgreSQL 16 + Drizzle ORM — 43 migrations, 14 perf indexes |
| **AI** | OpenAI `gpt-4o-mini` — triage, PRD, tasks, 9-dim PR review, delta re-review |
| **MCP** | MCP 2024-11-05 — 35 tools, JSON-RPC 2.0, CI parity test |
| **GitHub** | GitHub App + Octokit — install, repo sync, webhooks, PR review comments |
| **Background jobs** | In-process workflows on Railway (PRD gen, task gen, AI review); Inngest optional |
| **Billing** | Razorpay — subscription checkout + webhook |
| **CI** | GitHub Actions — parallel type-check + test + E2E + Playwright artifacts |

---

## Local setup

### Prerequisites

- Node.js 20+, pnpm 9+, PostgreSQL 16 (or Docker)

### 1. Clone + install

```bash
git clone https://github.com/ishaansatapathy/Qship.git
cd Qship
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Minimum for local demo (edit `.env`):

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dev
BETTER_AUTH_SECRET=change-me-min-32-chars-long-secret-key!!
BETTER_AUTH_URL=http://localhost:3000
CLIENT_URL=http://localhost:3000
BASE_URL=http://localhost:8000
OPENAI_API_KEY=sk-...

# One-click demo login
DEMO_LOGIN_ENABLED=true
DEMO_USER_EMAIL=demo@qship.dev
DEMO_USER_PASSWORD=DemoPass123!
NEXT_PUBLIC_DEMO_LOGIN_ENABLED=true
```

See [`.env.example`](./.env.example) for all optional variables (GitHub App, Razorpay, MCP, Inngest).

### 3. Database

```bash
pnpm db:up        # Start Postgres via Docker Compose
pnpm db:migrate   # Run 42 Drizzle migrations
pnpm db:seed      # Create demo user + 3 sample feature requests
```

### 4. Start

```bash
pnpm dev
```

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| One-click login | http://localhost:3000/api-auth/demo?next=/brief |
| API | http://localhost:8000 |
| Scalar API docs | http://localhost:8000/docs |
| tRPC | http://localhost:8000/trpc |

### 5. Verify API

```bash
curl http://localhost:8000/health
curl http://localhost:8000/ready
curl -s -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python3 -m json.tool
```

---

## Development commands

```bash
pnpm dev              # Start all services (web + API)
pnpm build            # Production build (all packages)
pnpm check-types      # TypeScript — all packages (zero errors enforced)
pnpm lint             # ESLint across monorepo
pnpm test             # Vitest unit tests
pnpm format           # Prettier
pnpm db:migrate       # Run Drizzle migrations
pnpm db:seed          # Demo user + sample features
pnpm db:studio        # Drizzle Studio (visual DB editor)
pnpm db:generate      # Regenerate Drizzle client after schema changes
```

---

## MCP integration

ShipFlow exposes `POST /mcp` — a fully spec-compliant MCP 2024-11-05 JSON-RPC server with **35 tools**.

### Configure in Cursor / Claude Desktop

Create `mcp-server.json` in your project:

```json
{
  "mcpServers": {
    "shipflow": {
      "url": "https://repoapi-production-adfe.up.railway.app/mcp",
      "type": "http"
    }
  }
}
```

### Test without auth (tools/list is public)

```bash
curl -s -X POST https://repoapi-production-adfe.up.railway.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python3 -c "import json,sys; tools=json.load(sys.stdin)['result']['tools']; print(f'{len(tools)} tools:'); [print(f'  {t[\"name\"]}') for t in tools]"
```

### Authentication

- **Browser:** BetterAuth session cookie (sign in first at `/sign-in`)
- **Headless:** `Authorization: Bearer <SHIPFLOW_MCP_API_KEY>` — set `SHIPFLOW_MCP_API_KEY` + `SHIPFLOW_MCP_USER_ID` in `.env`

---

## GitHub integration

1. Create a **GitHub App** with: `Repository contents (read/write)`, `Pull requests (read/write)`, `Webhooks (receive)`
2. Set webhook URL: `https://repoapi-production-adfe.up.railway.app/webhooks/github`
3. Set in `.env`: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_SLUG`, `GITHUB_WEBHOOK_SECRET`
4. Connect from **Settings → GitHub** in the web app

**What happens automatically after connection:**
- Repositories synced via paginated Octokit (handles 100+ repos)
- Push to `shipflow/<feature-uuid>` branch → PR auto-linked to feature
- PR opened/synchronized → AI review triggered, structured comment posted
- PR merged → feature moves to `human_review` (human approval gate still required)
- PRD-only AI review (no linked PR) → persisted with nullable `pull_request_id`; human gate works without a GitHub PR
- `installation.deleted` webhook → org disconnected gracefully

---

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):

| Job | What it does |
|---|---|
| `static` | TypeScript type-check + ESLint (parallel, no DB needed) |
| `test` | DB migrations → seed → unit tests → build → API smoke test |
| `e2e` | Playwright E2E tests (gated on `static` + `test` passing) |

- Concurrency group cancels stale PR runs automatically
- Playwright failure artifacts uploaded (7-day retention)
- Postgres 16-alpine with 5s health checks

---

## Security

- **Human-in-the-loop:** Confirmation dialogs on PRD generation and ship actions
- **Agent guardrails:** Prompt injection detection, 20/min rate limit, token budget enforcement
- **Feature scoping:** `assertFeatureInUserWorkspace` on every agent tool call
- **GitHub webhooks:** HMAC-SHA256 with `crypto.timingSafeEqual` + delivery-ID idempotency guard
- **MCP key:** Bound to single user ID — no impersonation
- **Approval gate:** `validateHumanApprovalEligibility` prevents human approval if AI review has blocking issues
- **DB:** SQL injection impossible via Drizzle ORM parameterized queries

---

## Documentation index

| File | Purpose |
|---|---|
| [DEMO.md](./DEMO.md) | Judge demo guide — step-by-step with curl proofs and agent prompts |
| [JUDGE_WALKTHROUGH.md](./JUDGE_WALKTHROUGH.md) | 3-minute timed scoring path per rubric criterion |
| [HACKATHON_SUBMISSION.md](./HACKATHON_SUBMISSION.md) | One-pager — rubric map + differentiators |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Full technical deep-dive |
| [.env.example](./.env.example) | All environment variables with inline documentation |
| [mcp-server.json](./mcp-server.json) | MCP client manifest for Cursor / Claude Desktop |

---

## License

Private — ChaiCode hackathon project.
