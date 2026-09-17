-- THE ARCANE — shared memory, one row per operator per document.
--
-- Run this once in the Supabase SQL Editor (project supabase-ARCANE-AIOS).
-- It is idempotent: safe to run again.
--
-- Access model: only a signed-in user can read or write, and only their
-- own rows. There is deliberately no anon policy — the site is public and
-- the state is not. The facility signs the operator in with a magic link
-- and sends that session's token; until then it stays on localStorage.

create table if not exists public.arcane_state (
  owner   uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id      text        not null default 'state',
  body    jsonb       not null,
  updated timestamptz not null default now(),
  primary key (owner, id)
);

alter table public.arcane_state enable row level security;

drop policy if exists "operator reads own state"   on public.arcane_state;
drop policy if exists "operator writes own state"  on public.arcane_state;
drop policy if exists "operator updates own state" on public.arcane_state;

create policy "operator reads own state"   on public.arcane_state for select using (auth.uid() = owner);
create policy "operator writes own state"  on public.arcane_state for insert with check (auth.uid() = owner);
create policy "operator updates own state" on public.arcane_state for update using (auth.uid() = owner) with check (auth.uid() = owner);

-- Keep `updated` honest even if a client forgets it.
create or replace function public.arcane_touch() returns trigger language plpgsql as $$
begin new.updated := now(); return new; end $$;
drop trigger if exists arcane_state_touch on public.arcane_state;
create trigger arcane_state_touch before update on public.arcane_state for each row execute function public.arcane_touch();

-- PostgREST reads the schema on change; nudge it.
notify pgrst, 'reload schema';
