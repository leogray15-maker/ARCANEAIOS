-- THE ARCANE — THE LAB: Arcane Peptides as operations.
--
-- Run in the Supabase SQL Editor after 0004 (idempotent; safe to re-run).
--
-- The catalogue (what is sold, at what price, and what it costs per kit
-- from the supplier), stock as lots with a batch and a COA state, the
-- dispatch queue, and a small settings table for the numbers a room needs
-- to compute with (the exchange rate, the landed overhead, the low-stock
-- line). Operations only: nothing here says what a compound does.
--
-- Access: RLS on, no anon policies. Only the service role, through /api.

create table if not exists public.settings (
  key         text        primary key,
  value       text        not null default '',
  note        text        not null default '',
  updated_at  timestamptz not null default now()
);

create table if not exists public.products (
  id               text        primary key,              -- slug: ghk-cu-50mg
  name             text        not null,
  size             text        not null default '',      -- 5mg, 10ml, 5000iu …
  category         text        not null default '',      -- the store's category, or the supplier's section for unlisted lines
  listed           boolean     not null default true,    -- on the store
  sell_gbp         numeric,                              -- per vial
  supplier_id      text        not null default 'jx',
  supplier_code    text        not null default '',
  supplier_section text        not null default '',
  kit_cost_usd     numeric,                              -- per kit from the supplier
  kit_vials        integer     not null default 10,
  active           boolean     not null default true,
  note             text        not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists products_category on public.products (category, name);
create index if not exists products_listed on public.products (listed, active);

create table if not exists public.stock_lots (
  id          text        primary key,                   -- LOT-YYYYMMDD-NNN
  product_id  text        not null references public.products (id),
  batch       text        not null default '',
  vials       integer     not null default 0 check (vials >= 0),
  coa         text        not null default 'none' check (coa in ('none', 'pending', 'published')),
  coa_url     text        not null default '',
  cost_usd    numeric,                                   -- what this lot actually cost per kit, when it differs from the catalogue
  received    date,
  note        text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists stock_lots_product on public.stock_lots (product_id);

create table if not exists public.dispatch (
  id          text        primary key,                   -- DSP-YYYYMMDD-NNN
  ref         text        not null,                      -- the order reference from the store
  items       text        not null default '',
  stage       text        not null default 'packing' check (stage in ('packing', 'ready', 'shipped', 'delivered', 'cancelled')),
  tracking    text        not null default '',
  note        text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  shipped_at  timestamptz
);
create index if not exists dispatch_stage on public.dispatch (stage, created_at);

create or replace function public.arcane_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists settings_touch   on public.settings;
drop trigger if exists products_touch   on public.products;
drop trigger if exists stock_lots_touch on public.stock_lots;
drop trigger if exists dispatch_touch   on public.dispatch;
create trigger settings_touch   before update on public.settings   for each row execute function public.arcane_touch_updated_at();
create trigger products_touch   before update on public.products   for each row execute function public.arcane_touch_updated_at();
create trigger stock_lots_touch before update on public.stock_lots for each row execute function public.arcane_touch_updated_at();
create trigger dispatch_touch   before update on public.dispatch   for each row execute function public.arcane_touch_updated_at();

alter table public.settings   enable row level security;
alter table public.products   enable row level security;
alter table public.stock_lots enable row level security;
alter table public.dispatch   enable row level security;
-- no policies: service role only

insert into public.settings (key, value, note) values
  ('fx_gbp_per_usd', '0.746', 'pounds per US dollar, for the supplier''s prices — mid-market Sept 2026; change it in THE LAB'),
  ('landed_overhead_pct', '0', 'shipping, import and fees, as a percentage on top of the kit cost'),
  ('low_stock_vials', '12', 'a product with fewer vials than this is a low line')
  on conflict (key) do nothing;

notify pgrst, 'reload schema';
