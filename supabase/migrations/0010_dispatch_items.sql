-- THE ARCANE — what actually went out, and which lot it came from.
--
-- Run in the Supabase SQL Editor after 0009 (idempotent; safe to re-run).
--
-- Until now a dispatch carried one free-text line ("2x GHK-Cu, 1x BPC"),
-- which is enough to pack a box and useless for anything else: stock did
-- not move when it shipped, and margin could only ever be the
-- catalogue's — price minus landed cost — never what was actually made.
--
-- A dispatch item closes the chain:
--
--   supplier → lot → unit cost → product → sale → revenue → realised margin
--
-- Two fields do the work. `unit_cost_gbp` and `unit_price_gbp` are
-- *captured at the moment of shipping* rather than looked up later, so a
-- change in the exchange rate or in the price list never rewrites what a
-- past sale made. That is the difference between a ledger and a guess.
--
-- Shipping a dispatch draws its items out of their lots (see
-- packages/database/src/state.js). A dispatch with no items still ships;
-- it simply has nothing to say about margin, and the room says so.
--
-- Access: RLS on, no anon policies; only the service role, through /api.

create table if not exists public.dispatch_items (
  id             text        primary key,                 -- DSI-YYYYMMDD-NNN
  dispatch_id    text        not null references public.dispatch (id) on delete cascade,
  product_id     text        not null references public.products (id),
  lot_id         text        references public.stock_lots (id),   -- null until it is picked from a lot
  vials          integer     not null default 1 check (vials > 0),
  unit_price_gbp numeric,                                  -- what it sold for, as sold
  unit_cost_gbp  numeric,                                  -- landed cost of that lot, as at shipping
  note           text        not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists dispatch_items_dispatch on public.dispatch_items (dispatch_id);
create index if not exists dispatch_items_product  on public.dispatch_items (product_id, created_at);
create index if not exists dispatch_items_lot      on public.dispatch_items (lot_id);

alter table public.dispatch_items enable row level security;

drop trigger if exists dispatch_items_touch on public.dispatch_items;
create trigger dispatch_items_touch before update on public.dispatch_items
  for each row execute function public.arcane_touch_updated_at();

comment on table  public.dispatch_items          is 'the lines of a dispatch: what went out, from which lot, at what price and what it had cost';
comment on column public.dispatch_items.unit_cost_gbp  is 'captured when the dispatch ships, so a later FX or price change never rewrites a past sale';
comment on column public.dispatch_items.unit_price_gbp is 'captured when the dispatch ships, from the product unless the line says otherwise';
