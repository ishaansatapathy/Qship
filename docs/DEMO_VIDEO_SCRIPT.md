# ShipFlow — Demo Video Script (~5 minutes)

Use this script to record a hackathon submission video — show the **core loop**, **agent + MCP**, **Scalar docs**, and **human-in-the-loop**.

---

## Before recording

```bash
pnpm install
cp .env.example .env
# Set OPENAI_API_KEY, DEMO_LOGIN_ENABLED=true
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev
```

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API + Scalar | http://localhost:8000/docs |

**Demo login:** http://localhost:3000/api-auth/demo?next=/brief  
**Credentials:** `demo@qship.dev` / `DemoPass123!`

---

## Scene 1 — Hook (0:00–0:30)

**Screen:** Landing page → tagline

**Voiceover:**

> "Great software isn't shipped by code generation alone. Every feature follows a process: Request, PRD, Tasks, Code, AI Review, Human Approval, Ship. ShipFlow AI is a full-stack SaaS that manages that entire loop."

**Action:** Click **Sign in** → **Try demo account**

---

## Scene 2 — Pipeline overview (0:30–1:00)

**Screen:** `/brief` — pipeline cards (submitted, in delivery, awaiting approval, shipped)

**Voiceover:**

> "The overview shows your delivery pipeline at a glance — not vanity metrics, but where features actually are in the lifecycle."

**Action:** Point at sample counts from seeded demo data.

---

## Scene 3 — Feature request + AI triage (1:00–2:00)

**Screen:** `/requests`

**Action:**
1. Click **New request**
2. Title: `Webhook retry with dead-letter queue`
3. Description: `When GitHub webhooks fail, retry 3 times then store in DLQ for ops review.`
4. Submit with **Run AI triage** checked
5. Open detail panel → show triage (priority, questions)
6. Click **Generate PRD** → confirm dialog → show PRD sections
7. Show **Delivery timeline** + plain-language summary

**Voiceover:**

> "Employees submit requests in plain language. AI triages priority and gaps, then generates a structured PRD. Every step is logged on the delivery timeline."

---

## Scene 4 — ShipFlow Agent (2:00–3:00)

**Screen:** `/agent`

**Action:**
1. Attach the feature you just created (focus chip)
2. Prompt: *"Break this into engineering tasks and explain the next step for the team."*
3. Show streaming response + action cards
4. Show session sidebar + tool memory

**Voiceover:**

> "The ShipFlow Agent has 14 tools — same as our MCP server, verified in CI. It respects workspace boundaries and asks before sensitive actions like shipping."

---

## Scene 5 — GitHub + Settings (3:00–3:30)

**Screen:** `/settings`

**Action:** Show GitHub App connect flow (or connected state with repo list)

**Voiceover:**

> "GitHub App integration links real repositories. Webhooks are HMAC-verified — production-grade from day one."

---

## Scene 6 — Scalar API docs (3:30–4:15)

**Screen:** http://localhost:8000/docs

**Action:**
1. Scroll intro panel — architecture, core loop, MCP tool list
2. Expand **Feature Requests → POST /feature/requests**
3. Expand **MCP & Streaming → POST /mcp** — show curl sample
4. Show **GET /ready** reference path

**Voiceover:**

> "Full Scalar API documentation — judge quick-start, delivery loop, MCP appendix, and curl examples."

---

## Scene 7 — MCP curl (4:15–4:45)

**Terminal:**

```bash
curl -s -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 600
```

**Voiceover:**

> "Fourteen MCP tools expose the entire delivery pipeline to Claude, Cursor, or any MCP client."

---

## Scene 8 — Close (4:45–5:00)

**Screen:** `/brief` or landing

**Voiceover:**

> "ShipFlow AI — structured delivery from idea to production. Built with tRPC, BetterAuth, Drizzle, and OpenAI. Builder Mode On."

**On-screen text:** GitHub repo URL · `#chaicode`

---

## Optional B-roll

- Delivery panel **next step** hint changing after status update
- Demo bar showing AI limits (demo account)
- `pnpm test` passing tool-parity test in terminal
