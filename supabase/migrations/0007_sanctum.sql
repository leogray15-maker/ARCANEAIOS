-- THE ARCANE — SANCTUM: the operator.
--
-- Run in the Supabase SQL Editor after 0006 (idempotent; safe to re-run).
--
-- The protocol as items and daily ticks, and the operator's own entries:
-- journal, reflections, principles, objectives, life decisions. Private
-- by default: the API is operator-only, and entries are never mirrored
-- into the brain repository — only the day and the protocol are. Nothing
-- here is a health claim; a number typed by Leo about Leo is a record.

create table if not exists public.protocol_items (
  id          text        primary key,                  -- slug
  name        text        not null,
  target      numeric     not null default 0,
  unit        text        not null default '',
  cadence     text        not null default 'day' check (cadence in ('day', 'week')),
  active      boolean     not null default true,
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.protocol_ticks (
  id          text        primary key,                  -- '2026-09-19:train'
  day         date        not null,
  item_id     text        not null references public.protocol_items (id),
  done        boolean     not null default true,
  value       numeric,                                  -- the number, when the item has one (hours, pages)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists protocol_ticks_day on public.protocol_ticks (day desc);

create table if not exists public.entries (
  id          text        primary key,                  -- ENT-YYYYMMDD-NNN
  kind        text        not null check (kind in ('journal', 'reflection', 'principle', 'objective', 'decision')),
  title       text        not null default '',
  body        text        not null default '',
  status      text        not null default 'open' check (status in ('open', 'kept', 'done', 'dropped')),
  private     boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists entries_kind on public.entries (kind, created_at desc);

create or replace function public.arcane_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists protocol_items_touch on public.protocol_items;
drop trigger if exists protocol_ticks_touch on public.protocol_ticks;
drop trigger if exists entries_touch        on public.entries;
create trigger protocol_items_touch before update on public.protocol_items for each row execute function public.arcane_touch_updated_at();
create trigger protocol_ticks_touch before update on public.protocol_ticks for each row execute function public.arcane_touch_updated_at();
create trigger entries_touch        before update on public.entries        for each row execute function public.arcane_touch_updated_at();

alter table public.protocol_items enable row level security;
alter table public.protocol_ticks enable row level security;
alter table public.entries        enable row level security;
-- no policies: service role only

insert into public.protocol_items (id, name, target, unit, cadence, position) values
  ('train', 'Train', 4, 'per week', 'week', 0), ('sleep', 'Sleep floor', 7.5, 'hours', 'day', 1), ('deep-work', 'Deep work block', 3, 'hours', 'day', 2),
  ('steps', 'Steps', 8000, 'per day', 'day', 3), ('read', 'Read', 20, 'pages', 'day', 4)
  on conflict (id) do nothing;

notify pgrst, 'reload schema';
