# ShipFlow AI

AI-assisted product delivery platform — move features from **request → PRD → tasks → code → AI review → human approval → ship**.

Built for the ChaiCode hackathon as a **tRPC monorepo** SaaS.

## Tech stack

| Layer | Choice |
|-------|--------|
| Monorepo | Turborepo + pnpm |
| Web | Next.js 16, Tailwind, shadcn/ui (in progress) |
| API | Express + tRPC + OpenAPI/Scalar |
| Auth | BetterAuth (planned) |
| Database | PostgreSQL + Drizzle ORM |
| Payments | Razorpay |
| GitHub | Octokit + webhooks |
| AI | Vercel AI SDK |
| Jobs | Inngest |
| Deploy | Vercel (web) + Railway/Render (API) |

## Architecture

```
apps/
├── api/                 # Express — /trpc, GitHub webhooks, Inngest serve
└── web/                 # Next.js — dashboard, landing, auth

packages/
├── trpc/                # Type-safe routers (health, feature, …)
├── database/            # Drizzle schema — multi-tenant ShipFlow models
├── services/            # Domain logic + workflow constants
└── logger/
```

### Core loop

```
Feature Request → PRD → Tasks → Code → AI Review → Fixes → Re-Review → Human Approval → Ship
```

### Database schema (high level)

- **Auth** — users, sessions, accounts (BetterAuth-compatible)
- **Organizations** — workspaces, members, plan tier, Razorpay IDs
- **Projects & repositories** — GitHub repo links per workspace
- **Feature requests** — status workflow, clarification messages
- **PRDs** — structured JSON (problem, goals, stories, acceptance criteria, …)
- **Engineering tasks** — Kanban statuses
- **Pull requests** — linked to GitHub PRs (real data only)
- **AI reviews & issues** — blocking / non-blocking findings
- **Human approvals** — final release gate
- **Workflow runs** — Inngest job progress tracking

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:generate   # generate migration from schema
pnpm db:migrate
pnpm dev
```

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API | http://localhost:8000 |
| tRPC | http://localhost:8000/trpc |
| API docs | http://localhost:8000/docs |

## Environment variables

See [`.env.example`](./.env.example) for:

- `DATABASE_URL`, `BETTER_AUTH_*`
- `GITHUB_APP_*`, `GITHUB_WEBHOOK_SECRET`
- `OPENAI_API_KEY` / AI provider keys
- `INNGEST_*`
- `RAZORPAY_*`

## GitHub integration (setup)

1. Create a GitHub App with repo, PR, and webhook permissions
2. Set webhook URL to `{API_URL}/webhooks/github`
3. Store installation ID + credentials in env
4. Connect repo from **Dashboard → GitHub**

## Inngest workflows (planned)

| Event | Purpose |
|-------|---------|
| `feature/prd.generate` | AI PRD from clarified request |
| `feature/tasks.generate` | Break PRD into engineering tasks |
| `github/pr.analyze` | Fetch diff, run AI review |
| `github/pr.rereview` | Re-review after fixes |
| `feature/release.check` | Human approval readiness |

## AI features (planned)

- Requirement clarification chat
- PRD generation
- Task breakdown
- PR diff analysis vs PRD + acceptance criteria
- Blocking / non-blocking issue classification
- Release readiness summary

## Roadmap

- [x] Monorepo + tRPC foundation
- [x] ShipFlow database schema
- [x] Landing + dashboard shell
- [ ] BetterAuth multi-tenant auth
- [ ] Feature request CRUD + AI clarification
- [ ] PRD & task generation (AI SDK + Inngest)
- [ ] GitHub App + webhooks + Octokit
- [ ] AI PR review loop
- [ ] Razorpay billing
- [ ] Deploy + demo video

## License

Private — ChaiCode hackathon project.
