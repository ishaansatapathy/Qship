# ShipFlow — Quick Deploy Checklist

Production architecture: **Neon Postgres** · **Railway (API)** · **Vercel (Web)** · **Hostinger DNS**

Estimated time: 15–30 minutes.

---

## 1. Local prep

```powershell
cd path\to\Qship
pnpm install
pnpm db:seed
```

Generate a production auth secret (PowerShell):

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

Save the output — use the same value for `BETTER_AUTH_SECRET` on both Railway and Vercel.

Seed the production database once against Neon:

```bash
DATABASE_URL="postgresql://YOUR_NEON_POOLED_URL" pnpm db:seed
```

---

## 2. Railway — API (`apps/api`)

1. Open [Railway](https://railway.app) → **New Project** → deploy from GitHub repo `ishaansatapathy/Qship`
2. Set **Root Directory** / start command to `apps/api` (or use the existing Railway service)
3. Add environment variables from [`deploy/vercel-api.env.template`](./vercel-api.env.template) (values from local `.env`):

| Variable | Production value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `BASE_URL` | `https://repoapi-production-adfe.up.railway.app` |
| `CLIENT_URL` | `https://qship.ishaandev.co.in` |
| `BETTER_AUTH_SECRET` | Same as Vercel web |
| `BETTER_AUTH_URL` | `https://qship.ishaandev.co.in` |
| `OPENAI_API_KEY` | From OpenAI dashboard |
| `DEMO_LOGIN_ENABLED` | `true` |
| `SLACK_WEBHOOK_URL` | Optional — see [Slack setup](#5-slack-notifications-optional) |

4. Deploy → verify:

```bash
curl -fsS https://repoapi-production-adfe.up.railway.app/health
curl -fsS https://repoapi-production-adfe.up.railway.app/ready
curl -fsS https://repoapi-production-adfe.up.railway.app/integrations/slack
```

---

## 3. Vercel — Web (`apps/web`)

1. [Vercel](https://vercel.com) → **Add New → Project** → repo `ishaansatapathy/Qship`
2. **Root Directory:** `apps/web`
3. Add variables from [`deploy/vercel-web.env.template`](./vercel-web.env.template):

```env
DATABASE_URL=<Neon pooled URL>
BETTER_AUTH_SECRET=<same as Railway>
BETTER_AUTH_URL=https://qship.ishaandev.co.in
CLIENT_URL=https://qship.ishaandev.co.in
BASE_URL=https://repoapi-production-adfe.up.railway.app
API_INTERNAL_URL=https://repoapi-production-adfe.up.railway.app
NEXT_PUBLIC_API_BASE_URL=https://repoapi-production-adfe.up.railway.app
DEMO_LOGIN_ENABLED=true
NEXT_PUBLIC_DEMO_LOGIN_ENABLED=true
```

4. Deploy → attach custom domain `qship.ishaandev.co.in`

---

## 4. Hostinger DNS

In hPanel → Domains → DNS records:

| Type | Name | Value |
|------|------|-------|
| CNAME | `qship` | Vercel-provided CNAME (Domains tab) |

Point the Vercel web project to `qship.ishaandev.co.in`. The API remains on Railway (`repoapi-production-adfe.up.railway.app`).

---

## 5. Slack notifications (optional)

Required only for **live** Slack channel messages. Without it, approve/ship still works and records delivery on the feature timeline (simulated mode).

1. [Create a Slack workspace](https://slack.com/get-started) (free)
2. Open **[api.slack.com/apps](https://api.slack.com/apps)** → **Create New App** → **From scratch**
3. App name: `ShipFlow` · Workspace: yours
4. **Incoming Webhooks** → toggle **On** → **Add New Webhook to Workspace**
5. Select channel `#product-shipping` (or any channel) → **Allow**
6. Copy the webhook URL
7. Railway API → **Variables** → add:

```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T…/B…/…
```

8. Redeploy → confirm `"mode": "live"`:

```bash
curl -fsS https://repoapi-production-adfe.up.railway.app/integrations/slack
```

**Demo test:** [Demo login → `/requests`](https://qship.ishaandev.co.in/api-auth/demo?next=/requests) → **Bulk export** → **Approve** → check Slack channel or delivery timeline.

---

## 6. External webhooks

| Service | URL |
|---------|-----|
| Google OAuth redirect | `https://qship.ishaandev.co.in/api/auth/callback/google` |
| GitHub OAuth callback | `https://qship.ishaandev.co.in/api/auth/callback/github` |
| GitHub App webhook | `https://repoapi-production-adfe.up.railway.app/webhooks/github` |
| Razorpay webhook | `https://repoapi-production-adfe.up.railway.app/webhooks/razorpay` |

---

## 7. Final verification

```bash
node scripts/verify-production.mjs
```

| Test | URL |
|------|-----|
| Demo login | https://qship.ishaandev.co.in/api-auth/demo?next=/brief |
| Slack status | https://repoapi-production-adfe.up.railway.app/integrations/slack |
| Scalar docs | https://repoapi-production-adfe.up.railway.app/docs |

---

Full detail: [DEPLOY.md](../DEPLOY.md) · Judge docs: [AI_EVAL.md](../AI_EVAL.md) · [JUDGE_WALKTHROUGH.md](../JUDGE_WALKTHROUGH.md)
