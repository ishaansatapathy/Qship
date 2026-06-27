# ShipFlow AI — Hackathon Submission Pack

> **Judges: start here.** One-click demo, 3-minute path, rubric map — everything in one place.

**GitHub:** https://github.com/ishaansatapathy/Qship  
**Tagline:** *Structured delivery from idea to production — not ad-hoc code generation.*

---

## ⚡ 60-Second Elevator Pitch

ShipFlow is a **full-stack SaaS** that runs the entire product delivery loop:

**Request → Educate (if duplicate) → PRD → Kanban Tasks → Code/PR → AI Review → Human Approval → Ship**

- **Multi-channel intake** — email, support tickets, customer calls, in-app
- **19 MCP tools** — same surface as the ShipFlow Agent (CI parity verified)
- **Human-in-the-loop** — confirm dialogs, approval gates, agent safety prompts
- **Production stack** — Neon Postgres, BetterAuth, tRPC, Razorpay, GitHub App, Inngest, Scalar docs

---

## 🚀 One-Click Demo (zero setup pain)

```bash
pnpm install && cp .env.example .env   # add OPENAI_API_KEY
pnpm db:migrate && pnpm db:seed
pnpm dev
```

| Link | What it shows |
|------|----------------|
| [**Demo login → Overview**](http://localhost:3000/api-auth/demo?next=/brief) | Pipeline counts, needs-attention |
| [**Demo → Intake**](http://localhost:3000/api-auth/demo?next=/inbox) | Email/support/call simulate |
| [**Demo → Requests**](http://localhost:3000/api-auth/demo?next=/requests) | Core loop, PRD, triage, timeline |
| [**Demo → Kanban**](http://localhost:3000/api-auth/demo?next=/tasks) | Engineering task board |
| [**Demo → Agent**](http://localhost:3000/api-auth/demo?next=/agent) | Streaming AI + 19 tools |
| [**Demo → Billing**](http://localhost:3000/api-auth/demo?next=/billing) | Razorpay checkout (test mode) |
| [**Scalar API docs**](http://localhost:8000/docs) | OpenAPI + judge intro + MCP appendix |

| Credential | Value |
|------------|-------|
| Email | `demo@qship.dev` |
| Password | `DemoPass123!` |

---

## 🎬 5-Minute Demo Path (record this)

| Time | Screen | Wow moment |
|------|--------|------------|
| 0:00 | Landing → demo login | Problem statement hook |
| 0:30 | `/brief` | Real pipeline counts from **Neon Postgres** |
| 1:00 | `/inbox` → Simulate Email → Send | Multi-channel intake + AI triage |
| 1:45 | `/requests` → PRD generate (confirm dialog) | HITL + delivery timeline |
| 2:30 | `/tasks` | Kanban — move task across columns |
| 3:00 | `/agent` → attach feature → ask | 19 tools, streaming, action cards |
| 3:45 | `/billing` → Pay with Razorpay | SaaS monetization (test Netbanking → Success) |
| 4:15 | `:8000/docs` | Scalar docs + MCP curl |
| 4:45 | Close | GitHub repo + `#chaicode` |

Full demo guide (includes 5-min recording path): **[DEMO.md](./DEMO.md)**

---

## 📊 Rubric → Evidence Map

| Category (max) | Score target | Where to look | Proof |
|----------------|-------------|---------------|-------|
| **Core Workflow** (20) | 19+ | `/requests`, `/tasks`, `/inbox` | Intake → triage → PRD → Kanban → status flow |
| **AI Agent** (20) | 19+ | `/agent`, `POST /mcp` | 19 tools, SSE, sessions, tool memory, educate-if-exists |
| **GitHub** (15) | 13+ | `/settings`, Scalar GitHub routes | App install, repo sync, webhook HMAC |
| **Review & Approval** (15) | 14+ | Requests detail, `/billing` | AI review iterations, human_review, confirm dialogs |
| **Engineering** (15) | 15 | Monorepo, CI, types | tRPC + OpenAPI, Drizzle, 52 unit tests, tool parity |
| **SaaS UX** (10) | 10 | Shell, Cmd+K, skeletons | Pipeline overview, Kanban, intake hub, billing |
| **Demo & Docs** (5) | 5 | This file + Scalar + video | One-click demo, walkthrough, submission pack |

---

## 🛠 Feature Matrix (what we built)

| Feature | Route / API | Judge signal |
|---------|-------------|--------------|
| Pipeline overview | `/brief` | Real DB counts |
| Multi-channel intake | `/inbox`, `POST /webhooks/intake` | Email/support/call simulate |
| Educate if exists | `check_existing_capability` | Duplicate detection before build |
| Feature requests hub | `/requests` | Submit, triage, PRD, timeline |
| Engineering Kanban | `/tasks` | 5-column board + status updates |
| ShipFlow Agent | `/agent/stream` | 19 tools, streaming, focus |
| MCP server | `POST /mcp` | Cursor/Claude integration |
| AI pre-ship review | `run_ai_review`, `list_ai_reviews` | Blocking/non-blocking findings |
| Human approval | `human_review` → `approved` → `shipped` | Confirm dialogs |
| GitHub App | `/settings` | Repos, PRs, webhooks |
| Razorpay billing | `/billing` | Plans, credits, test checkout |
| Background jobs | Inngest | PRD/tasks/AI review workflows |
| Cloud DB | Neon Postgres | Production-ready persistence |
| API docs | `/docs` (Scalar) | Judge quick-start + curl samples |

**Agent tools: 19 · MCP tools: 19 · CI parity:** `packages/services/ai/tool-parity.test.ts`

---

## 🔧 MCP Quick Test

```bash
# List 19 tools (no auth)
curl -s -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Pipeline summary (session cookie or Bearer MCP key)
curl -s -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -H "Cookie: <from-browser-after-login>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_pipeline_summary","arguments":{}}}'
```

Manifest: **`mcp-server.json`**

---

## 💳 Razorpay (test mode)

1. Add `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` to `.env` → restart `pnpm dev`
2. `/billing` → **Pro** → **Pay with Razorpay**
3. **Netbanking** → any bank → **Success** (easiest in test mode)
4. Plan upgrades to Pro · 100 AI credits

Fallback: without keys, **demo mode** upgrades instantly (for judge reliability).

---

## 📁 Documentation Index

| Doc | Purpose |
|-----|---------|
| **This file** | Submission one-pager + rubric map |
| [DEMO.md](./DEMO.md) | Full judge demo + curl + workflows + recording path |
| [JUDGE_WALKTHROUGH.md](./JUDGE_WALKTHROUGH.md) | Timed 3-minute path |
| [README.md](./README.md) | Setup, architecture, deploy |
| [DOCS.md](./DOCS.md) | Technical deep-dive |
| [mcp-server.json](./mcp-server.json) | MCP client config |

---

## ✅ Pre-Submit Checklist

- [ ] `pnpm db:seed` — demo data loaded
- [ ] `pnpm test` — 52+ tests pass (tool parity included)
- [ ] Demo login works → `/brief` shows counts
- [ ] Intake simulate sends to pipeline
- [ ] Kanban `/tasks` shows seeded tasks
- [ ] Razorpay modal opens OR demo billing works
- [ ] **Demo video recorded** (5 min) — upload link in README
- [ ] GitHub pushed · README has video URL

---

**Builder Mode On | ChaiCode Hackathon | #chaicode**
