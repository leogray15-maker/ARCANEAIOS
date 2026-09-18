-- THE ARCANE — the floor's operating state, as tables.
--
-- Run in the Supabase SQL Editor after 0003 (idempotent; safe to re-run).
--
-- Until now the floor's state rode in one JSON row per device
-- (arcane_sync) and only the Mac-side fold could reconcile two devices.
-- These tables are the parts the command rooms run on: orders (the unit
-- of routed work), list items (moves, stop-doing, watchlist, pipeline,
-- ideas — one shape, five rooms), Council decisions, Counsel turns, the
-- venture ranking, goal progress, and the day. Money, stock, the protocol
-- and the journal follow when their rooms are built.
--
-- Access: RLS on, no anon policies. Only the service role, through /api.

create table if not exists public.orders (
  id          text        primary key,                 -- ORD-YYYYMMDD-NNN
  room        text        not null,
  text        text        not null,
  priority    integer     not null default 2 check (priority between 0 and 3),
  state       text        not null default 'open' check (state in ('open', 'active', 'blocked', 'review', 'done', 'killed')),
  holder      text        not null default 'Leo',
  actor       text        not null default 'human' check (actor in ('human', 'agent')),
  venture     text        not null default '',
  blocked_on  text        not null default '',
  due         date,
  note        text        not null default '',
  source      text        not null default 'floor',   -- floor | brain | counsel | council
  brain_n     integer,                                 -- the row number in 06-Orders/Orders.md, when it came from there
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index if not exists orders_room_state on public.orders (room, state);
create index if not exists orders_state on public.orders (state, priority, created_at);

create table if not exists public.list_items (
  id          text        primary key,
  list        text        not null,                    -- moves | stop | watch | pipeline | ideas
  text        text        not null,
  tag         text        not null default '',
  venture     text        not null default '',
  position    integer     not null default 0,
  done        boolean     not null default false,
  outcome     text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index if not exists list_items_list on public.list_items (list, done, position);

create table if not exists public.decisions (
  id          text        primary key,                 -- DEC-YYYYMMDD-NNN
  question    text        not null,
  verdict     text        not null default 'WATCH' check (verdict in ('BUILD', 'DELAY', 'WATCH', 'KILL')),
  summary     text        not null default '',
  conditions  jsonb       not null default '[]'::jsonb,
  dissent     text        not null default '',
  positions   jsonb       not null default '[]'::jsonb,
  outcome     text        not null default '',
  source      text        not null default 'council',  -- council | leo
  device      text        not null default '',
  usage       jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists decisions_created on public.decisions (created_at desc);

create table if not exists public.counsel_turns (
  id          text        primary key,
  who         text        not null check (who in ('leo', 'arcane')),
  text        text        not null,
  specialist  text        not null default '',
  proposal    jsonb,                                   -- { room, text, priority, actor } when ARCANE proposed an order
  device      text        not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists counsel_turns_created on public.counsel_turns (created_at desc);

create table if not exists public.venture_focus (
  venture     text        primary key,
  rank        integer     not null default 0,
  allocation  text        not null default 'maintain' check (allocation in ('push', 'maintain', 'starve')),
  why         text        not null default '',
  updated_at  timestamptz not null default now()
);

create table if not exists public.goal_progress (
  goal_id     text        primary key,
  value       numeric     not null default 0,
  note        text        not null default '',
  updated_at  timestamptz not null default now()
);

create table if not exists public.days (
  day         date        primary key,
  focus       text        not null default '',
  note        text        not null default '',
  energy      integer,
  sleep       numeric,
  updated_at  timestamptz not null default now()
);

-- Defined in 0003; repeated so this file stands alone if it is ever run first.
create or replace function public.arcane_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists orders_touch        on public.orders;
drop trigger if exists list_items_touch    on public.list_items;
drop trigger if exists decisions_touch     on public.decisions;
drop trigger if exists venture_focus_touch on public.venture_focus;
drop trigger if exists goal_progress_touch on public.goal_progress;
drop trigger if exists days_touch          on public.days;
create trigger orders_touch        before update on public.orders        for each row execute function public.arcane_touch_updated_at();
create trigger list_items_touch    before update on public.list_items    for each row execute function public.arcane_touch_updated_at();
create trigger decisions_touch     before update on public.decisions     for each row execute function public.arcane_touch_updated_at();
create trigger venture_focus_touch before update on public.venture_focus for each row execute function public.arcane_touch_updated_at();
create trigger goal_progress_touch before update on public.goal_progress for each row execute function public.arcane_touch_updated_at();
create trigger days_touch          before update on public.days          for each row execute function public.arcane_touch_updated_at();

alter table public.orders        enable row level security;
alter table public.list_items    enable row level security;
alter table public.decisions     enable row level security;
alter table public.counsel_turns enable row level security;
alter table public.venture_focus enable row level security;
alter table public.goal_progress enable row level security;
alter table public.days          enable row level security;
-- no policies: service role only

notify pgrst, 'reload schema';
