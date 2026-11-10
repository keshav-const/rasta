# Khoj Developer Portal — architecture & Next.js guide

A narrative walkthrough of the **`web/` developer portal**: accounts, sessions, and API-key
management — what each piece does, the Next.js/React concepts behind it, and the *why this /
why not that* for every decision. Companion to the API-side docs:

- **This doc** = the portal (the thing developers log into).
- [`../rasta-api/ARCHITECTURE.md`](../../rasta-api/ARCHITECTURE.md) = the Go API that serves the data.
- [`../rasta-api/DECISIONS.md`](../../rasta-api/DECISIONS.md) = terse decision records (ADRs).

> ⚠️ **This is a modified Next.js** (16.2.x, React 19). APIs differ from stock Next — always read
> `node_modules/next/dist/docs/` before writing portal code (see `web/AGENTS.md`).

---

## 1. What the portal is, and the split with the API

The portal is the **control plane**; the Go service is the **data plane**.

```
Developer ──▶ web/ (Next.js, Vercel)          API client ──▶ rasta-api (Go, Render)
              · sign up / log in                             · validates X-API-Key
              · dashboard: create/revoke keys               · resolves key → PLAN
              · (M4) billing                                 · rate-limits, serves data
                    │ service_role (writes api_keys)              ▲ read-only (reads api_keys)
                    └──────────────▶ Supabase Postgres ◀──────────┘
```

**The load-bearing rule: the Go API never writes keys — the Next app does.** Issuance is a
*mutation* on accounts; serving is *read-only*. Keeping the two apart means the data plane holds
no write credentials for the key table and can't be made to mint keys, and the control plane
owns the one privileged credential (`service_role`) in the one place that already handles
accounts. See DECISIONS ADR "Key issuance lives in the Next app".

---

## 2. Identity: Supabase Auth + a signed-cookie session

Two layers, deliberately separated:

- **Account store = Supabase Auth** (`auth.users`). Signup uses the **service-role admin** client
  (`lib/supabase.ts` → `admin.auth.admin.createUser`, `email_confirm: true` so no mail infra is
  needed). Login uses the **anon** client (`lib/devauth.ts` → `supabaseAuthClient().auth
  .signInWithPassword`) — password verification must run with the public key, never the admin one.
- **Session = our own signed cookie**, not Supabase's session. `lib/devauth.ts` mints a
  `dev_session` cookie carrying `{ sub, email, exp }`, signed with `ADMIN_SESSION_SECRET` via
  `signPayload`/`verifyPayload` (HMAC-SHA256, Web Crypto — see `lib/auth.ts`).

**Why our own cookie and not Supabase's session tokens?**
- It's **Edge-safe and dependency-free** to verify: pure Web Crypto, so middleware and server
  actions can check it without a network call to Supabase on every request.
- It reuses the exact primitive the admin gate already uses (`signPayload`), so there's one
  signing story in the codebase, not two.
- We only need *identity* (`sub` + `email`), not Supabase's full session/refresh machinery. The
  cookie is `httpOnly`, `sameSite=lax`, `secure` in prod, 7-day expiry.

`readDevSession()` is the single choke point: it verifies the signature **and** the expiry, fails
closed to `null`, and every protected surface calls it. The dashboard page redirects to
`/developers/login` when it returns `null`.

---

## 3. API keys — the format contract (why a key minted in TS works in Go)

A key is issued by **TypeScript** (`lib/apikey.ts`) but validated by **Go** (`rasta-api/internal
/auth`). There's no shared library — they agree by implementing the **same format exactly**:

```
raw    = "khoj_" + 24 random bytes as lowercase hex   (53 chars)   ← shown to the user ONCE
hash   = sha256(raw) as lowercase hex                              ← the only thing stored
prefix = raw[:14]  = "khoj_" + 9 hex chars                         ← shown in the dashboard list
```

`crypto.getRandomValues` + `crypto.subtle.digest("SHA-256", …)` in TS produce byte-for-byte what
Go's `crypto/rand` + `crypto/sha256` + `hex.EncodeToString` produce. **We only ever store the
hash**, so a database leak can't be replayed against the API, and the raw key is unrecoverable
after creation — hence the one-time reveal in the UI.

> Verified end-to-end: a key minted by `lib/apikey.ts`, inserted into `api_keys`, authenticates
> on the live API as its plan (`x-plan: pro`, `ratelimit-limit: 600`); revoking it → `401`.

**Why store only the hash (not encrypt the key)?** We never need to show the key again, so there's
no reason to be able to decrypt it. A one-way hash is strictly safer than reversible encryption —
there's no key-encryption-key to leak. This is the same reason passwords are hashed, not encrypted.

---

## 4. Key lifecycle — create, list, revoke

All three live in `app/developers/actions.ts` as **Server Actions** (`"use server"`), driven by the
`KeyManager` client component (`app/developers/dashboard/_components/KeyManager.tsx`).

- **Create** (`createKey`) — mints a key, inserts `{ user_id, owner_email, name, key_hash,
  key_prefix, plan:'free', scopes:[] }` via `supabaseAdmin()`, and **returns the raw key once** to
  the client. `useActionState` carries that return value into `KeyReveal`, which shows it with a
  copy button and a ready-to-run `curl`. After that render the raw key exists nowhere.
  - Self-serve keys are **`free` plan**. Paid plans attach to the *account* (not the key) in M4 via
    Razorpay; keys then inherit the account's plan.
  - A **per-developer cap** (`MAX_ACTIVE_KEYS = 10`, counted scoped to `user_id`) stops unbounded
    key minting — an abuse/blast-radius control.
- **List** — the dashboard **server component** reads the developer's keys scoped to `user_id`,
  selecting only safe columns (**never `key_hash`**). It's `force-dynamic`, so the list is always
  fresh on load.
- **Revoke** (`revokeKey`) — a **soft delete**: sets `revoked_at = now()`. The key stops
  authenticating *immediately* because the Go lookup index is **partial on `revoked_at is null`**.
  We keep the row for audit/usage history rather than hard-deleting.

Both mutations call `revalidatePath('/developers/dashboard')` so the re-rendered list ships in the
**same HTTP response** as the action (the Next single-roundtrip model).

### Security: a Server Action is a public POST endpoint

This is the subtle, important part. Rendering a form only on an authenticated page is **not** a
security boundary — the action's POST route is reachable by anyone. So every action:

1. **Derives identity from the session** (`readDevSession()`), never from form data.
2. **Scopes every query to `user_id`.** `revokeKey` matches `id = ? AND user_id = session.sub` — a
   developer can't revoke someone else's key by POSTing an arbitrary `id`. (The client supplies
   *which* key; ownership is re-checked server-side — "take only the change, derive identity from
   the session.")
3. **Never returns secrets** beyond the one-time raw key on the create path.

---

## 5. File map

```
web/
  lib/
    auth.ts         # Web Crypto HMAC: signPayload/verifyPayload, toB64Url (Edge-safe)
    devauth.ts      # dev_session cookie: createDevSessionToken, readDevSession, supabaseAuthClient (anon)
    supabase.ts     # supabaseAdmin() — service_role client (server-only)
    apikey.ts       # mintApiKey() — the khoj_ key format (MUST match Go)
  app/developers/
    actions.ts                      # signup/login/logout + createKey/revokeKey (Server Actions)
    login/ signup/ page.tsx         # auth forms
    dashboard/page.tsx              # protected; reads the user's keys → KeyManager
    dashboard/_components/KeyManager.tsx   # client: create form, one-time reveal, revoke list
```

---

## 6. Environment

| Var | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `supabaseAdmin()` | account + key writes (bypasses RLS) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `supabaseAuthClient()` | password login (public key) |
| `ADMIN_SESSION_SECRET` | `devauth.ts` | HMAC signing of the `dev_session` cookie |
| `NEXT_PUBLIC_API_BASE` | `KeyManager` | base URL in the sample `curl` (default `https://khoj-ibli.onrender.com`) |

---

## 7. Gotchas

- **Modified Next.js** — read `node_modules/next/dist/docs/` first; conventions differ from stock.
- **Server Actions are untrusted entry points** — auth + ownership-scope inside every one (§4).
- **`revalidatePath` before `redirect`** — `redirect` throws, so code after it doesn't run.
- **Never select `key_hash` into the client** — the dashboard query lists safe columns only.
- **The key format is a contract with Go** — changing `lib/apikey.ts` means changing
  `rasta-api/internal/auth` in lockstep, or keys won't validate.
