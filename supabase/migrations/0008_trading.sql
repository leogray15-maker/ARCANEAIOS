-- THE ARCANE — THE TRADING FLOOR: the Journal on tables.
--
-- Run in the Supabase SQL Editor after 0007 (idempotent; safe to re-run).
--
-- Every trade with its Before / During / After, the playbook of setups,
-- and the psychology check-ins. The arithmetic (R, outcome, statistics)
-- stays in apps/facility/src/core/journal.js; these tables hold what Leo
-- typed. This is the operator's own record and nothing else.

create table if not exists public.trades (
  id              text        primary key,              -- T-YYYYMMDD-NN
  instrument      text        not null default 'XAUUSD',
  direction       text        not null default 'Long' check (direction in ('Long', 'Short')),
  session         text        not null default '',
  killzone        text        not null default '',
  setup           text        not null default 'unplanned',
  bias            text        not null default '',
  grade           text        not null default '',
  conviction      integer,
  entry           numeric,
  stop            numeric,
  target          numeric,
  exit            numeric,
  risk            numeric,
  size            numeric,
  opened          timestamptz,
  closed          timestamptz,
  plan_followed   boolean     not null default false,
  rule_breaks     text[]      not null default '{}',
  emotion_before  text        not null default '',
  emotion_during  text        not null default '',
  emotion_after   text        not null default '',
  energy          integer,
  sleep           numeric,
  stress          integer,
  streamed        boolean     not null default false,
  process         text        not null default '',
  thesis          text        not null default '',
  execution       text        not null default '',
  review          text        not null default '',
  lesson          text        not null default '',
  chart           text        not null default '',
  example         boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists trades_opened on public.trades (opened desc);

create table if not exists public.setups (
  id            text        primary key,                -- slug
  name          text        not null,
  status        text        not null default 'Active',
  session       text        not null default '',
  tf            text        not null default '',
  conditions    text        not null default '',
  trigger       text        not null default '',
  stop          text        not null default '',
  target        text        not null default '',
  aplus         text        not null default '',
  invalidation  text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.checkins (
  id          text        primary key,
  type        text        not null default 'Pre-market',
  mood        text        not null default '',
  stress      integer,
  energy      integer,
  sleep       numeric,
  streamed    boolean     not null default false,
  acted       boolean     not null default false,
  trigger     text        not null default '',
  note        text        not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists checkins_created on public.checkins (created_at desc);

create or replace function public.arcane_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trades_touch on public.trades;
drop trigger if exists setups_touch on public.setups;
create trigger trades_touch before update on public.trades for each row execute function public.arcane_touch_updated_at();
create trigger setups_touch before update on public.setups for each row execute function public.arcane_touch_updated_at();

alter table public.trades   enable row level security;
alter table public.setups   enable row level security;
alter table public.checkins enable row level security;
-- no policies: service role only

notify pgrst, 'reload schema';
