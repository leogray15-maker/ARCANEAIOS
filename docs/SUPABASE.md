# Supabase — the cloud rung of shared memory

Project: **supabase-ARCANE-AIOS** · `https://pjdzdfmnfuneumzqoijn.supabase.co` · us-east-1.
Connected to the Vercel project `arcaneaios` through the Supabase
integration (storage name `storage`).

The facility's store persists to memory → localStorage → Supabase. There
is **no sign-in**: one operator, one site. Each browser generates an
unguessable **sync code** on first visit (130 bits, kept in localStorage)
and uses it as its row id. To carry state to a second device, open ● SYNC
in the bar, copy the code, and paste it on the other device — both then
write the same row. The code is never shown unless asked for. The state is
as private as the code; the anon key can only touch well-formed sync rows.

## Set-up — once

### 1. The tables (SQL Editor)

Open the project → SQL Editor → paste each migration → Run, in order:

| Migration | Creates | Needed by |
| --- | --- | --- |
| `0002_sync_codes.sql` | `arcane_sync` — one row per sync code | the floor's store (orders, lists, journal…) |
| `0003_content_machine.sql` | `archive_modules`, `knowledge_sources`, `content_drafts`, `content_revisions`, `agent_runs`, `system_events` | the Library, BEACON, HERALD, `archives:sync`, `vault:sync` |
| `0004_operating_state.sql` | `orders`, `list_items`, `decisions`, `counsel_turns`, `venture_focus`, `goal_progress`, `days` | the Bridge, THE WAR ROOM, every room's orders board, Counsel and the Council, the brief |
| `0005_lab.sql` | `products`, `stock_lots`, `dispatch`, `settings` | THE LAB, VIGIL's stock signals, the brief's Peptides line |
| `0006_vault.sql` | `ledger_months`, `fixed_costs`, `cash_snapshots`, `pots` | THE VAULT, THE MARKET, VITALS, the brief's MONEY block, the goals |
| `0007_sanctum.sql` | `protocol_items`, `protocol_ticks`, `entries` | SANCTUM, the strip's protocol count, VIGIL |
| `0008_trading.sql` | `trades`, `setups`, `checkins` | THE TRADING FLOOR, VIGIL's drawdown and rule-break signals |
| `0009_proposals.sql` | `orders.source_id`, `orders.agent`, the `proposed` state | An agent may propose; only the operator approves. Every order can name what caused it. |
| `0010_dispatch_items.sql` | `dispatch_items` | The lines of a dispatch: product, lot, vials, price and cost captured at shipping. Shipping draws the lots down; realised margin follows. |
| `0013_ai_layer.sql` | `agents`, `outputs`, `model_usage`; `agent_runs.cost_gbp`, `steps`, `duration_ms`, `trigger`, `output_ref` | THE AGENT GARAGE, THE COUNCIL, SCRIPTORIUM, the model budget (`docs/AI.md`). Run after `0011` and `0012`. |

All seven are idempotent. The dashboard's "Last migration" card only counts
migrations pushed by the Supabase CLI, so it says "No migrations" even
after these have run; the Table Editor and `npm run db:check` are the
truth. (`0001_arcane_state.sql` was the earlier sign-in
model; it is not needed.) `npm run db:check` (with the service key in
`.env`) prints which tables answer and names the migration for each gap.

**"Could not find the table public.arcane_sync in the schema cache"** is
PostgREST saying the table does not exist: 0002 has not been run. The same
message for `content_drafts` means 0003. Nothing is cached wrongly; run
the migration.

Then put the Archives in: `npm run herald:index && npm run archives:sync`
(the service key in `.env`). Incremental after the first time — only
modules whose text changed are written. And the catalogue:
`npm run products:import` (from `data/peptides/catalog.json`, local).

### 2. Environment (already done by the integration)

The Vercel integration added, with its `storage_` prefix:

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_storage_SUPABASE_URL` | the project URL (also hard-coded as a fallback) |
| `NEXT_PUBLIC_storage_SUPABASE_PUBLISHABLE_KEY` or `storage_SUPABASE_ANON_KEY` | the browser key — the only key the build reads |
| `storage_SUPABASE_SERVICE_ROLE_KEY` | the API functions (`api/*.js`) and, as `SUPABASE_SERVICE_ROLE_KEY` in `.env`, the tools; **never read by the facility build** |
| `ARCANE_OPERATOR_KEY` | set by hand in the Vercel project and in `.env`: the secret every `/api` call must carry (see below) |
| `ANTHROPIC_API_KEY` | set by hand: HERALD, Counsel, the Council |
| `storage_POSTGRES_*` | unused |

`apps/facility/vite.config.js` reads those exact names (and the plain
`SUPABASE_URL` / `SUPABASE_ANON_KEY` spellings for local `.env`). Only the
URL and the publishable/anon key are injected, by name — a prefix rule
could sweep a service-role key into the bundle, so there is none.

Redeploy once after step 2 if the variables were added after the last build.

## Using it

Nothing to do. The bar shows `● SYNC` when the build has the key; the
Bridge reports `memory: synced`. Everything the store holds — orders,
stock, ledger, split, goals, draft status, lists, protocol, the Trading
Journal — is written to this device's row on every change and read back
on load; every 30 s the facility checks whether another device wrote
something newer and, if so, takes it (newest state wins whole).

Second device: ● SYNC → copy the code here → ● SYNC → paste → join.

`npm run vault:sync` (with `SUPABASE_SERVICE_ROLE_KEY` in `.env`) reads
every row, folds them into one state (newest wins per item, nothing lost
across devices) and lands each part in the vault: every draft from
`content_drafts` as a generated file in its status folder (and any
hand-emitted draft the database has not seen goes up into it), new and
done orders in `06-Orders/Orders.md`,
the boards in `05-Knowledge/Lists.md`, protocol ticks in
`04-Records/Protocol.md`, trades in `04-Records/Journal/`, Council
decisions in `04-Records/Decisions/` and the Decision-Log, Counsel turns
in `04-Records/Counsel.md`. It ends by writing the brief (`npm run
brief`), which also works without the key, from the vault alone.

## The operator key

The site is public and anyone who opens it gets a sync code, so a sync
code cannot be authority. `ARCANE_OPERATOR_KEY` is: one long random
secret (`openssl rand -base64 32`), set in the Vercel project and in
`.env`, pasted once into each browser through the DEVICE control in the
bar (or the prompt the Library and BEACON show). It is kept in that
browser's localStorage and sent as a bearer header on every `/api` call.
Without it on the server the API refuses everything and says so.

## Shape

```
arcane_sync (id text = 'sync-<26 chars>', body jsonb, updated timestamptz)
```

`body` is the store's state (`v: 3`) — the floor's working set. The
journal rides inside it for now; when there are enough trades to want SQL
over them, `arcane_trades` gets its own table and the journal writes both.

Content does not ride in it. Modules, drafts, revisions, runs and events
have tables of their own (`docs/DATA-MODEL.md`), reached only through
`/api/*` with the service key — the anon key has no policy on them.

## Local development

`npm run dev` starts the API (`tools/dev-api.mjs`, the same `api/*.js`
Vercel runs, on 8787) and Vite, which proxies `/api` to it. With
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`ARCANE_OPERATOR_KEY` and `ANTHROPIC_API_KEY` in `.env` it is the
production loop on a laptop. `npm run dev:local` needs none of the
Supabase or Anthropic values: it uses the dev database (modules from
`data/archives`, content in `data/dev-db.json`) and the mock writer.
