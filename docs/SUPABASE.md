# Supabase — the cloud rung of shared memory

Project: **supabase-ARCANE-AIOS** · `https://pjdzdfmnfuneumzqoijn.supabase.co` · us-east-1.
Connected to the Vercel project `arcaneaios` through the Supabase
integration (storage name `storage`).

The facility's store persists to memory → localStorage → Supabase. The
cloud rung is used only once the operator has **signed in** with a magic
link; until then the site works from localStorage and the Bridge says so.

## Set-up — three steps, once

### 1. The table (SQL Editor)

Open the project → SQL Editor → paste `supabase/migrations/0001_arcane_state.sql` → Run.
It creates `arcane_state` (one row per signed-in user per document) with
row-level security: a user reads and writes only their own rows; there is
no anonymous access at all. Safe to re-run.

### 2. Auth — magic link (Authentication → URL Configuration)

- **Site URL:** `https://arcaneaios.vercel.app`
- **Redirect URLs:** add `https://arcaneaios.vercel.app/**` and, for local dev, `http://localhost:5173/**`

Email sign-in is on by default on the free plan (a few emails an hour is
plenty for one operator). The magic link returns to the site with the
session in the URL fragment; the facility takes it, stores it in
localStorage, and refreshes it before it expires.

### 3. Environment (already done by the integration)

The Vercel integration added, with its `storage_` prefix:

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_storage_SUPABASE_URL` | the project URL (also hard-coded as a fallback) |
| `NEXT_PUBLIC_storage_SUPABASE_PUBLISHABLE_KEY` or `storage_SUPABASE_ANON_KEY` | the browser key — the only key the build reads |
| `storage_POSTGRES_*`, `storage_SUPABASE_SERVICE_ROLE_KEY` | **never read by the facility**; for server-side tools only |

`apps/facility/vite.config.js` reads those exact names (and the plain
`SUPABASE_URL` / `SUPABASE_ANON_KEY` spellings for local `.env`). Only the
URL and the publishable/anon key are injected, by name — a prefix rule
could sweep a service-role key into the bundle, so there is none.

Redeploy once after step 3 if the variables were added after the last build.

## Using it

Top bar → enter your email → **SIGN IN** → open the link from the email
on the same device. The bar then shows `● your@email` and the Bridge
reports `memory: Supabase · your@email`. Everything the store holds —
orders, stock, ledger, split, goals, draft status, lists, protocol, the
Trading Journal — is written to your row on every change and read back
on load; every 30 s the facility checks whether another device wrote
something newer and, if so, takes it (newest state wins whole).

Sign out from the bar. Signing in on a second device pulls the same row.

## Shape

```
arcane_state (owner uuid = auth.uid(), id text = 'state', body jsonb, updated timestamptz)
```

`body` is the store's state (`v: 3`). The journal rides inside it for now;
when there are enough trades to want SQL over them, `arcane_trades` gets
its own table and the journal writes both.

## Local development

Copy the two public values into `.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
to have the cloud rung in `npm run facility`; without them the build says
"no sync" in the bar and everything else works.
