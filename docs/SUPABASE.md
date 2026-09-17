# Supabase — the cloud rung of shared memory

The facility's store persists to memory → localStorage → Supabase. The
cloud rung switches on when the build sees a URL and an anon key; nothing
else is ever injected into the bundle (see `apps/facility/vite.config.js`).

## Environment

The Vercel Supabase integration adds these to the project; any of the
spellings work, the first found wins:

| Purpose | Read at build |
| --- | --- |
| URL | `SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_URL` · `VITE_SUPABASE_URL` |
| anon key | `SUPABASE_ANON_KEY` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `VITE_SUPABASE_ANON_KEY` |

`SUPABASE_SERVICE_ROLE_KEY` is never read by the facility. It is for the
server-side sync tool (`tools/memory-sync.mjs`, plan day 3) only.

## Table

```sql
create table if not exists arcane_state (
  id      text primary key,
  body    jsonb not null,
  updated timestamptz not null default now()
);
alter table arcane_state enable row level security;
```

With RLS on and no policy, the anon key can neither read nor write, the
facility reports "local (Supabase: 401 …)" on the Bridge and keeps working
from localStorage. That is the intended state until Supabase Auth is wired.

## Opening it (only behind auth)

Once the operator signs in (email magic link is enough — one user), add:

```sql
create policy "operator reads"  on arcane_state for select using (auth.role() = 'authenticated');
create policy "operator writes" on arcane_state for insert with check (auth.role() = 'authenticated');
create policy "operator updates" on arcane_state for update using (auth.role() = 'authenticated');
```

and pass the session token instead of the anon key in `core/cloud.js`.
Do not add an anon policy: the site is public and the state is not.

## Shape

One row, `id = 'leo'`, `body` = the store's state (`v: 3`, orders, ledger,
goals, budget, stock, funnel, draft status, crew positions, floor log).
Newest `updated` wins on load; saves upsert with `merge-duplicates`.
