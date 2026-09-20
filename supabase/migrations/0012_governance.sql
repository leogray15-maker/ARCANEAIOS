-- THE ARCANE — runtime governance: permission memory, budgets, heartbeats,
-- a hash-chained audit trail. The OpenJarvis port (docs/OPENJARVIS_PORT.md).
--
-- Run in the Supabase SQL Editor after 0011 (idempotent; safe to re-run).
--
-- Nothing here replaces what exists: the order state machine, the grades,
-- the proposed-order approval step and system_events as the audit bus are
-- untouched. This adds what they did not carry — a memory of a permission
-- already granted, a ceiling on what an agent may spend, a sign of life
-- while a run is in flight, and a chain that makes the record's own
-- history checkable rather than merely append-only by convention.
--
-- Access: RLS on, no anon policies. Only the service role, through /api.

create table if not exists public.permission_memory (
  permission_key text        primary key,                 -- room:agent:tool:resource
  decision       text        not null check (decision in ('always_allow', 'always_deny')),
  tier           text        not null check (tier in ('trivial', 'low', 'medium', 'high')),
  times_approved integer     not null default 0,
  times_denied   integer     not null default 0,
  notes          text        not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- A high-tier permission is asked every time, by design: it is never remembered.
  constraint permission_memory_no_high_tier check (tier <> 'high')
);

create table if not exists public.agent_budgets (
  agent          text        primary key,                 -- an id from packages/config/src/agents.js
  tokens_daily   integer,
  tokens_monthly integer,
  runs_daily     integer,
  max_turns      integer,
  active         boolean     not null default true,
  note           text        not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.room_budgets (
  room           text        primary key,                 -- an id from packages/config/src/rooms.js
  budget_gbp     numeric,
  period         text        not null default 'month' check (period in ('month', 'quarter', 'year')),
  goal_metric    text        not null default '',          -- a key from core/goals.js METRICS, or empty
  goal_target    numeric,
  note           text        not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- A sign of life while a run is in flight, and where a resumable step would
-- pick up. `checkpoint` is reserved for the Orchestrator's tool loop, which
-- does not exist yet (docs/OPENJARVIS_PORT.md) — the column costs nothing
-- empty and saves a migration once it does.
alter table public.agent_runs add column if not exists heartbeat_at     timestamptz;
alter table public.agent_runs add column if not exists current_activity text not null default '';
alter table public.agent_runs add column if not exists checkpoint      jsonb;

-- The hash chain. `row_hash = sha256(prev_hash || at || kind || subject_id || summary)`,
-- computed in application code (packages/database/src/audit.js) at the
-- moment a row is written — Postgres never sees the previous row's hash
-- read back, so there is no read-then-write race on the chain itself; the
-- rows are appended one at a time, in order, by the same process that just
-- wrote the row before it. Existing rows predate the chain and are left
-- with a null hash: `verifyAuditChain()` treats the first null as the
-- chain's genesis boundary, not a break.
alter table public.system_events add column if not exists prev_hash text;
alter table public.system_events add column if not exists row_hash  text;
create index if not exists system_events_row_hash on public.system_events (id) where row_hash is not null;

create or replace function public.arcane_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists permission_memory_touch on public.permission_memory;
drop trigger if exists agent_budgets_touch     on public.agent_budgets;
drop trigger if exists room_budgets_touch      on public.room_budgets;
create trigger permission_memory_touch before update on public.permission_memory for each row execute function public.arcane_touch_updated_at();
create trigger agent_budgets_touch     before update on public.agent_budgets     for each row execute function public.arcane_touch_updated_at();
create trigger room_budgets_touch      before update on public.room_budgets      for each row execute function public.arcane_touch_updated_at();

alter table public.permission_memory enable row level security;
alter table public.agent_budgets     enable row level security;
alter table public.room_budgets      enable row level security;
-- no policies: service role only

comment on table  public.permission_memory is 'a remembered decision for a room:agent:tool:resource pattern; never for a high-tier permission';
comment on table  public.agent_budgets     is 'ceilings only — usage is always computed from agent_runs, never duplicated here';
comment on table  public.room_budgets      is 'a room without a venture (Forge, the Garage, Control) still has money to answer for';
comment on column public.agent_runs.heartbeat_at is 'the run says it is still alive; stale beyond the reap window means stalled';
comment on column public.system_events.row_hash  is 'sha256 of the previous row''s hash and this row''s own fields; see packages/database/src/audit.js';

notify pgrst, 'reload schema';
