# Qship API — Vercel deployment

Deploy **`apps/api`** as a separate Vercel project.

**Production domain:** `https://repoapi-production-adfe.up.railway.app`

Full guide (DNS + web project): **`../../DEPLOY.md`**

---

## Required environment variables

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | `postgresql://...@...neon.tech/neondb?sslmode=require` |
| `BASE_URL` | `https://repoapi-production-adfe.up.railway.app` |
| `CLIENT_URL` | `https://qship.ishaandev.co.in` |
| `BETTER_AUTH_SECRET` | **Same as web** — API tRPC loads `@repo/auth` at boot |
| `BETTER_AUTH_URL` | `https://qship.ishaandev.co.in` |
| `OPENAI_API_KEY` | For agent, triage, PRD, review |

Recommended:

| Variable | Purpose |
|----------|---------|
| `PUBLIC_OPENAPI_DOCS` | `true` — Scalar at `/docs` |
| `DEMO_LOGIN_ENABLED` | `true` |
| `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` | Match `pnpm db:seed` |
| `RAZORPAY_*` | Billing checkout + webhook |
| `GITHUB_APP_*` | GitHub integration |
| `SHIPFLOW_INTAKE_WEBHOOK_SECRET` | External intake webhook |

Seed once against prod DB:

```bash
DATABASE_URL="postgresql://..." pnpm db:seed
```

---

## Vercel project settings

| Setting | Value |
|---------|--------|
| **Root Directory** | `apps/api` |
| **Framework Preset** | Other |
| **Build Command** | (from `vercel.json`) `cd ../.. && pnpm --filter @repo/api build` |
| **Install Command** | `cd ../.. && pnpm install --frozen-lockfile --prod=false` |

Build copies `dist/` → `api/dist/` via `scripts/vercel-postbuild.mjs`.

---

## Verify after deploy

```bash
curl https://repoapi-production-adfe.up.railway.app/health
curl https://repoapi-production-adfe.up.railway.app/ready
curl https://repoapi-production-adfe.up.railway.app/docs
curl -s -X POST https://repoapi-production-adfe.up.railway.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 400
```

`/health` returns JSON immediately. `/ready` checks Neon after cold start.

---

## Web app env (must match)

On the **web** Vercel project (`apps/web`):

```env
API_INTERNAL_URL=https://repoapi-production-adfe.up.railway.app
BETTER_AUTH_URL=https://qship.ishaandev.co.in
CLIENT_URL=https://qship.ishaandev.co.in
BASE_URL=https://repoapi-production-adfe.up.railway.app
DATABASE_URL=<same Neon URL>
BETTER_AUTH_SECRET=<same secret as local>
DEMO_LOGIN_ENABLED=true
```

Demo login runs on the **web** app (`/api-auth/demo`) but needs DB + auth env vars there.

---

## Common errors

| Error | Action |
|-------|--------|
| 503 `Missing required env: BETTER_AUTH_SECRET` | Add `BETTER_AUTH_SECRET` + `BETTER_AUTH_URL` on **API** project (same secret as web) → Redeploy |
| 503 `Missing required environment variables` | Set `DATABASE_URL`, `BASE_URL`, `CLIENT_URL` → Redeploy |
| 500 `FUNCTION_INVOCATION_FAILED` | Check Vercel → Functions → `api/index.js` logs; confirm Root Directory is `apps/api` |
| Bundle missing | Build log must show `[vercel-postbuild] Copied dist/` |
| `/docs` empty | Set `PUBLIC_OPENAPI_DOCS=true` |

Cold start runs DB migrations automatically via `runApiBootstrap`.
