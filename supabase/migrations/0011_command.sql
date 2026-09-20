-- THE ARCANE — the objects that make the rooms one system.
--
-- Run in the Supabase SQL Editor after 0010 (idempotent; safe to re-run).
--
-- Until now the floor had work (orders), money (the ledger), stock, content
-- and decisions, and each room showed its own. What it did not have was
-- the spine that connects them: a goal an order serves, a project it
-- belongs to, a review that asks what came of it, a rule for where the
-- money goes. This migration adds those objects and the columns that tie
-- the existing ones to them.
--
--   goals               10-year → 3-year → 1-year → quarter → month → week → day, as a tree
--   projects            an objective with an owner, a venture, a goal, a deadline and a budget; health is computed
--   reviews             day / week / month / quarter, the answers kept as they were typed
--   bottlenecks         what binds, with its evidence, severity and owner
--   capital_rules       "when available profit is at least X, split it this way"
--   capital_allocations one row per month: what was proposed, what was confirmed — a planning record, never a bank action
--   orders              gain project_id, goal_id, estimate_h, actual_h, depends_on, recurrence
--   decisions           gain options, evidence, assumptions, risks, impact, owner, review_on, retro, context
--   list_items          gain value_gbp, due, note (a deal's value and next step; an idea's date)
--
-- Nothing existing is rewritten. Every new column has a default that means
-- "not said", so a row written before this migration reads the same after.
--
-- Access: RLS on, no anon policies. Only the service role, through /api.

create table if not exists public.goals (
  id          text        primary key,                 -- GL-YYYYMMDD-NNN, or a slug for the seeded ones
  title       text        not null,
  description text        not null default '',
  horizon     text        not null default 'year' check (horizon in ('decade', 'three', 'year', 'quarter', 'month', 'week', 'day')),
  parent_id   text        references public.goals (id),
  category    text        not null default '',          -- money | work | life | venture …
  venture     text        not null default '',
  owner       text        not null default 'Leo',
  metric      text        not null default '',          -- a computed source (core/goals.js METRICS) or empty for a typed value
  unit        text        not null default '',
  currency    text        not null default 'GBP',
  target      numeric,
  current     numeric,                                  -- the typed value; ignored when metric is set
  status      text        not null default 'active' check (status in ('active', 'done', 'dropped', 'paused')),
  starts      date,
  ends        date,
  note        text        not null default '',
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index if not exists goals_parent  on public.goals (parent_id);
create index if not exists goals_horizon on public.goals (horizon, status, position);

create table if not exists public.projects (
  id          text        primary key,                 -- PRJ-YYYYMMDD-NNN
  name        text        not null,
  objective   text        not null default '',
  venture     text        not null default '',
  goal_id     text        references public.goals (id),
  owner       text        not null default 'Leo',
  agent       text        not null default '',
  status      text        not null default 'ready' check (status in ('idea', 'ready', 'active', 'blocked', 'done', 'dropped')),
  budget_gbp  numeric,
  spent_gbp   numeric,
  starts      date,
  due         date,
  note        text        not null default '',
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index if not exists projects_status on public.projects (status, position);
create index if not exists projects_goal   on public.projects (goal_id);

create table if not exists public.reviews (
  id          text        primary key,                 -- REV-YYYYMMDD-NNN
  kind        text        not null check (kind in ('day', 'week', 'month', 'quarter')),
  period      text        not null,                    -- 2026-09-20 | 2026-W38 | 2026-09 | 2026-Q3
  answers     jsonb       not null default '{}'::jsonb,
  facts       jsonb       not null default '{}'::jsonb, -- what the state said when the review was written
  summary     text        not null default '',
  status      text        not null default 'draft' check (status in ('draft', 'kept')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  kept_at     timestamptz
);
create unique index if not exists reviews_period on public.reviews (kind, period);

create table if not exists public.bottlenecks (
  id          text        primary key,                 -- BTL-YYYYMMDD-NNN
  text        text        not null,
  area        text        not null default 'attention',
  severity    text        not null default 'warn' check (severity in ('info', 'warn', 'breach')),
  venture     text        not null default '',
  evidence    text        not null default '',
  owner       text        not null default 'Leo',
  proposed    text        not null default '',          -- the proposed solutions, one per line
  status      text        not null default 'open' check (status in ('open', 'easing', 'cleared')),
  source      text        not null default 'floor',
  source_id   text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  cleared_at  timestamptz
);
create index if not exists bottlenecks_status on public.bottlenecks (status, severity);

create table if not exists public.capital_rules (
  id            text        primary key,               -- slug
  name          text        not null,
  min_available numeric     not null default 0,        -- the rule applies when available profit is at least this
  pcts          jsonb       not null default '{}'::jsonb, -- { pot_id: pct } — must total 100
  active        boolean     not null default true,
  position      integer     not null default 0,
  note          text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.capital_allocations (
  id            text        primary key,               -- YYYY-MM
  month         text        not null,
  available     numeric,                               -- the available profit the split was made over
  rule_id       text        not null default '',
  proposed      jsonb       not null default '{}'::jsonb, -- { pot_id: gbp } as the rules computed it
  confirmed     jsonb       not null default '{}'::jsonb, -- { pot_id: gbp } as Leo confirmed it
  note          text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  confirmed_at  timestamptz
);

-- The task engine: an order can say which project and goal it serves, how
-- long it should take, what it waits on, and whether it comes back.
alter table public.orders add column if not exists project_id text not null default '';
alter table public.orders add column if not exists goal_id    text not null default '';
alter table public.orders add column if not exists estimate_h numeric;
alter table public.orders add column if not exists actual_h   numeric;
alter table public.orders add column if not exists depends_on text not null default '';   -- an order id
alter table public.orders add column if not exists recurrence text not null default '';   -- '' | day | week | month
create index if not exists orders_project on public.orders (project_id);
create index if not exists orders_goal    on public.orders (goal_id);

-- The decision room: what was weighed, not just what was decided.
alter table public.decisions add column if not exists context     text    not null default '';
alter table public.decisions add column if not exists options     jsonb   not null default '[]'::jsonb;
alter table public.decisions add column if not exists evidence    text    not null default '';
alter table public.decisions add column if not exists assumptions text    not null default '';
alter table public.decisions add column if not exists risks       text    not null default '';
alter table public.decisions add column if not exists impact_gbp  numeric;
alter table public.decisions add column if not exists impact      text    not null default '';
alter table public.decisions add column if not exists owner       text    not null default 'Leo';
alter table public.decisions add column if not exists review_on   date;
alter table public.decisions add column if not exists retro       text    not null default '';
alter table public.decisions add column if not exists venture     text    not null default '';
alter table public.decisions add column if not exists goal_id     text    not null default '';

-- One shape, many rooms: a deal has a value and a next step; an idea has a date.
alter table public.list_items add column if not exists value_gbp numeric;
alter table public.list_items add column if not exists due       date;
alter table public.list_items add column if not exists note      text not null default '';

-- Defined in 0003; repeated so this file stands alone if it is ever run first.
create or replace function public.arcane_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists goals_touch               on public.goals;
drop trigger if exists projects_touch            on public.projects;
drop trigger if exists reviews_touch             on public.reviews;
drop trigger if exists bottlenecks_touch         on public.bottlenecks;
drop trigger if exists capital_rules_touch       on public.capital_rules;
drop trigger if exists capital_allocations_touch on public.capital_allocations;
create trigger goals_touch               before update on public.goals               for each row execute function public.arcane_touch_updated_at();
create trigger projects_touch            before update on public.projects            for each row execute function public.arcane_touch_updated_at();
create trigger reviews_touch             before update on public.reviews             for each row execute function public.arcane_touch_updated_at();
create trigger bottlenecks_touch         before update on public.bottlenecks         for each row execute function public.arcane_touch_updated_at();
create trigger capital_rules_touch       before update on public.capital_rules       for each row execute function public.arcane_touch_updated_at();
create trigger capital_allocations_touch before update on public.capital_allocations for each row execute function public.arcane_touch_updated_at();

alter table public.goals               enable row level security;
alter table public.projects            enable row level security;
alter table public.reviews             enable row level security;
alter table public.bottlenecks         enable row level security;
alter table public.capital_rules       enable row level security;
alter table public.capital_allocations enable row level security;
-- no policies: service role only

comment on table  public.goals               is 'the hierarchy: decade → three → year → quarter → month → week → day; a metric binds a goal to a computed actual';
comment on column public.goals.metric        is 'a key from core/goals.js METRICS; when set, current is computed from the tables and the typed value is ignored';
comment on table  public.projects            is 'an objective with a venture, a goal, an owner and a deadline; its tasks are the orders that name it; health is computed';
comment on table  public.reviews             is 'daily, weekly, monthly, quarterly reviews: the questions answered and the facts as they stood';
comment on table  public.bottlenecks         is 'what binds: evidence, severity, owner, proposed solutions; cleared, never deleted';
comment on table  public.capital_rules       is 'where available profit goes, by threshold; the first rule whose threshold is met applies';
comment on table  public.capital_allocations is 'one row a month: the split as proposed and as confirmed; a planning record, never a bank action';
comment on column public.orders.recurrence   is 'when set, marking the order done writes the next occurrence with the next due date';
comment on column public.orders.depends_on   is 'the id of the order this one waits for; the task engine shows it as a dependency';

notify pgrst, 'reload schema';
