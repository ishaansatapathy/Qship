# ShipFlow AI — Architecture

> Full technical reference. For a 3-minute judge path: **[JUDGE_WALKTHROUGH.md](./JUDGE_WALKTHROUGH.md)**

---

## System overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Browser (Next.js 16)                              │
│                                                                             │
│  /brief       Pipeline overview — stage counts, next actions                │
│  /requests    Feature hub — submit, triage, PRD, tasks, review, approve     │
│  /agent       ShipFlow Agent — SSE streaming copilot (37 tools)             │
│  /tasks       Engineering Kanban (backlog → todo → in_progress → done)      │
│  /analytics   Delivery metrics — throughput, cycle time, stage funnel       │
│  /inbox       Multi-channel intake (email, support, API)                    │
│  /settings    GitHub App connect + approval toggles                         │
│  /billing     One-time Razorpay checkout + AI credit entitlements           │
│  /queue       Approval queue                                                │
│  /calendar    Calendar integration                                          │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                     tRPC (cookie auth) + REST (trpc-to-openapi)
                               │
┌──────────────────────────────▼──────────────────────────────────────────────┐
│                         Express API (apps/api)                              │
│                                                                             │
│  /trpc                  tRPC v11 — all feature, GitHub, billing procedures  │
│  /api/*                 REST — trpc-to-openapi auto-generated               │
│  /mcp                   MCP 2024-11-05 JSON-RPC — 25 ShipFlow tools        │
│  /agent/stream          SSE streaming agent (rate-limited, guardrailed)     │
│  /webhooks/github       GitHub App events (HMAC-SHA256, idempotent)        │
│  /webhooks/razorpay     Billing events                                      │
│  /webhooks/intake       Multi-channel feature intake                        │
│  /health                Liveness probe                                      │
│  /ready                 Readiness probe (DB ping)                           │
│  /docs                  Scalar OpenAPI reference                            │
│  /openapi.json          Raw OpenAPI spec                                    │
└──────────┬───────────────────────────────────────┬──────────────────────────┘
           │                                       │
┌──────────▼───────────┐              ┌────────────▼────────────────────────┐
│ PostgreSQL 16 (Neon) │              │  External services                  │
│                      │              │                                     │
│ Tables (26):         │              │  OpenAI gpt-4o-mini                 │
│  feature_requests    │              │  → triage, PRD, tasks, review,      │
│  feature_prds        │              │    delta re-review (9 dimensions)   │
│  clarification_msgs  │              │                                     │
│  engineering_tasks   │              │  GitHub App (Octokit)               │
│  pull_requests       │              │  → Install, repo sync, PR create,   │
│  ai_reviews          │              │    webhook verify, PR comment       │
│  ai_review_issues    │              │                                     │
│  human_approvals     │              │  Inngest                            │
│  workflow_runs       │              │  → PRD gen, task gen, AI review     │
│  organizations       │              │    background workflows             │
│  projects            │              │                                     │
│  repositories        │              │  Razorpay                           │
│  agent_chat_sessions │              │  → Subscription checkout +          │
│  agent_chat_history  │              │    webhook billing events           │
│  users + sessions    │              │                                     │
│  (+ 11 more)         │              └─────────────────────────────────────┘
│                      │
│ 53 Drizzle migrations│
│ 14 performance idxs  │
│ SQL enums (2)        │
└──────────────────────┘
```

---

## Monorepo structure

```
shipflow-ai/
├── apps/
│   ├── web/              Next.js 16 — full UI
│   └── api/              Express API server
├── packages/
│   ├── trpc/             Shared tRPC routers + procedures
│   ├── services/         Domain logic
│   │   ├── feature-ai.ts          OpenAI prompts (triage, PRD, review)
│   │   ├── review.ts              Review persistence + approval gate
│   │   ├── shipflow-agent-tools.ts 37 tools (agent + MCP parity)
│   │   ├── github/                GitHub App integration
│   │   │   ├── client.ts          Octokit + 55-min token cache
│   │   │   ├── config.ts          Env + validation
│   │   │   ├── diff.ts            Paginated PR diff + truncation
│   │   │   ├── installation.ts    Install, sync, disconnect
│   │   │   ├── pr.ts              PR creation + rich body
│   │   │   ├── pr-review.ts       AI review + GitHub comment upsert
│   │   │   └── webhook.ts         Event routing + idempotency
│   │   ├── ai/                    OpenAI client + agent executor
│   │   ├── workflows/             Inngest workflow handlers
│   │   ├── billing/               Razorpay checkout + webhook
│   │   └── inngest/               Event dispatch + Inngest client
│   ├── database/         Drizzle ORM — schema, migrations, relations
│   │   ├── models/                26 table definitions
│   │   ├── drizzle/               53 SQL migration files
│   │   ├── schema.ts              Barrel export
│   │   ├── relations.ts           All Drizzle relations
│   │   ├── pg.ts                  Pool + connection management
│   │   └── health.ts              DB health check + version info
│   ├── auth/             BetterAuth configuration + demo seed
│   ├── logger/           Structured logger
│   └── typescript-config/ Shared tsconfig bases
├── .github/
│   └── workflows/ci.yml  Parallel CI (static + test + e2e)
├── README.md             Setup + stack + live URLs
├── DEMO.md               Judge demo guide
├── JUDGE_WALKTHROUGH.md  3-minute timed scoring path
├── HACKATHON_SUBMISSION.md Rubric map + differentiators
└── ARCHITECTURE.md       This file
```

---

## Core delivery loop — state machine

```
submitted
  ├─► clarifying          (clarifying questions added)
  ├─► duplicate_education (capability already exists)
  ├─► rejected            (PM rejected at triage)
  └─► prd_generating
        └─► prd_ready
              └─► planning
                    └─► plan_approved
                          └─► in_development
                                └─► pr_open
                                      └─► ai_review
                                            ├─► fix_needed   (blocking issues)
                                            │     └─► ai_review (re-review loop)
                                            └─► human_review (AI passed)
                                                  ├─► fix_needed (changes requested)
                                                  ├─► rejected   (PM rejected)
                                                  └─► approved
                                                        └─► shipped
```

**Status transitions enforced by:**
- `updateFeatureStatus` — validates allowed transitions
- `validateHumanApprovalEligibility` — blocks approval if AI review has blocking issues
- `recordHumanApproval` — routes to correct next status per decision

---

## AI layer

### Prompts architecture (`packages/services/feature-ai.ts`)

All AI calls use `createChatCompletion` with `jsonObject: true` for structured JSON output.

#### `triageFeatureRequest`

Returns 9 fields including:

| New field | Purpose |
|---|---|
| `riskLevel` | low / medium / high / critical |
| `riskFactors[]` | concrete: data migration, compliance, breaking change, etc. |
| `breakingChangeRisk` | boolean — affects release strategy |
| `stakeholderImpact` | engineering / sales / compliance / customers |

Temperature: 0.2 (deterministic for consistent prioritisation)

#### `generateFeaturePrd`

Returns 10 structured sections:

| Section | Purpose |
|---|---|
| `problemStatement` | Who, what, why now |
| `goals[]` | Measurable outcomes with targets |
| `nonGoals[]` | Explicit scope exclusions |
| `userStories[]` | "As a X, I want Y so that Z" |
| `acceptanceCriteria[]` | Given/When/Then testable criteria |
| `technicalRequirements[]` | API surface, performance budgets, compatibility |
| `securityRequirements[]` | Auth checks, rate limits, data classification |
| `edgeCases[]` | Boundary conditions + failure modes |
| `testingStrategy[]` | Test scenarios per acceptance criterion |
| `rollbackPlan` | How to safely disable/revert |
| `successMetrics[]` | Quantifiable post-launch KPIs |

#### `generateFeatureTasks`

Each task includes:

| Field | Type |
|---|---|
| `title` | Imperative, ≤ 60 chars |
| `description` | 2-4 sentences with implementation hints |
| `type` | `backend / frontend / infra / testing / docs / design` |
| `status` | `todo` (first 2) / `backlog` (rest) |
| `acceptanceCriteria[]` | Per-task testable criteria |

Ordering: schema/API → backend logic → frontend → tests (mandatory) → docs

#### `runPrAiReview` — 9-dimension checklist

| Dimension | What it checks |
|---|---|
| PRD Requirements | Acceptance criteria → code mapping |
| Security | Auth, injection, CORS, rate limiting, IDOR |
| Performance | N+1 queries, unbounded loops, blocking calls |
| Error Handling | Unhandled promises, empty catch blocks |
| Type Safety | `any` types, missing null checks |
| Tests | Test files in diff, implementation/test ratio |
| Edge Cases | PRD edge cases handled |
| Compatibility | Breaking API changes, migration files |
| Code Quality | `console.log`, dead code, magic constants |

Every issue has: `severity`, `category`, `title`, `description`, `suggestion`, `filePath`, `lineNumber`, `requirementRef`

#### `runDeltaAiReview` — delta re-review

For iteration > 1, the AI receives the previous review's blocking issues and must classify each as:
- `RESOLVED` — fix verified in the new diff
- `PARTIALLY_RESOLVED` — fix attempted but incomplete
- `UNRESOLVED` — no change in the diff

The model cannot return `pass: true` without resolving all prior blocking issues.

---

## GitHub App integration

### Token caching (`client.ts`)

Installation tokens are valid for 1 hour. We cache Octokit instances for 55 minutes:

```
request → cache hit? → return cached Octokit
         → cache miss → new Octokit(auth: createAppAuth) → cache with 55-min TTL
```

Cache is invalidated immediately on `installation.deleted` webhook.

### Webhook processing (`webhook.ts`)

**Idempotency:** `X-GitHub-Delivery` ID stored in Postgres (`github_webhook_deliveries`). Duplicate deliveries return immediately; rows expire after 7 days.

**Event routing (`github-webhook.ts`):**

| Event | Handler |
|---|---|
| `pull_request.opened/reopened/synchronize` | Link to feature, update DB, trigger AI review |
| `pull_request.closed` + `merged=true` | Feature → `human_review` (or `approved` if pre-approved) |
| `pull_request.closed` + `merged=false` | Activity log only |
| `installation.deleted` | Clear org link, evict token cache |
| `installation_repositories.removed` | Delete revoked repos from DB |

### Diff processing (`diff.ts`)

- `octokit.paginate()` — handles PRs with 100+ changed files
- Per-file patch truncation: 4,000 chars/file (preserves breadth over depth)
- Total diff limit: 24,000 chars (~6k tokens, fits gpt-4o-mini context)
- Binary/generated files excluded from patches (`.png`, `.min.js`, `.lock`, etc.)

### PR body (`pr.ts`)

Each ShipFlow PR includes:
- Hidden machine-readable tag: `<!-- ShipFlow-Feature: <uuid> -->`
- Acceptance criteria as `- [ ]` checklist
- Engineering task list
- AI review pipeline notice

### Review comment (`pr-review.ts`)

Searches for existing `<!-- shipflow-ai-review -->` comment and **updates it in-place** — no comment spam on each push. Comment includes severity table, advisory section, and acceptance criteria checklist.

---

## Database schema

### Key tables

| Table | Key columns |
|---|---|
| `feature_requests` | id, status (16 states), organizationId, metadata (JSON: triage, lastAiReview) |
| `feature_prds` | featureRequestId, version, content (JSON: 10 PRD sections) |
| `ai_reviews` | featureRequestId, pullRequestId, iteration, readyForHuman (boolean), rawAnalysis (JSON) |
| `ai_review_issues` | aiReviewId, severity (blocking/non_blocking), category, title, resolved (boolean) |
| `human_approvals` | featureRequestId, reviewerUserId, decision, notes |
| `engineering_tasks` | featureRequestId, title, description, status, sortOrder |
| `pull_requests` | featureRequestId, repositoryId, githubPrNumber (integer), state |

### Type correctness (fixed from text anti-patterns)

| Column | Before | After |
|---|---|---|
| `ai_reviews.ready_for_human` | `text("false")` | `boolean` |
| `ai_review_issues.resolved` | `text("false")` | `boolean` |
| `workflow_runs.progress` | `text("0")` | `integer` |
| `organizations.ai_review_credits` | `text("10")` | `integer` |
| `organizations.repository_limit` | `text("1")` | `integer` |

### SQL enums

| Enum | Values |
|---|---|
| `billing_status` | `active / past_due / canceled / trialing / paused` |
| `clarification_role` | `user / agent / system` |

### Performance indexes (14 total)

| Table | Index purpose |
|---|---|
| `feature_requests` | org+status, project_id, org+created_at |
| `clarification_messages` | feature_request_id |
| `engineering_tasks` | feature+sort_order, feature+status |
| `pull_requests` | feature_id, repository_id, **unique**(repo, pr_number) |
| `ai_reviews` | feature+created_at, pull_request_id |
| `ai_review_issues` | ai_review_id |
| `workflow_runs` | feature+status, inngest_event_id (partial) |
| `organizations` | github_installation_id (partial) |
| `repositories` | full_name (unique), org_id |

---

## MCP server (37 tools)

Endpoint: `POST /mcp` — MCP 2024-11-05, JSON-RPC 2.0

Public methods: `initialize`, `tools/list`, `resources/list`, `prompts/list`

Protected: `tools/call` — session cookie or `Authorization: Bearer <SHIPFLOW_MCP_API_KEY>`

### Tool categories

| Category | Tools | Count |
|---|---|---|
| Workspace | `get_workspace`, `get_pipeline_summary` | 2 |
| Features | `list_feature_requests`, `get_feature_request`, `create_feature_request`, `triage_feature_request`, `generate_feature_prd`, `generate_feature_tasks`, `add_clarification`, `update_feature_status`, `get_feature_delivery` | 9 |
| Review | `run_ai_review`, `list_ai_reviews`, `get_review_delta`, `get_review_stats` | 4 |
| Approval | `request_human_review`, `approve_feature`, `reject_feature`, `request_changes`, `get_approval_history` | 5 |
| Kanban | `update_engineering_task_status` | 1 |
| Intake | `intake_from_channel`, `check_existing_capability` | 2 |
| GitHub | `github_connection_status`, `list_github_repositories` | 2 |

**Total: 37 tools**

CI parity test: `packages/services/ai/tool-parity.test.ts`

---

## Authentication

| Method | How |
|---|---|
| **Demo login** | `GET /api-auth/demo?next=/brief` → BetterAuth sets session cookie |
| **Email/password** | `POST /sign-in` via BetterAuth |
| **Google OAuth** | BetterAuth Google provider (configure `GOOGLE_CLIENT_ID`) |
| **MCP headless** | `Authorization: Bearer <SHIPFLOW_MCP_API_KEY>` |

Session cookies: `httpOnly`, `SameSite=Lax`, `Secure` in production.

---

## CI pipeline

`.github/workflows/ci.yml`:

```yaml
jobs:
  static:   # TypeScript + ESLint — no DB needed, runs in parallel
  test:     # Postgres 16 service → migrate → seed → vitest → build → API smoke test
  e2e:      # Playwright — gated on static + test, uploads report on failure
```

- `concurrency` group cancels stale PR runs
- `needs: [static, test]` ensures E2E only runs when quality gates pass
- Playwright artifacts retained 7 days
- Postgres 16-alpine with 5s health check interval

---

## Environment variables

See `.env.example` for all variables with inline documentation.

Minimum to run locally:

```env
DATABASE_URL          # PostgreSQL connection string
BETTER_AUTH_SECRET    # ≥32 chars — session encryption
BETTER_AUTH_URL       # http://localhost:3000
CLIENT_URL            # http://localhost:3000
BASE_URL              # http://localhost:8000
OPENAI_API_KEY        # For all AI features
DEMO_LOGIN_ENABLED    # true — enables one-click demo login
```

Optional for full feature set:

```env
GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY / GITHUB_APP_SLUG / GITHUB_WEBHOOK_SECRET
RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET
SHIPFLOW_MCP_API_KEY / SHIPFLOW_MCP_USER_ID
INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
```
