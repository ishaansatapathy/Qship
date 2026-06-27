# ShipFlow — Production Deploy (Vercel + ishaandev.co.in)

Two Vercel projects from the same GitHub repo:

| Project | Root directory | Custom domain |
|---------|----------------|---------------|
| **qship-web** | `apps/web` | `https://qship.ishaandev.co.in` |
| **qship-api** | `apps/api` | `https://api.qship.ishaandev.co.in` |

Database: **Neon Postgres** (already in your `.env`).

---

## 1. DNS (ishaandev.co.in)

In your domain panel (GoDaddy / Cloudflare / etc.), add:

| Type | Name | Value |
|------|------|-------|
| **CNAME** | `qship` | `cname.vercel-dns.com` |
| **CNAME** | `api.qship` | `cname.vercel-dns.com` |

After each Vercel project is created, Vercel → **Settings → Domains** → add the domain → follow exact CNAME if different.

---

## 2. Deploy API first (`apps/api`)

### Vercel project settings

| Setting | Value |
|---------|--------|
| **Import repo** | `github.com/ishaansatapathy/Qship` |
| **Project name** | `qship-api` (or your choice) |
| **Root Directory** | `apps/api` |
| **Framework** | Other (uses `vercel.json`) |

### Environment variables (Production)

Copy from your local `.env` where noted:

```env
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
BASE_URL=https://api.qship.ishaandev.co.in
CLIENT_URL=https://qship.ishaandev.co.in
NODE_ENV=production

OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
PUBLIC_OPENAPI_DOCS=true

DEMO_LOGIN_ENABLED=true
DEMO_USER_EMAIL=demo@qship.dev
DEMO_USER_PASSWORD=DemoPass123!

# Optional — GitHub App
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_SLUG=
GITHUB_WEBHOOK_SECRET=

# Optional — Razorpay (live or test)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Optional — MCP headless
SHIPFLOW_MCP_API_KEY=
SHIPFLOW_MCP_USER_ID=

SHIPFLOW_INTAKE_WEBHOOK_SECRET=
```

### Seed production DB (once)

```bash
DATABASE_URL="postgresql://YOUR_NEON_URL" pnpm db:seed
```

Run from repo root on your machine (not on Vercel).

### Verify API

```bash
curl https://api.qship.ishaandev.co.in/health
curl https://api.qship.ishaandev.co.in/ready
curl https://api.qship.ishaandev.co.in/docs
```

Cold start: first request may take 5–15s; retry `/ready`.

Details: **`apps/api/VERCEL_DEPLOY.md`**

---

## 3. Deploy Web (`apps/web`)

### Vercel project settings

| Setting | Value |
|---------|--------|
| **Root Directory** | `apps/web` |
| **Project name** | `qship-web` |
| **Framework** | Next.js |

### Environment variables (Production)

```env
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
BETTER_AUTH_SECRET=same-32-char-secret-as-local
BETTER_AUTH_URL=https://qship.ishaandev.co.in
CLIENT_URL=https://qship.ishaandev.co.in
BASE_URL=https://api.qship.ishaandev.co.in
API_INTERNAL_URL=https://api.qship.ishaandev.co.in
NODE_ENV=production

DEMO_LOGIN_ENABLED=true
NEXT_PUBLIC_DEMO_LOGIN_ENABLED=true
DEMO_USER_EMAIL=demo@qship.dev
DEMO_USER_PASSWORD=DemoPass123!
NEXT_PUBLIC_DEMO_USER_EMAIL=demo@qship.dev

OPENAI_API_KEY=sk-...

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

NEXT_PUBLIC_DEMO_AGENT_LIMIT=3
```

`API_INTERNAL_URL` **must** point to the working API deployment.

### Verify Web

| URL | Expected |
|-----|----------|
| https://qship.ishaandev.co.in | Landing page |
| https://qship.ishaandev.co.in/api-auth/demo?next=/brief | Demo login → pipeline |
| https://qship.ishaandev.co.in/brief | Dashboard (after login) |

---

## 4. Post-deploy webhooks

| Service | Webhook URL |
|---------|-------------|
| **GitHub App** | `https://api.qship.ishaandev.co.in/webhooks/github` |
| **Razorpay** | `https://api.qship.ishaandev.co.in/webhooks/razorpay` |
| **Intake** | `https://api.qship.ishaandev.co.in/webhooks/intake` |

---

## 5. Update docs with live URLs

After deploy, replace `localhost` in:

- `DEMO.md` quick links
- `JUDGE_WALKTHROUGH.md`
- `HACKATHON_SUBMISSION.md`
- README demo section

Production URLs:

| Service | URL |
|---------|-----|
| Web | https://qship.ishaandev.co.in |
| Demo login | https://qship.ishaandev.co.in/api-auth/demo?next=/brief |
| Scalar | https://api.qship.ishaandev.co.in/docs |
| MCP | `POST https://api.qship.ishaandev.co.in/mcp` |

---

## 6. Deploy via CLI (optional)

```bash
npm i -g vercel
cd apps/api && vercel --prod
cd ../web && vercel --prod
```

Link each project to the correct root directory when prompted.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| 503 Missing env vars | Add vars in Vercel → Redeploy |
| Demo login fails | Run `pnpm db:seed` on Neon; check `DEMO_LOGIN_ENABLED` on **web** |
| tRPC 503 "API waking up" | API cold start — wait and refresh |
| CORS errors | `CLIENT_URL` on API must match web domain exactly |
| Scalar 404 | Set `PUBLIC_OPENAPI_DOCS=true` on API |
