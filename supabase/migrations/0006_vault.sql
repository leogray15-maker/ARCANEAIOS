-- THE ARCANE — THE VAULT: money with a history.
--
-- Run in the Supabase SQL Editor after 0005 (idempotent; safe to re-run).
--
-- One row per venture per month (revenue, units, the funnel), the fixed
-- costs, cash as dated snapshots, and the split into pots. Every figure
-- is typed by Leo; nothing here moves money. The Vault reads these; so
-- do the brief's MONEY block, the goals and VIGIL.

create table if not exists public.ledger_months (
  id           text        primary key,                 -- '2026-09:archives'
  month        text        not null check (month ~ '^\d{4}-\d{2}$'),
  venture      text        not null,
  revenue_gbp  numeric,                                 -- typed; for a priced venture, units × price when left empty
  units        integer,                                 -- members, orders, sales
  visitors     integer,
  leads        integer,
  orders       integer,
  note         text        not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists ledger_months_month on public.ledger_months (month desc, venture);

create table if not exists public.fixed_costs (
  id          text        primary key,                  -- slug
  name        text        not null,
  amount_gbp  numeric     not null default 0,
  room        text        not null default '',
  active      boolean     not null default true,
  note        text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.cash_snapshots (
  day         date        primary key,
  cash_gbp    numeric     not null default 0,
  note        text        not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.pots (
  id          text        primary key,
  name        text        not null,
  pct         numeric     not null default 0 check (pct >= 0 and pct <= 100),
  note        text        not null default '',
  accent      text        not null default 'ash',
  position    integer     not null default 0,
  updated_at  timestamptz not null default now()
);

create or replace function public.arcane_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists ledger_months_touch on public.ledger_months;
drop trigger if exists fixed_costs_touch   on public.fixed_costs;
drop trigger if exists pots_touch          on public.pots;
create trigger ledger_months_touch before update on public.ledger_months for each row execute function public.arcane_touch_updated_at();
create trigger fixed_costs_touch   before update on public.fixed_costs   for each row execute function public.arcane_touch_updated_at();
create trigger pots_touch          before update on public.pots          for each row execute function public.arcane_touch_updated_at();

alter table public.ledger_months  enable row level security;
alter table public.fixed_costs    enable row level security;
alter table public.cash_snapshots enable row level security;
alter table public.pots           enable row level security;
-- no policies: service role only

insert into public.fixed_costs (id, name, room) values
  ('stock', 'Stock & storage', 'apothecary'), ('shipping', 'Packaging & postage', 'apothecary'), ('testing', 'HPLC & COA testing', 'apothecary'),
  ('software', 'Software & hosting', 'forge'), ('ads', 'Ads & promotion', 'beacon'), ('personal', 'Personal fixed costs', 'sanctum')
  on conflict (id) do nothing;
insert into public.pots (id, name, pct, note, accent, position) values
  ('tax', 'Tax set-aside', 25, 'VAT and corporation tax. Untouchable.', 'breach', 0),
  ('reinvest', 'Reinvest', 35, 'Stock, build, ads — the compounding half.', 'arcane', 1),
  ('pay', 'Pay yourself', 25, 'The reason any of this exists.', 'vital', 2),
  ('reserve', 'War chest', 15, 'Runway. Lets you say no to bad deals.', 'gold', 3)
  on conflict (id) do nothing;

notify pgrst, 'reload schema';
