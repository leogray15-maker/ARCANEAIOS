-- THE ARCANE — missions: work the network does on its own, inside the
-- standing rules. docs/MISSIONS.md.
--
-- Run in the Supabase SQL Editor after 0012 (idempotent; safe to re-run).
--
-- One table. A mission is a template's steps (packages/config/src/missions.js)
-- snapshotted onto the row when it is queued, plus where the run of them
-- has got to. Each step the worker runs is still an agent_runs row, every
-- change still a system event, and an approval is still a proposed order
-- on the board: nothing here is a second record of anything.
--
-- A standing mission (state 'standing', a cron in `schedule`) is never run
-- itself; the worker queues a copy of it each time it falls due.
--
-- Access: RLS on, no anon policies. Only the service role, through /api
-- and the worker.

create table if not exists public.missions (
  id            text        primary key,                   -- MIS-YYYYMMDD-NNN
  title         text        not null default '',
  objective     text        not null default '',
  template      text        not null,                      -- an id from MISSION_TEMPLATES
  agent         text        not null default '',           -- the template's agent
  room          text        not null default '',
  state         text        not null default 'queued'
                check (state in ('standing', 'queued', 'running', 'paused', 'done', 'failed', 'cancelled')),
  priority      integer     not null default 2 check (priority between 0 and 3),
  source        text        not null default 'floor',      -- floor | schedule | agent | counsel
  input         jsonb       not null default '{}'::jsonb,   -- what the template asks for (a question, a lane)
  plan          jsonb       not null default '[]'::jsonb,   -- the steps, as they were when it was queued
  progress      jsonb       not null default '{}'::jsonb,   -- the workflow engine's state: done, skipped, failed, pending
  output        jsonb       not null default '{}'::jsonb,   -- the template's result (a research packet, a critique, the lessons)
  error         text        not null default '',
  schedule      text        not null default '',           -- a five-field cron, for a standing mission
  next_run_at   timestamptz,
  parent_id     text        not null default '',           -- the standing mission this one was queued from
  pending_order text        not null default '',           -- the proposed order an approval step is waiting on
  claimed_by    text        not null default '',           -- the worker running it
  heartbeat_at  timestamptz,
  current_step  text        not null default '',
  steps_run     integer     not null default 0,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists missions_state on public.missions (state, priority, created_at);
create index if not exists missions_due   on public.missions (next_run_at) where state = 'standing';

-- The run a step made, so a run can say which mission it belonged to.
alter table public.agent_runs add column if not exists mission_id text not null default '';
create index if not exists agent_runs_mission on public.agent_runs (mission_id) where mission_id <> '';

create or replace function public.arcane_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists missions_touch on public.missions;
create trigger missions_touch before update on public.missions for each row execute function public.arcane_touch_updated_at();

alter table public.missions enable row level security;
-- no policies: service role only

comment on table  public.missions          is 'work the network does on its own; steps above draft wait for an approval';
comment on column public.missions.plan     is 'the template steps snapshotted at queue time, so a template edit never changes a mission in flight';
comment on column public.missions.progress is 'packages/database/src/workflow.js state: { done, skipped, failed, pending }';

notify pgrst, 'reload schema';
