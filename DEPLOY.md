# ShipFlow — Full production deploy (one shot)

**Order:** Neon seed → Railway (API) → Vercel (Web) → Hostinger DNS → external dashboards (Google / GitHub / Razorpay / Slack) → verify.

| Layer | Service | Role |
|-------|---------|------|
| Database | **Neon** | Postgres (already in `.env`) — **Railway not needed** |
| API | **Railway** | `apps/api` → `repoapi-production-adfe.up.railway.app` |
| Web | **Vercel** | `apps/web` → `qship.ishaandev.co.in` |
| Domain DNS | **Hostinger** | CNAME records only |

**Live URLs after deploy:**

| | URL |
|---|-----|
| App | https://qship.ishaandev.co.in |
| Demo login | https://qship.ishaandev.co.in/api-auth/demo?next=/brief |
| API / Scalar | https://repoapi-production-adfe.up.railway.app/docs |
| MCP | `POST https://repoapi-production-adfe.up.railway.app/mcp` |

---

## Phase 0 — Before Vercel (10 min)

### 0.1 Production auth secret

Local `.env` uses a placeholder for `BETTER_AUTH_SECRET` — **generate a new secret first** (use the same value on both Railway API and Vercel web):

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

### 0.2 Seed Neon (once, from your machine)

```bash
cd "path/to/Qship"
DATABASE_URL="postgresql://YOUR_NEON_POOLED_URL" pnpm db:seed
```

### 0.3 Code on GitHub

```bash
git push origin main
```

---

## Phase 1 — Railway: API (`apps/api`)

The API runs as a **long-lived Express process on Railway** (workflows, webhooks, MCP, agent SSE).

1. [Railway](https://railway.app) → connect repo **`ishaansatapathy/Qship`** → service root **`apps/api`**
2. **Environment variables** — paste **Production** (copy values from local `.env`):

```env
# ── Required ──
DATABASE_URL=<Neon pooled URL from .env>
BASE_URL=https://repoapi-production-adfe.up.railway.app
CLIENT_URL=https://qship.ishaandev.co.in
BETTER_AUTH_SECRET=<same value as Vercel web — tRPC session needs this>
BETTER_AUTH_URL=https://qship.ishaandev.co.in
NODE_ENV=production

# ── AI ──
OPENAI_API_KEY=<from .env>
OPENAI_MODEL=gpt-4o-mini

# ── Docs ──
PUBLIC_OPENAPI_DOCS=true

# ── Demo login (parity with web) ──
DEMO_LOGIN_ENABLED=true
DEMO_USER_EMAIL=demo@qship.dev
DEMO_USER_PASSWORD=DemoPass123!

# ── Slack (optional — live approve/ship notifications) ──
SLACK_WEBHOOK_URL=<Slack Incoming Webhook — https://api.slack.com/apps>

# ── GitHub App (repos, PRs, webhooks) ──
GITHUB_APP_ID=<from .env>
GITHUB_APP_SLUG=<from .env, e.g. qship-shipflow>
GITHUB_APP_PRIVATE_KEY=<full PEM — paste as one line with \n or multiline>
GITHUB_WEBHOOK_SECRET=<from .env>

# ── Razorpay ──
RAZORPAY_KEY_ID=<from .env>
RAZORPAY_KEY_SECRET=<from .env>
RAZORPAY_WEBHOOK_SECRET=<from .env>

# ── Intake webhook ──
SHIPFLOW_INTAKE_WEBHOOK_SECRET=<from .env>

# ── Inngest (workflows) ──
INNGEST_EVENT_KEY=<from .env>
INNGEST_SIGNING_KEY=<from .env>

# ── MCP headless (optional) ──
SHIPFLOW_MCP_API_KEY=<random-long-string>
SHIPFLOW_MCP_USER_ID=<demo user uuid after seed>

# ── Logging ──
LOGGER_LEVEL=info
```

3. **Deploy** → URL: `https://repoapi-production-adfe.up.railway.app`
4. Test:

```bash
curl -fsS https://repoapi-production-adfe.up.railway.app/health
curl -fsS https://repoapi-production-adfe.up.railway.app/ready
curl -fsS https://repoapi-production-adfe.up.railway.app/integrations/slack
```

---

## Phase 2 — Vercel: Web project (`qship-web`)

1. **Add New → Project** → same repo
2. **Root Directory:** `apps/web`
3. **Environment variables** — **Production:**

```env
# ── Required ──
DATABASE_URL=<same Neon pooled URL>
BETTER_AUTH_SECRET=<NEW secret from Phase 0.1 — NOT the placeholder>
BETTER_AUTH_URL=https://qship.ishaandev.co.in
CLIENT_URL=https://qship.ishaandev.co.in
BASE_URL=https://repoapi-production-adfe.up.railway.app
API_INTERNAL_URL=https://repoapi-production-adfe.up.railway.app
NODE_ENV=production

# ── Web / tRPC ──
NEXT_PUBLIC_API_URL=/trpc

# ── Demo login ──
DEMO_LOGIN_ENABLED=true
NEXT_PUBLIC_DEMO_LOGIN_ENABLED=true
DEMO_USER_EMAIL=demo@qship.dev
DEMO_USER_PASSWORD=DemoPass123!
NEXT_PUBLIC_DEMO_USER_EMAIL=demo@qship.dev
SEED_USER_EMAIL=demo@qship.dev
SEED_DEMO_PASSWORD=DemoPass123!
NEXT_PUBLIC_DEMO_AGENT_LIMIT=3

# ── Google sign-in (BetterAuth) ──
GOOGLE_CLIENT_ID=<from .env>
GOOGLE_CLIENT_SECRET=<from .env>
# aliases OK too:
GOOGLE_OAUTH_CLIENT_ID=<same as GOOGLE_CLIENT_ID>
GOOGLE_OAUTH_CLIENT_SECRET=<same as GOOGLE_CLIENT_SECRET>

# ── GitHub sign-in (BetterAuth — OAuth app, NOT GitHub App) ──
GITHUB_CLIENT_ID=<from .env>
GITHUB_CLIENT_SECRET=<from .env>

# ── AI (if any server-side web routes need it) ──
OPENAI_API_KEY=<from .env>
OPENAI_MODEL=gpt-4o-mini

# ── Legacy (CI / compat) ──
JWT_SECRET=<same as BETTER_AUTH_SECRET or separate 32+ chars>
JWT_REFRESH_SECRET=<another 32+ chars>
```

4. **Deploy** → test: `https://qship-web-xxxxx.vercel.app`

---

## Phase 3 — Hostinger DNS (`ishaandev.co.in`)

**hPanel → Domains → ishaandev.co.in → DNS / Nameservers → DNS records**

Add the domain in Vercel first (Settings → Domains), then paste the **exact CNAME** Vercel provides into Hostinger.

| Type | Name | Points to (example — use Vercel’s value) |
|------|------|------------------------------------------|
| CNAME | `qship` | `cname.vercel-dns.com` |
| CNAME | `api.qship` | `cname.vercel-dns.com` |

**Vercel → Domains:**
- `qship-api` project → add `repoapi-production-adfe.up.railway.app`
- `qship-web` project → add `qship.ishaandev.co.in`

DNS propagation: 5–30 minutes (occasionally up to 24 hours).

**After DNS live — redeploy both projects** (so env URLs match custom domain).

---

## Phase 4 — Google Cloud Console (Google sign-in)

https://console.cloud.google.com → APIs & Services → **Credentials** → your OAuth client

**Authorized JavaScript origins:**
```
https://qship.ishaandev.co.in
```

**Authorized redirect URIs:**
```
https://qship.ishaandev.co.in/api/auth/callback/google
```

Save → wait 2–5 min → test **Sign in with Google** on production.

---

## Phase 5 — GitHub (two separate things)

### 5a — GitHub OAuth (sign-in button)

https://github.com/settings/developers → your OAuth App

| Field | Value |
|-------|-------|
| Homepage URL | `https://qship.ishaandev.co.in` |
| Authorization callback URL | `https://qship.ishaandev.co.in/api/auth/callback/github` |

### 5b — GitHub App (Settings → Connect GitHub, PRs, webhooks)

https://github.com/settings/apps → your app (`qship-shipflow`)

| Field | Value |
|-------|-------|
| Homepage URL | `https://qship.ishaandev.co.in` |
| Callback URL | `https://qship.ishaandev.co.in/settings` |
| Webhook URL | `https://repoapi-production-adfe.up.railway.app/webhooks/github` |
| Webhook secret | same as `GITHUB_WEBHOOK_SECRET` in Vercel API env |

---

## Phase 6 — Razorpay

Dashboard → **Webhooks** → Add:

| Field | Value |
|-------|-------|
| URL | `https://repoapi-production-adfe.up.railway.app/webhooks/razorpay` |
| Secret | same as `RAZORPAY_WEBHOOK_SECRET` in API env |
| Events | `payment.captured`, `order.paid` (or all payment events) |

Test mode keys OK for hackathon demo.

---

## Phase 7 — Final verify checklist

| # | Test | Pass? |
|---|------|-------|
| 1 | https://repoapi-production-adfe.up.railway.app/ready | `ready: true` |
| 2 | https://repoapi-production-adfe.up.railway.app/docs | Scalar loads |
| 3 | https://qship.ishaandev.co.in | Landing |
| 4 | `/api-auth/demo?next=/brief` | Demo login |
| 5 | `/brief` | Pipeline counts |
| 6 | `/inbox` → Simulate → Send | Intake works |
| 7 | `/agent` | Streaming + tools |
| 8 | `/billing` | Razorpay modal |
| 9 | Sign in with **Google** | OAuth redirect OK |
| 10 | Sign in with **GitHub** | OAuth redirect OK |
| 11 | `/settings` → Connect GitHub App | Install flow |
| 12 | MCP `tools/list` curl | **37 tools** |
| 13 | `/integrations/slack` | `mode: live` or `simulated` |
| 14 | `/requests` → Bulk export → Approve | Timeline: **Slack notification sent ✓** |

```bash
curl -fsS https://repoapi-production-adfe.up.railway.app/integrations/slack
node scripts/verify-production.mjs
```

---

## Architecture summary

| Layer | Service | Role |
|-------|---------|------|
| Database | **Neon** | Postgres |
| API | **Railway** | Express — workflows, webhooks, MCP, agent SSE |
| Web | **Vercel** | Next.js frontend |
| DNS | **Hostinger** | CNAME for custom domain |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Google OAuth `redirect_uri_mismatch` | Phase 4 URIs exact match |
| GitHub OAuth fails | Phase 5a callback URL |
| Demo login fails | `pnpm db:seed` + `DEMO_*` on **Vercel web** and **Railway API** |
| tRPC errors | Verify `API_INTERNAL_URL` / `BASE_URL` point to Railway |
| CORS | API `CLIENT_URL` = `https://qship.ishaandev.co.in` exactly |
| GitHub App webhook 401 | `GITHUB_WEBHOOK_SECRET` match |
| Slack shows `simulated` | Add `SLACK_WEBHOOK_URL` on Railway API — see README Slack section |
| `GITHUB_APP_PRIVATE_KEY` error | Paste full PEM in Railway (with `\n` newlines) |

---

## Copy-paste order (summary)

1. Generate `BETTER_AUTH_SECRET` + `pnpm db:seed` (Neon)
2. **Railway API** — all env → Deploy
3. **Vercel Web** — all env → Deploy
4. Hostinger CNAME `qship`
5. Vercel attach custom domain → Redeploy web
6. Google + GitHub OAuth + GitHub App + Razorpay webhooks
7. Optional: `SLACK_WEBHOOK_URL` on Railway
8. Phase 7 checklist + `node scripts/verify-production.mjs`

Complete all steps in one session — do not leave external dashboards for later.
