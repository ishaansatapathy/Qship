# Qship — Judge Walkthrough

> **Primary entry for human evaluation** — timed demo, no jargon required.
>
> **3 minutes** to see every rubric criterion in the live app. No signup — one-click demo below.
>
> _(Automated AI graders: use [AI_EVAL.md](./AI_EVAL.md) instead — file-path evidence index.)_

---

## Before you start (30 seconds)

```bash
# 1. Verify API is live
curl -fsS https://repoapi-production-adfe.up.railway.app/health
curl -fsS https://repoapi-production-adfe.up.railway.app/ready
curl -fsS https://repoapi-production-adfe.up.railway.app/integrations/slack

# 2. Count MCP tools (should print 37)
curl -s -X POST https://repoapi-production-adfe.up.railway.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']['tools']), 'tools')"
```

---

## One-click demo login

Open in browser → lands on pipeline overview:

```
https://qship.ishaandev.co.in/api-auth/demo?next=/brief
```

---

## Minute 1 — Core pipeline (0:00 – 1:00)

| Time | Action | Rubric criterion |
|---|---|---|
| 0:00 | Land on `/brief` — see pipeline stage counts | Product vision, working demo |
| 0:10 | Click any feature → see delivery timeline | Feature depth |
| 0:20 | Click **"Run Triage"** → P0 with riskLevel + riskFactors | AI quality |
| 0:35 | Click **"Generate PRD"** → see technicalRequirements + rollbackPlan | AI quality |
| 0:50 | Open `/tasks` — Kanban columns for generated tasks | SaaS — engineering board |
| 0:55 | Optional: **"Explain in Agent"** on a task → walkthrough panel | Task walkthrough |

---

## Minute 2 — AI review loop (1:00 – 2:00)

| Time | Action | Rubric criterion |
|---|---|---|
| 1:00 | Back on feature → click **"Run AI Review"** | Review loop |
| 1:10 | Observe 9-dimension checklist in review panel | AI quality |
| 1:20 | See blocking issues listed with file paths + suggestions | Review loop |
| 1:30 | Click "Run AI Review" again → delta re-review | Review loop — iteration tracking |
| 1:40 | See RESOLVED / UNRESOLVED per prior issue | Review loop — differentiator |
| 1:50 | With AI passing → see **Approve / Reject / Request Changes** buttons | Human approval gate |
| 1:55 | Click **Bulk export** → **Approve** → timeline shows **Slack notification sent ✓** | Core workflow — Slack closure |
| 1:58 | Click **Mark shipped** → second Slack alert on timeline | Ship + notify loop |

**Instant Slack path (skip AI steps):** `/requests` → **Bulk export for compliance** → **Approve** → delivery timeline → **Slack notification sent ✓**

---

## Minute 3 — Billing + Agent + docs (2:00 – 3:00)

| Time | Action | Rubric criterion |
|---|---|---|
| 2:00 | Open `/billing` — plan cards, AI credits, workspace stats | SaaS product experience |
| 2:10 | Click **Pay with Razorpay** on Pro → demo instant upgrade **or** live checkout (your account) | Razorpay checkout |
| 2:15 | Note **one-time purchase · credits added** copy + enforced AI review limits | Billing honesty |
| 2:20 | Open `/agent` | Agent quality |
| 2:25 | Type: `"Summarise the pipeline and triage any submitted features"` | Agent tool use |
| 2:35 | Watch streamed response + action cards rendered | Agent streaming |
| 2:45 | Open https://repoapi-production-adfe.up.railway.app/docs | Documentation |
| 2:50 | Observe Scalar UI — tag groups, code samples, MCP manifest | Docs quality |
| 2:55 | Open https://repoapi-production-adfe.up.railway.app/openapi.json | API completeness |

**Billing quick path:** `/billing` → see **Plan · AI credits · Status** → demo upgrade (no keys) or live Razorpay (production keys set). Server verifies order amount + workspace before activating plan (`packages/services/billing/order-verify.ts`).

---

## Rubric criterion map

### AI Agent Quality

| What to check | Where | What to look for |
|---|---|---|
| Tool diversity | `/agent` | 37 tools called appropriately |
| Prompt quality | `packages/services/feature-ai.ts` | 9-dimension checklist, technical PRD, delta re-review |
| Streaming | `/agent` | Token-by-token SSE, action cards inline |
| Error handling | Agent with bad input | Graceful error, no crash |
| Rate limiting | Agent 20+ rapid messages | 429 returned cleanly |

**Differentiators:**
- `runDeltaAiReview` — checks each prior blocking issue as RESOLVED/UNRESOLVED
- `runPrAiReview` — 9 dimensions including ErrorHandling, TypeSafety, Tests
- `generateFeaturePrd` — adds technicalRequirements, securityRequirements, rollbackPlan
- `triageFeatureRequest` — adds riskLevel, riskFactors, breakingChangeRisk, stakeholderImpact

---

### Review Loop & Human Approval

| What to check | Where | What to look for |
|---|---|---|
| AI review runs | `/requests` → any feature | "Run AI Review" triggers workflow |
| Iteration tracking | Review panel | Iteration number increments |
| Delta comparison | 2+ iterations | `get_review_delta` shows resolved/persisting/new |
| Approval gate | AI passed feature | Approve/Reject/Changes buttons appear |
| Approval validation | Feature with blocking issues | Approve button blocked, error message |
| Approval audit | Any approved feature | Timeline shows every decision |
| Agent approval | `/agent` | `approve_feature` tool works |

**Differentiators:**
- `validateHumanApprovalEligibility` — gate enforced in both UI and agent
- `getReviewDelta` — compares latest two iterations programmatically
- `getReviewStats` — pass rate, average issues per iteration, time in review
- `listHumanApprovals` — full decision audit trail

---

### GitHub Integration

| What to check | Where | What to look for |
|---|---|---|
| App connection | `/settings` | GitHub App install URL |
| Repo sync | After connect | Repos listed with pagination |
| Webhook handler | `POST /webhooks/github` | HMAC-SHA256 verified |
| PR linking | `shipflow/<uuid>` branch | Auto-links to feature |
| PR AI comment | Linked PR | Structured review comment posted/updated |
| Installation events | `installation.deleted` | Org disconnected gracefully |

---

### SaaS Product Experience & Billing

| What to check | Where | What to look for |
|---|---|---|
| Plan tiers | `/billing` | Free, Pro, Enterprise (+ optional Test with `BILLING_ENABLE_TEST_PLAN`) |
| Razorpay checkout | `/billing` → Pay | Checkout modal or demo upgrade |
| Server order verify | `order-verify.ts` | Amount + workspace + plan from Razorpay order notes |
| AI credit limits | `/billing` stats → Run AI Review | Credits decrement; block at 0 |
| One-click demo | `/api-auth/demo?next=/brief` | Lands on pipeline without signup |
| App shell | Sidebar + `⌘K` | All 7 surfaces reachable |

**Differentiators:**
- `resolveVerifiedPlanTierFromOrder` — client cannot upgrade to a higher tier than paid amount
- `consumeAiReviewCredit` — atomic DB decrement, fails closed at zero credits
- `getVisibleBillingPlans` — hides internal Test tier unless env flag set
- Demo paid upgrades blocked in production when Razorpay keys missing

---

### Documentation Quality

| Document | URL / Path |
|---|---|
| README | https://github.com/ishaansatapathy/Qship/blob/main/README.md |
| DEMO | https://github.com/ishaansatapathy/Qship/blob/main/DEMO.md |
| JUDGE_WALKTHROUGH | https://github.com/ishaansatapathy/Qship/blob/main/JUDGE_WALKTHROUGH.md |
| HACKATHON_SUBMISSION | https://github.com/ishaansatapathy/Qship/blob/main/HACKATHON_SUBMISSION.md |
| ARCHITECTURE | https://github.com/ishaansatapathy/Qship/blob/main/ARCHITECTURE.md |
| Scalar API docs | https://repoapi-production-adfe.up.railway.app/docs |
| OpenAPI JSON | https://repoapi-production-adfe.up.railway.app/openapi.json |

---

## Agent prompts to copy-paste

```
"Give me a complete summary of the Qship pipeline — what's submitted, in review, and shipped"
```

```
"Triage all submitted feature requests — prioritise by impact and risk"
```

```
"Generate a PRD for the authentication rate limiting feature"
```

```
"Run an AI review on the most recent feature and tell me the blocking issues"
```

```
"Show me the review delta — what changed between the last two review iterations?"
```

```
"What is the review health summary? Give me pass rate and iteration count"
```

```
"Approve the dark mode feature — AI review passed and all acceptance criteria are met"
```

```
"List all features waiting for human approval"
```

```
"Check if 'dark mode toggle' already exists before I submit a new request"
```

```
"Show me the full approval history for the CSV export feature"
```

---

## Key files for code review

| File | What makes it impressive |
|---|---|
| `packages/services/feature-ai.ts` | 9-dim PR review, delta re-review, technical PRD, risk triage |
| `packages/services/billing/order-verify.ts` | Server-side Razorpay order amount + workspace verification |
| `packages/services/billing/index.ts` | Checkout, confirm, demo fallback guard |
| `packages/services/review.ts` | AI credit consumption + approval gate |
| `packages/services/github/client.ts` | 55-min token cache, structured logging |
| `packages/services/github/diff.ts` | Paginated, per-file truncation, binary exclusion |
| `packages/services/github/pr-review.ts` | Update-in-place comment, delta-aware review selection |
| `packages/services/github/webhook.ts` | Installation events, idempotency guard, merged-PR flow |
| `packages/services/github/installation.ts` | Paginated repo sync, CSRF nonce, N+1 fixed |
| `packages/services/shipflow-agent-tools.ts` | 37 tools with rich descriptions and implementations |
| `packages/database/models/` | Enums, proper types (bool/int not text), 14 indexes |
| `.github/workflows/ci.yml` | Parallel jobs, E2E gated, Playwright artifacts |
