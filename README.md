# Qship — ShipFlow AI

> **Judge / Evaluator?** → **[HACKATHON_SUBMISSION.md](./HACKATHON_SUBMISSION.md)** · **[DEMO.md](./DEMO.md)** · **[JUDGE_WALKTHROUGH.md](./JUDGE_WALKTHROUGH.md)**

AI-assisted **product delivery platform** — move features from **request → PRD → tasks → code → AI review → human approval → ship**.

Built for the **ChaiCode hackathon** as a production-style **tRPC monorepo SaaS**.

**GitHub:** https://github.com/ishaansatapathy/Qship

---

## 🎬 Demo video

> **[▶ Watch 5-min demo](https://youtu.be/PLACEHOLDER)** — record this and replace the link before submission

---

## ⚡ Live demo (zero setup)

| | URL |
|---|-----|
| **App** | https://qship.ishaandev.co.in/api-auth/demo?next=/brief |
| **Scalar API docs** | https://api.qship.ishaandev.co.in/docs |
| **MCP server** | `POST https://api.qship.ishaandev.co.in/mcp` |

| Field | Value |
|-------|-------|
| Email | `demo@qship.dev` |
| Password | `DemoPass123!` |

---

## Local setup

| Step | Action |
|------|--------|
| 1 | `pnpm install` |
| 2 | Copy `.env.example` → `.env`, add `OPENAI_API_KEY` + `DATABASE_URL` |
| 3 | `pnpm db:migrate && pnpm db:seed` |
| 4 | Set `DEMO_LOGIN_ENABLED=true` in `.env` |
| 5 | `pnpm dev` |
| 6 | Open **http://localhost:3000/api-auth/demo?next=/brief** |

Full guide: **[DEMO.md](./DEMO.md)** · Timed walkthrough: **[JUDGE_WALKTHROUGH.md](./JUDGE_WALKTHROUGH.md)**

---

## Feature table

| Feature | Description | APIs / Tools |
|---------|-------------|--------------|
| **Pipeline overview** | Counts by delivery stage | `/brief`, `get_pipeline_summary` |
| **Feature requests** | Submit, triage, PRD, tasks, timeline | `feature.*` tRPC, MCP feature tools |
| **AI triage** | Priority, effort, clarifying questions | OpenAI + `triage_feature_request` |
| **PRD generation** | Structured PRD (goals, stories, AC) | `generate_feature_prd` |
| **Task breakdown** | Engineering tasks from PRD | `generate_feature_tasks` |
| **Delivery timeline** | Activity log + summary + next step | `feature.delivery` |
| **ShipFlow Agent** | Streaming copilot, 19 tools, sessions | `/agent/stream` |
| **MCP server** | JSON-RPC for Cursor/Claude | `POST /mcp` — 19 tools |
| **GitHub App** | Connect org, list repos, webhooks | `github.*`, Octokit |
| **AI pre-ship review** | Review PRD + tasks before release | `run_ai_review` |
| **Human approval gate** | `human_review` → `approved` → `shipped` | UI + agent tool |
| **Scalar API docs** | Production-grade Scalar judge documentation | `/docs` |

**Agent tools: 19** · **MCP tools: 19** (CI parity test verified)

---

## Core loop

```
Feature Request → PRD → Tasks → Code → AI Review → Fixes → Re-Review → Human Approval → Ship
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                             │
│  Next.js (apps/web)                                         │
│  ├── /brief     — Pipeline overview                         │
│  ├── /requests  — Feature hub (submit, triage, PRD)         │
│  ├── /agent     — ShipFlow Agent (SSE streaming)            │
│  ├── /analytics — Delivery metrics                          │
│  └── /settings  — GitHub App + approval toggles             │
└────────────────────┬────────────────────────────────────────┘
                     │  tRPC + REST (OpenAPI)
┌────────────────────▼────────────────────────────────────────┐
│                    Express API (apps/api)                    │
│  ├── /trpc          — Type-safe tRPC procedures             │
│  ├── /api           — REST (trpc-to-openapi)                  │
│  ├── /mcp           — MCP 2024-11 / JSON-RPC 2.0 (19 tools)  │
│  ├── /agent/stream  — SSE streaming agent                   │
│  ├── /webhooks/github — GitHub App events (HMAC)            │
│  ├── /health        — Liveness                              │
│  ├── /ready         — Readiness (DB)                        │
│  └── /docs          — Scalar OpenAPI reference              │
└──────────┬──────────────────────┬───────────────────────────┘
           │                      │
┌──────────▼──────────┐  ┌────────▼────────────────────────────┐
│   PostgreSQL        │  │   OpenAI + GitHub App                │
│   Drizzle ORM       │  │   Triage, PRD, agent, Octokit repos  │
│   features, PRDs,   │  └─────────────────────────────────────┘
│   tasks, sessions   │
└─────────────────────┘
```

### Key packages

| Package | Purpose |
|---------|---------|
| `apps/web` | Next.js frontend |
| `apps/api` | Express API server |
| `packages/trpc` | Shared tRPC routers |
| `packages/services` | Domain + agent + GitHub |
| `packages/database` | Drizzle schema + migrations |
| `packages/auth` | BetterAuth + demo seed |

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Monorepo | Turborepo + pnpm |
| Web | Next.js 16, custom Qship UI |
| API | Express + tRPC + OpenAPI/Scalar |
| Auth | BetterAuth (Google OAuth + email/password) |
| Database | PostgreSQL + Drizzle ORM |
| GitHub | GitHub App + Octokit + webhooks |
| AI | OpenAI via Vercel AI SDK patterns |
| MCP | MCP 2024-11-05 — 19 ShipFlow tools |

---

## Prerequisites

- **Node.js** 20+
- **pnpm** 9+
- **PostgreSQL** (Docker Compose or Neon)
- **OpenAI API key** (for AI features)
- **GitHub App** (optional — for repo integration)

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/ishaansatapathy/Qship.git
cd Qship
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Minimum for local demo:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dev
BETTER_AUTH_SECRET=change-me-min-32-chars-long-secret-key!!
BETTER_AUTH_URL=http://localhost:3000
CLIENT_URL=http://localhost:3000
BASE_URL=http://localhost:8000
OPENAI_API_KEY=sk-...

# Judge demo
DEMO_LOGIN_ENABLED=true
DEMO_USER_EMAIL=demo@qship.dev
DEMO_USER_PASSWORD=DemoPass123!
NEXT_PUBLIC_DEMO_LOGIN_ENABLED=true
```

See [`.env.example`](./.env.example) for GitHub App, Google OAuth, MCP keys.

### 3. Database

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
```

### 4. Start dev servers

```bash
pnpm dev
```

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API | http://localhost:8000 |
| tRPC | http://localhost:8000/trpc |
| **API docs (Scalar)** | http://localhost:8000/docs |
| Demo login | http://localhost:3000/api-auth/demo?next=/brief |

---

## Development commands

```bash
pnpm dev              # Start all services
pnpm build            # Production build
pnpm check-types      # TypeScript (all packages)
pnpm lint             # ESLint
pnpm test             # Vitest unit tests
pnpm db:migrate       # Run Drizzle migrations
pnpm db:seed          # Demo user + sample features
pnpm db:studio        # Drizzle Studio
```

---

## MCP server

ShipFlow exposes an MCP endpoint at **`POST /mcp`** with **19 tools** (feature pipeline + GitHub + intake + Kanban).

| Endpoint | Purpose |
|----------|---------|
| `POST /mcp` | ShipFlow domain tools (19) — features, review, intake, Kanban, GitHub |

Configure Cursor/Claude using **`mcp-server.json`**:

```json
{
  "mcpServers": {
    "shipflow": {
      "url": "http://localhost:8000/mcp",
      "type": "http"
    }
  }
}
```

Auth: BetterAuth session cookies (sign in first) or `Authorization: Bearer <SHIPFLOW_MCP_API_KEY>` with matching `SHIPFLOW_MCP_USER_ID`.

### Quick test

```bash
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Full tool list: **`mcp-server.json`** · CI parity: `packages/services/ai/tool-parity.test.ts`

---

## API documentation (Scalar)

Available at **http://localhost:8000/docs** — Scalar UI with:

- Judge quick-start intro panel
- Architecture + delivery loop diagram
- Tag groups (Feature Requests, GitHub, Agent, MCP)
- MCP tool appendix (19 tools)
- Reference paths: `/mcp`, `/agent/stream`, `/webhooks/github`, `/ready`
- curl code samples

| Doc | URL / path |
|-----|------------|
| Scalar UI | `{BASE_URL}/docs` |
| OpenAPI JSON | `{BASE_URL}/openapi.json` |
| Full technical guide | `DOCS.md` |
| Judge walkthrough | `JUDGE_WALKTHROUGH.md` |
| Demo script | `DEMO.md` |

---

## GitHub integration

1. Create a GitHub App with repository + PR + webhook permissions
2. Set webhook URL to `{API_URL}/webhooks/github`
3. Add `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_SLUG`, `GITHUB_WEBHOOK_SECRET` to `.env`
4. Connect from **Settings → GitHub** in the web app

---

## Demo mode

### One-click login

```bash
pnpm db:seed
```

Set `DEMO_LOGIN_ENABLED=true`, then open:

```
http://localhost:3000/api-auth/demo?next=/brief
```

### Seeded data

- **Org:** ShipFlow Demo Org
- **Project:** Core Platform
- **Features:** 3 sample requests (submitted, prd_ready, human_review)

### Demo AI limits

Demo account: 3 agent AI runs per browser session (configurable via `NEXT_PUBLIC_DEMO_AGENT_LIMIT`).

---

## Security notes

- Human-in-the-loop: confirm dialogs on PRD generation and ship actions; agent asks before sensitive mutations
- Agent guardrails: prompt injection detection, rate limits (20/min), token budget
- Feature tools scoped to user's workspace via `assertFeatureInUserWorkspace`
- GitHub webhooks: HMAC-SHA256 verification
- MCP API key bound to single user — no arbitrary impersonation

---

## Documentation index

| File | Purpose |
|------|---------|
| [DEMO.md](./DEMO.md) | Judge demo guide + curl + scoring |
| [DOCS.md](./DOCS.md) | Full technical reference |
| [JUDGE_WALKTHROUGH.md](./JUDGE_WALKTHROUGH.md) | 3-minute timed path |
| [HACKATHON_SUBMISSION.md](./HACKATHON_SUBMISSION.md) | One-pager + rubric map |
| [mcp-server.json](./mcp-server.json) | MCP client manifest |
| [SOCIAL_POST.md](./SOCIAL_POST.md) | LinkedIn/X post draft |

---

## Roadmap

- [x] Monorepo + tRPC + BetterAuth
- [x] ShipFlow database schema + migrations
- [x] Feature requests + AI triage + PRD
- [x] ShipFlow Agent (19 tools) + MCP parity
- [x] GitHub App connect + repo sync
- [x] Delivery timeline + summary UI
- [x] Scalar docs + judge walkthrough
- [ ] GitHub PR webhook → feature link
- [ ] PR diff AI review
- [ ] Inngest background jobs
- [ ] Razorpay billing
- [ ] Demo video upload

---

## License

Private — ChaiCode hackathon project.
