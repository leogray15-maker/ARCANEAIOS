# Supabase — the cloud rung of shared memory

Project: **supabase-ARCANE-AIOS** · `https://pjdzdfmnfuneumzqoijn.supabase.co` · us-east-1.
Connected to the Vercel project `arcaneaios` through the Supabase
integration (storage name `storage`).

The facility's store persists to memory → localStorage → Supabase. There
is **no sign-in**: one operator, one site. Each browser generates an
unguessable **sync code** on first visit (130 bits, kept in localStorage)
and uses it as its row id. To carry state to a second device, open ● SYNC
in the bar, copy the code, and paste it on the other device — both then
write the same row. The code is never shown unless asked for. The state is
as private as the code; the anon key can only touch well-formed sync rows.

## Set-up — two steps, once

### 1. The table (SQL Editor)

Open the project → SQL Editor → paste `supabase/migrations/0002_sync_codes.sql` → Run.
It creates `arcane_sync` (one row per sync code) with row-level security
that lets the anon key read, insert and update rows whose id is a sync
code, and never delete. Safe to re-run. (`0001_arcane_state.sql` was the
earlier sign-in model; it is not needed.)

### 2. Environment (already done by the integration)

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

Redeploy once after step 2 if the variables were added after the last build.

## Using it

Nothing to do. The bar shows `● SYNC` when the build has the key; the
Bridge reports `memory: synced`. Everything the store holds — orders,
stock, ledger, split, goals, draft status, lists, protocol, the Trading
Journal — is written to this device's row on every change and read back
on load; every 30 s the facility checks whether another device wrote
something newer and, if so, takes it (newest state wins whole).

Second device: ● SYNC → copy the code here → ● SYNC → paste → join.

`npm run vault:sync` (with `SUPABASE_SERVICE_ROLE_KEY` in `.env`) reads
every row and brings the draft-status decisions into the vault's files.

## Shape

```
arcane_sync (id text = 'sync-<26 chars>', body jsonb, updated timestamptz)
```

`body` is the store's state (`v: 3`). The journal rides inside it for now;
when there are enough trades to want SQL over them, `arcane_trades` gets
its own table and the journal writes both.

## Local development

Copy the two public values into `.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
to have the cloud rung in `npm run facility`; without them the build says
"no sync" in the bar and everything else works.
