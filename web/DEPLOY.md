# Deploying the Khoj web app to Vercel

The `web/` Next.js app is the single developer portal (+ consumer site). The Python
extraction pipeline is NOT deployed here — it's a batch job that runs locally. Only this
folder goes to Vercel.

## Vercel project settings
- **Root Directory:** `web`  ← important; the repo root is the data pipeline.
- **Framework preset:** Next.js (auto-detected).
- **Build command / Install / Output:** defaults (`next build`). No overrides.
- Node 20+ (Vercel default is fine; built locally on Node 24).

## Environment variables (Production + Preview)
| Var | Required | Value / note |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | service-role key — server-only; powers signup + key create/list + usage reads |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | anon key — used for password login |
| `ADMIN_SESSION_SECRET` | ✅ | strong random string; signs the `dev_session` cookie (HMAC). Must be set and stable, or login/signup throw. |
| `NEXT_PUBLIC_API_BASE` | ⬜ recommended | `https://khoj-ibli.onrender.com` (the live API). Has a default, but set it explicitly. |

**Do NOT set `ADMIN_ENABLED`.** The middleware 404s all `/admin` routes unless it's
`"true"`, so leaving it unset keeps the admin console completely off in production.
`ADMIN_PASSWORD` is therefore not needed either (nothing to protect). `NEXT_PUBLIC_SUPABASE_URL`
is unused by the code — skip it.

## What ships
All of `web/` deploys as one app. Public routes:
- `/` + `/poi/[slug]` — consumer site (dogfoods the live API)
- `/developers`, `/developers/docs`, `/developers/signup|login|dashboard` — the portal
- `/admin/*` — **404 in production** (admin disabled)

### Optional: make it developer-portal-only
If you want only the portal public for now, redirect the home page to `/developers`
(instead of the consumer site) — a one-liner we can add to `middleware.ts` or
`next.config.ts` at deploy time. Default (as built) keeps the consumer site live.

## CORS
No change needed — the Go API sends `Access-Control-Allow-Origin: *`, so the deployed
portal (new origin) can fetch the OpenAPI spec and call `/v1` (incl. the docs "try it").

## Post-deploy smoke test
1. `/developers` loads; `/developers/docs` renders the Scalar reference.
2. `/developers/signup` → create account → dashboard loads.
3. Create a key → `curl -H "X-API-Key: khoj_..." $NEXT_PUBLIC_API_BASE/v1/places?limit=3` → 200.
4. `/admin` → 404 (confirms admin is off).

## Verified before first deploy
- `next build` passes clean on the modified Next (16.2.10). `/developers/docs` prerenders static.
- Only 7 env vars referenced in code; list above is complete.
