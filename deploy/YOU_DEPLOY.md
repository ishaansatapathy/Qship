# Tumhara kaam — Vercel + Hostinger (15–30 min)

Code deploy-ready hai. Bas yeh karo:

## 1. Prep (terminal)

```powershell
cd "c:\Users\IshaanSatapathy\Desktop\hatho se buni hui bra"
pnpm deploy:prep
pnpm db:seed
```

`deploy:prep` naya `BETTER_AUTH_SECRET` print karega — copy karke rakho.

## 2. Vercel — API

- New project → repo `Qship` → **Root: `apps/api`**
- **Pehle saari env vars add karo, phir Deploy** (build ke liye `DATABASE_URL` zaroori)
- Env vars: open `deploy/vercel-api.env.template` → har line Vercel mein paste (`.env` se values)
- **`BETTER_AUTH_SECRET` web jaisa same** — API bina iske boot nahi hota
- Deploy → `/health` check on `*.vercel.app` URL

## 3. Vercel — Web

- New project → same repo → **Root: `apps/web`**
- **Pehle saari env vars add karo, phir Deploy**
- Env vars: `deploy/vercel-web.env.template` + `BETTER_AUTH_SECRET` from step 1
- Deploy

## 4. Hostinger DNS

| Type | Name | Value |
|------|------|-------|
| CNAME | `qship` | Vercel se (Domains tab) |
| CNAME | `api.qship` | Vercel se |

Vercel: API project → `api.qship.ishaandev.co.in` · Web project → `qship.ishaandev.co.in`

## 5. OAuth (5 min each)

**Google** → redirect: `https://qship.ishaandev.co.in/api/auth/callback/google`

**GitHub OAuth** → callback: `https://qship.ishaandev.co.in/api/auth/callback/github`

**GitHub App** → webhook: `https://api.qship.ishaandev.co.in/webhooks/github`

**Razorpay** → webhook: `https://api.qship.ishaandev.co.in/webhooks/razorpay`

## 6. Test

https://qship.ishaandev.co.in/api-auth/demo?next=/brief

---

Full detail: [DEPLOY.md](../DEPLOY.md)
