# Qship Engineering Guide

> **Rubric:** tRPC Monorepo & Engineering Quality · 
> This document maps the codebase structure, security middleware, test strategy, and deployment gates for judges and reviewers.

---

## Monorepo layout

```
shipflow-ai/                    # Turborepo + pnpm workspaces
├── apps/
│   ├── api/                    # Express HTTP server — webhooks, MCP, agent SSE, tRPC mount
│   └── web/                    # Next.js 16 app — UI + tRPC proxy with CSRF header
├── packages/
│   ├── trpc/                   # tRPC v11 routers, OpenAPI bridge, auth procedures
│   ├── services/               # Domain logic (AI, GitHub, review, billing, security)
│   ├── database/               # Drizzle ORM schema, migrations, relations, health
│   ├── auth/                   # BetterAuth — sessions, OAuth, trustedOrigins
│   ├── logger/                 # Structured JSON logging
│   └── eslint-config/          # Shared ESLint flat config (incl. turbo env vars)
├── .github/workflows/ci.yml    # Parallel static / test / e2e jobs
├── turbo.json                  # Task graph + declared env vars
└── mcp-server.json             # MCP tool manifest (37 tools, CI parity verified)
```

### Package dependency graph

```
web  →  trpc/client
api  →  trpc/server, services, database, logger
trpc →  services, auth, database, logger
services → database, logger
auth → database
```

**Rule:** UI never imports `@repo/database` directly. All data access flows through tRPC → services → Drizzle.

---

## tRPC architecture

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Routers | `packages/trpc/server/routes/*/route.ts` | Input validation (Zod), auth guards, OpenAPI meta |
| Procedures | `packages/trpc/server/trpc.ts` | `publicProcedure`, `protectedProcedure`, `verifiedProcedure`, `mutationProcedure` (alias — required on all state-changing routes) |
| Context | `packages/trpc/server/context.ts` | Session resolution, `x-request-id` propagation |
| Errors | `packages/trpc/server/error-handler.ts` | Sanitized errors — no stack traces to clients |
| OpenAPI | `trpc-to-openapi` + `apps/api/src/openapi-*.ts` | REST bridge at `/api/*`, Scalar docs at `/docs` |

Every protected route calls `assertFeatureInUserWorkspace` or equivalent before mutating data.

---

## API security middleware

Implemented in `apps/api/src/middleware/` and wired in `apps/api/src/server.ts`:

| Middleware | File | Purpose |
|------------|------|---------|
| Helmet | `server.ts:28-33` | Security headers (CSP disabled for Scalar UI) |
| CORS | `server.ts:35-40` | Single-origin credentialed requests (`CLIENT_URL`) |
| Request ID | `middleware/error-handler.ts` | Correlation ID on every request |
| Global rate limit | `middleware/rate-limiters.ts` | 300 req / 15 min per IP (health + `/docs` + `/openapi.json` exempt) |
| Agent rate limit | `middleware/rate-limiters.ts` | 20 req / 1 min on `/agent/stream`, `/mcp` |
| Body size limit | `server.ts` | `express.json({ limit: "256kb" })` |
| Trusted origin + CSRF | `middleware/trusted-origin.ts` | Blocks cross-site POST/PATCH/DELETE |
| Error handler | `middleware/error-handler.ts` | Global 500 handler — no leak |

### CSRF / trusted-origin model

Pure validation logic: `packages/services/security/trusted-origin.ts` (unit tested).

Mutating requests must satisfy **one of**:
1. Safe method (GET/HEAD/OPTIONS)
2. Exempt path (`/webhooks/*`, `/health`, `/ready`, `/api/inngest`)
3. `Authorization: Bearer …` (MCP / headless clients)
4. `x-app-csrf: 1` header (set by Next.js tRPC proxy)
5. `Origin` or `Referer` matches trusted allowlist

BetterAuth also enforces `trustedOrigins` in `packages/auth/index.ts`.

---

## Database layer

- **ORM:** Drizzle with typed schema in `packages/database/models/`
- **Migrations:** `packages/database/drizzle/` — 52 migrations, 14+ performance indexes in `0041_add_indexes.sql`
- **Type safety:** booleans/integers (not text), SQL enums for `billing_status`, `clarification_role`
- **Health:** `packages/database/health.ts` — `pingDatabase()`, used by `/health` and `/ready`
- **Pool:** Configurable timeouts, Neon SSL detection in `packages/database/pg.ts`

---

## Test strategy

| Package | Runner | Scope |
|---------|--------|-------|
| `@repo/services` | Vitest | Domain logic, security, AI guardrails, review health, workflow |
| `@repo/trpc` | Vitest | Error sanitization, procedure helpers, **engineering eval gate** |
| `web` | Playwright | Demo login, pipeline pages (E2E) |
| CI | GitHub Actions | `pnpm test` + API smoke + build gate |

**Key test files for judges:**

```
packages/services/security/trusted-origin.test.ts   # CSRF / origin validation
packages/services/review-health.test.ts             # Review loop scoring
packages/services/feature-analytics.test.ts         # Pipeline health derivation
packages/services/ai/tool-parity.test.ts            # Agent ↔ MCP 37-tool parity
packages/trpc/server/engineering-eval.golden.test.ts  # Monorepo + OpenAPI + CI invariants
packages/trpc/server/error-handler.test.ts          # No stack trace leaks
```

Run locally:

```bash
pnpm check-types   # TypeScript — all 9 packages
pnpm lint          # ESLint — zero warnings enforced
pnpm test          # Vitest unit tests
```

---

## CI/CD pipeline

`.github/workflows/ci.yml` — three parallel jobs:

1. **static** — `pnpm check-types` + `pnpm lint`
2. **test** — Postgres service → migrate → seed → `pnpm test` → golden eval gates (`test:agent-eval`, `test:github-eval`, `test:review-eval`, `test:engineering-eval`) → `pnpm build` → API smoke (`/health`, `/ready`, `/openapi.json`, `/docs` with `PUBLIC_OPENAPI_DOCS=true`)
3. **e2e** — Playwright on main/PR (report uploaded on failure only — never committed)

**Repo cleanliness gate:** CI fails if `test-results/`, `playwright-report/`, or `error-context.md` are tracked.

---

## Deployment reliability

| Check | Endpoint | Expected |
|-------|----------|----------|
| Liveness | `GET /health` | `{ healthy: true, database: "ok" }` |
| Readiness | `GET /ready` | `{ ready: true }` — requires DB |
| Docs | `GET /docs` | Scalar OpenAPI UI |
| MCP | `POST /mcp` | JSON-RPC `tools/list` → 37 tools |

Production boot sequence (`apps/api/src/index.ts`):
1. HTTP server starts immediately (503 until Express loads)
2. Drizzle migrations run (exit 1 in production on failure)
3. Express app mounts with full middleware stack
4. Graceful shutdown on SIGTERM/SIGINT (10s drain)

---

## Environment variables

All runtime env vars are declared in `turbo.json` `globalEnv` — ESLint `turbo/no-undeclared-env-vars` catches undeclared usage at lint time.

See `.env.example` for the full list. Never commit `.env` (gitignored).

---

## Quick verification (judges)

```bash
curl -fsS https://repoapi-production-adfe.up.railway.app/health
curl -fsS https://repoapi-production-adfe.up.railway.app/ready
curl -fsS https://repoapi-production-adfe.up.railway.app/openapi.json | head -c 200
```

Demo login: https://qship.ishaandev.co.in/api-auth/demo?next=/brief
