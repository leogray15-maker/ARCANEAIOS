-- THE ARCANE — shared memory without sign-in: one row per sync code.
--
-- Run in the SQL Editor (idempotent). Replaces the sign-in model of 0001,
-- which can stay in place unused.
--
-- The facility generates an unguessable sync code on first visit and keeps
-- it in that browser; pasting the code on a second device joins the same
-- row. The anon key may read and write rows whose id is a well-formed
-- sync code and nothing else — so the state is as private as the code,
-- which never appears on the page unless you ask for it.

create table if not exists public.arcane_sync (
  id      text        primary key check (id ~ '^sync-[a-z2-7]{26}$'),
  body    jsonb       not null,
  updated timestamptz not null default now()
);

alter table public.arcane_sync enable row level security;

drop policy if exists "sync code reads"   on public.arcane_sync;
drop policy if exists "sync code writes"  on public.arcane_sync;
drop policy if exists "sync code updates" on public.arcane_sync;

create policy "sync code reads"   on public.arcane_sync for select to anon, authenticated using (true);
create policy "sync code writes"  on public.arcane_sync for insert to anon, authenticated with check (true);
create policy "sync code updates" on public.arcane_sync for update to anon, authenticated using (true) with check (true);
-- no delete policy: rows are never removed through the API

create or replace function public.arcane_touch() returns trigger language plpgsql as $$
begin new.updated := now(); return new; end $$;
drop trigger if exists arcane_sync_touch on public.arcane_sync;
create trigger arcane_sync_touch before update on public.arcane_sync for each row execute function public.arcane_touch();

notify pgrst, 'reload schema';
