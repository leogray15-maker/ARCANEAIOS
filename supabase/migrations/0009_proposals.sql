-- THE ARCANE — an order can be proposed, and can say what caused it.
--
-- Run in the Supabase SQL Editor after 0008 (idempotent; safe to re-run).
--
-- An order is already the unit of routed work. Two things were missing
-- before it could carry the loop end to end:
--
--   1. A proposal is not work. An agent that finds something may say so,
--      but nothing enters the floor's queue until the operator approves
--      it. That is the `proposed` state: it is not open, it pulls no
--      crew, and it can only become open or killed.
--   2. Every order should be able to name what caused it. `source` says
--      what kind of thing (floor, brain, counsel, council, signal, agent)
--      and `source_id` names the one it was: a run id, a signal id, a
--      decision id. `agent` names who proposed it, when it was not Leo.
--
-- Nothing is rewritten: existing rows keep their state and get empty
-- strings for the new columns, which is what "a human typed this" means.
--
-- Access: unchanged. RLS on, no anon policies; only the service role.

alter table public.orders add column if not exists source_id text not null default '';
alter table public.orders add column if not exists agent     text not null default '';

-- Widen the state vocabulary to include `proposed`. Dropping and adding is
-- how a check constraint is changed; both halves are safe to re-run.
alter table public.orders drop constraint if exists orders_state_check;
alter table public.orders add  constraint orders_state_check
  check (state in ('proposed', 'open', 'active', 'blocked', 'review', 'done', 'killed'));

-- What caused this order, and what is waiting for approval.
create index if not exists orders_source   on public.orders (source, source_id);
create index if not exists orders_proposed on public.orders (state, created_at) where state = 'proposed';

comment on column public.orders.source_id is 'the id of the thing that caused this order: a run, a signal, a decision';
comment on column public.orders.agent     is 'the agent that proposed it, empty when the operator typed it';
