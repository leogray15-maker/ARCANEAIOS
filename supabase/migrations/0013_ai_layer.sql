-- THE ARCANE — the AI layer: runnable agents, what they produce, and what
-- every model call cost.
--
-- Run in the Supabase SQL Editor after 0012 (idempotent; safe to re-run).
--
--   agents       one row per runnable agent in packages/agents/src/registry.js:
--                the operator's switches (enabled, schedule) and the run lock.
--                The definition itself lives in code; `config` is a copy of it
--                for the floor to show, refreshed on every run.
--   agent_runs   (exists since 0003) gains cost, steps, duration, trigger and
--                an output reference, so a run row is the whole story.
--   outputs      what an agent produced for a room: a summary, a draft, a
--                verdict, a trend. Pending until the operator says otherwise.
--   model_usage  one row per model call, success or failure: the ledger the
--                monthly budget is checked against before every paid call.
--
-- Access: RLS on, no anon policies. Only the service role, through /api.

create table if not exists public.agents (
  id           text        primary key,                 -- an id from packages/agents/src/registry.js
  enabled      boolean     not null default false,      -- off until the operator switches it on
  schedule     text        not null default '',         -- 5-field cron (UTC); empty means manual only
  config       jsonb       not null default '{}'::jsonb, -- the code definition as last run, for display
  lock_run_id  text,                                    -- the run holding the lock, if any
  lock_until   timestamptz,                             -- a lock past this time is stale and may be taken
  last_run_at  timestamptz,
  last_status  text        not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.agent_runs add column if not exists cost_gbp    numeric not null default 0;
alter table public.agent_runs add column if not exists steps       integer not null default 0;
alter table public.agent_runs add column if not exists duration_ms integer;
alter table public.agent_runs add column if not exists trigger     text    not null default '';   -- manual | cron | council
alter table public.agent_runs add column if not exists output_ref  text    not null default '';   -- an outputs.id or a draft id

create table if not exists public.outputs (
  id           text        primary key,                 -- OUT-YYYYMMDD-NNN
  run_id       text        not null default '',
  agent        text        not null,                    -- the agents.id that produced it
  type         text        not null,
  room         text        not null,                    -- an id from packages/config/src/rooms.js
  title        text        not null default '',
  content      text        not null default '',
  data         jsonb       not null default '{}'::jsonb,
  source_ref   text        not null default '',          -- e.g. a Notion page id
  source_hash  text        not null default '',          -- what the source looked like, to skip it when unchanged
  status       text        not null default 'pending',
  model        text        not null default '',
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint outputs_type   check (type in ('summary', 'draft', 'verdict', 'trend', 'note')),
  constraint outputs_status check (status in ('pending', 'approved', 'rejected'))
);
create index if not exists outputs_room    on public.outputs (room, status, created_at desc);
create index if not exists outputs_agent   on public.outputs (agent, created_at desc);
create index if not exists outputs_source  on public.outputs (agent, source_ref);

create table if not exists public.model_usage (
  id           bigserial   primary key,
  at           timestamptz not null default now(),
  run_id       text        not null default '',
  agent        text        not null default '',
  purpose      text        not null default '',
  provider     text        not null,
  model        text        not null,                    -- the key in packages/ai/src/models.js
  model_id     text        not null,                    -- the provider's id
  served_model text        not null default '',          -- what actually answered (OpenRouter's free router picks one)
  free         boolean     not null default true,
  ok           boolean     not null default false,
  error        text        not null default '',
  tokens_in    integer     not null default 0,
  tokens_out   integer     not null default 0,
  cost_usd     numeric     not null default 0,
  cost_gbp     numeric     not null default 0,
  latency_ms   integer     not null default 0
);
create index if not exists model_usage_at    on public.model_usage (at desc);
create index if not exists model_usage_paid  on public.model_usage (at) where not free;
create index if not exists model_usage_run   on public.model_usage (run_id);

create or replace function public.arcane_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists agents_touch  on public.agents;
drop trigger if exists outputs_touch on public.outputs;
create trigger agents_touch  before update on public.agents  for each row execute function public.arcane_touch_updated_at();
create trigger outputs_touch before update on public.outputs for each row execute function public.arcane_touch_updated_at();

alter table public.agents      enable row level security;
alter table public.outputs     enable row level security;
alter table public.model_usage enable row level security;
-- no policies: service role only

comment on table  public.agents      is 'runnable AI agents: the operator''s switches and the run lock; the definition is in packages/agents/src/registry.js';
comment on table  public.outputs     is 'what an agent produced for a room, pending until reviewed';
comment on table  public.model_usage is 'every model call and its cost; the monthly budget reads this before each paid call';
comment on column public.agents.lock_until is 'taken with a conditional update (lock_until is null or past), so two runs of one agent cannot overlap';

notify pgrst, 'reload schema';
