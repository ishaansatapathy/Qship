# ShipFlow — Full production deploy (one shot)

**Order:** Vercel (API + Web, all env) → Hostinger DNS → external dashboards (Google / GitHub / Razorpay) → verify.

| Layer | Service | Role |
|-------|---------|------|
| Database | **Neon** | Postgres (already in `.env`) — **Railway not needed** |
| API | **Vercel** | `apps/api` → `api.qship.ishaandev.co.in` |
| Web | **Vercel** | `apps/web` → `qship.ishaandev.co.in` |
| Domain DNS | **Hostinger** | CNAME records only |

**Live URLs after deploy:**

| | URL |
|---|-----|
| App | https://qship.ishaandev.co.in |
| Demo login | https://qship.ishaandev.co.in/api-auth/demo?next=/brief |
| API / Scalar | https://api.qship.ishaandev.co.in/docs |
| MCP | `POST https://api.qship.ishaandev.co.in/mcp` |

---

## Phase 0 — Before Vercel (10 min)

### 0.1 Production auth secret

Local `.env` mein `BETTER_AUTH_SECRET` placeholder hai — **pehle naya banao** (same value web Vercel pe use hogi):

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

### 0.2 Seed Neon (ek baar, apni machine se)

```bash
cd "path/to/Qship"
DATABASE_URL="postgresql://YOUR_NEON_POOLED_URL" pnpm db:seed
```

### 0.3 Code on GitHub

```bash
git push origin main
```

---

## Phase 1 — Vercel: API project (`qship-api`)

1. https://vercel.com → **Add New → Project** → repo **`ishaansatapathy/Qship`**
2. **Root Directory:** `apps/api`
3. **Environment variables** — paste **Production** (copy values from local `.env`, URLs below production wale):

```env
# ── Required ──
DATABASE_URL=<Neon pooled URL from .env>
BASE_URL=https://api.qship.ishaandev.co.in
CLIENT_URL=https://qship.ishaandev.co.in
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

# ── GitHub App (repos, PRs, webhooks) ──
GITHUB_APP_ID=<from .env>
GITHUB_APP_SLUG=<from .env, e.g. qship-shipflow>
GITHUB_APP_PRIVATE_KEY=<full PEM — paste as one line with \n or multiline in Vercel>
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

# ── MCP headless (optional — generate random key + your user id from DB) ──
SHIPFLOW_MCP_API_KEY=<random-long-string>
SHIPFLOW_MCP_USER_ID=<demo user uuid after seed>

# ── Logging ──
LOGGER_LEVEL=info
```

4. **Deploy** → note Vercel URL: `https://qship-api-xxxxx.vercel.app`
5. Test (cold start 5–15s):

```bash
curl https://qship-api-xxxxx.vercel.app/health
curl https://qship-api-xxxxx.vercel.app/ready
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
BASE_URL=https://api.qship.ishaandev.co.in
API_INTERNAL_URL=https://api.qship.ishaandev.co.in
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

Pehle Vercel mein domain add karo (Settings → Domains), phir jo **exact CNAME** Vercel dikhaye woh Hostinger pe daalo.

| Type | Name | Points to (example — use Vercel’s value) |
|------|------|------------------------------------------|
| CNAME | `qship` | `cname.vercel-dns.com` |
| CNAME | `api.qship` | `cname.vercel-dns.com` |

**Vercel → Domains:**
- `qship-api` project → add `api.qship.ishaandev.co.in`
- `qship-web` project → add `qship.ishaandev.co.in`

DNS propagate: 5–30 min (kabhi 24h).

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
| Webhook URL | `https://api.qship.ishaandev.co.in/webhooks/github` |
| Webhook secret | same as `GITHUB_WEBHOOK_SECRET` in Vercel API env |

---

## Phase 6 — Razorpay

Dashboard → **Webhooks** → Add:

| Field | Value |
|-------|-------|
| URL | `https://api.qship.ishaandev.co.in/webhooks/razorpay` |
| Secret | same as `RAZORPAY_WEBHOOK_SECRET` in API env |
| Events | `payment.captured`, `order.paid` (or all payment events) |

Test mode keys OK for hackathon demo.

---

## Phase 7 — Final verify checklist

| # | Test | Pass? |
|---|------|-------|
| 1 | https://api.qship.ishaandev.co.in/ready | `ready: true` |
| 2 | https://api.qship.ishaandev.co.in/docs | Scalar loads |
| 3 | https://qship.ishaandev.co.in | Landing |
| 4 | `/api-auth/demo?next=/brief` | Demo login |
| 5 | `/brief` | Pipeline counts |
| 6 | `/inbox` → Simulate → Send | Intake works |
| 7 | `/agent` | Streaming + tools |
| 8 | `/billing` | Razorpay modal |
| 9 | Sign in with **Google** | OAuth redirect OK |
| 10 | Sign in with **GitHub** | OAuth redirect OK |
| 11 | `/settings` → Connect GitHub App | Install flow |
| 12 | MCP `tools/list` curl | 19 tools |

```bash
curl -s -X POST https://api.qship.ishaandev.co.in/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 500
```

---

## Railway?

**Not used for this project.** Postgres = **Neon**, apps = **Vercel**. Railway tab skip karo unless you later move API off serverless.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Google OAuth `redirect_uri_mismatch` | Phase 4 URIs exact match |
| GitHub OAuth fails | Phase 5a callback URL |
| Demo login fails | `pnpm db:seed` + `DEMO_*` on **web** Vercel |
| tRPC 503 waking up | API cold start — refresh |
| CORS | API `CLIENT_URL` = `https://qship.ishaandev.co.in` exactly |
| GitHub App webhook 401 | `GITHUB_WEBHOOK_SECRET` match |
| `GITHUB_APP_PRIVATE_KEY` error | Paste full PEM in Vercel (with `\n` newlines) |

---

## Copy-paste order (summary)

1. Generate `BETTER_AUTH_SECRET` + `pnpm db:seed`
2. Vercel **API** — all env → Deploy
3. Vercel **Web** — all env → Deploy
4. Hostinger CNAME `qship` + `api.qship`
5. Vercel attach custom domains → Redeploy both
6. Google + GitHub OAuth + GitHub App + Razorpay webhooks
7. Phase 7 checklist

**Ek session mein sab — kuch baad ke liye mat chhodo.**
