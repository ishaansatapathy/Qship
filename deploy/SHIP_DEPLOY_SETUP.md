# SHIP_DEPLOY_WEBHOOK_URL — setup (5 minutes)

When a PM clicks **Mark shipped**, ShipFlow:

1. Merges the linked GitHub PR (if connected)
2. **POSTs to `SHIP_DEPLOY_WEBHOOK_URL`**
3. Only then marks the feature `shipped` (production)

Without this URL on **Railway API**, ship fails in production with:
`Configure SHIP_DEPLOY_WEBHOOK_URL before shipping in production.`

---

## Where to set it

| Service | Variable | Value |
|---------|----------|--------|
| **Railway** (`apps/api`) | `SHIP_DEPLOY_WEBHOOK_URL` | Vercel Deploy Hook URL |
| Vercel web | ❌ Not needed | — |

---

## Step 1 — Create Vercel Deploy Hook

1. Open [Vercel Dashboard](https://vercel.com) → your **qship web** project (`apps/web`)
2. **Settings** → **Git** → scroll to **Deploy Hooks**
3. Click **Create Hook**
   - **Name:** `shipflow-ship`
   - **Branch:** `main`
4. Copy the URL — looks like:

```
https://api.vercel.com/v1/integrations/deploy/prj_XXXXX/YYYYYYYY
```

---

## Step 2 — Add to Railway

1. [Railway](https://railway.app) → **qship-api** service
2. **Variables** → **New Variable**

```env
SHIP_DEPLOY_WEBHOOK_URL=https://api.vercel.com/v1/integrations/deploy/prj_XXXXX/YYYYYYYY
NODE_ENV=production
```

3. **Redeploy** the API service (Railway picks up new env)

---

## Step 3 — Verify (no ship required)

```bash
curl -fsS https://repoapi-production-adfe.up.railway.app/integrations/ship
```

Expected:

```json
{
  "configured": true,
  "mode": "live",
  "production": true,
  "hookHost": "api.vercel.com",
  "setupHint": "Railway API → SHIP_DEPLOY_WEBHOOK_URL = ..."
}
```

Or run from repo root:

```bash
pnpm verify:prod
```

---

## Step 4 — Optional: test hook fires a deploy

⚠️ This starts a **real Vercel production deploy**.

```bash
SHIP_DEPLOY_WEBHOOK_URL="https://api.vercel.com/v1/integrations/deploy/..." node scripts/test-ship-deploy-webhook.mjs --trigger
```

Check Vercel → Deployments → new build should appear.

---

## Demo / local dev

Local `.env` — leave empty or set `ALLOW_SIMULATED_DEPLOY=true`:

```env
# SHIP_DEPLOY_WEBHOOK_URL=
ALLOW_SIMULATED_DEPLOY=true
```

Ship works without webhook in development.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Ship fails: `Configure SHIP_DEPLOY_WEBHOOK_URL` | Set variable on **Railway**, not Vercel web |
| `/integrations/ship` shows `configured: false` | Redeploy Railway after adding env |
| Deploy hook returns 404 | Recreate hook in Vercel; URL may be revoked |
| Ship fails: `Deploy webhook failed: HTTP 401` | Wrong hook URL — copy fresh from Vercel |
