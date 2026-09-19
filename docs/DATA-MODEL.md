# Data model

Four kinds of thing, four places, never one table.

| Kind | Question it answers | Lives in | Written by |
| --- | --- | --- | --- |
| **Knowledge** | What do the Archives say? | `archive_modules`, `knowledge_sources` · the vault export on disk | `tools/archives-sync.mjs` |
| **Content** | What are we saying? | `content_drafts`, `content_revisions` · mirrored to `brain/02-Content` | HERALD (`draft` only), Leo (everything else) |
| **Agents** | What did an agent do, and how did it go? | `agent_runs` · `04-Records/Trace` for CLI runs | the engine, `emit.mjs` |
| **Records** | What happened? | `system_events` (append-only) · `04-Records/*` | every write above |
| **Memory** | What is true about Leo and the ventures? | `brain/03-Memory`, `05-Knowledge` (Markdown) | ARCANE, Leo |
| **Operating state** | What is the floor working on? | `orders`, `list_items`, `decisions`, `counsel_turns`, `venture_focus`, `goal_progress`, `days` · mirrored into the vault | the rooms, through `/api/state` |
| **The Lab** | What is sold, what it costs, what is on the shelf, what is going out | `products`, `stock_lots`, `dispatch`, `settings` (0005) · mirrored to `05-Knowledge/Lab.md` | THE LAB, `tools/products-import.mjs` |
| **The Vault** | What came in, what goes out, what is in the bank | `ledger_months`, `fixed_costs`, `cash_snapshots`, `pots` (0006) · mirrored to `05-Knowledge/Money.md` | THE VAULT, THE MARKET, VITALS |
| **The operator** | How Leo is, what he holds to | `days`, `protocol_items`, `protocol_ticks`, `entries` (0007) · only the day and the protocol mirrored | SANCTUM, the Bridge (the focus) |
| **The Journal** | Every trade | `trades`, `setups`, `checkins` (0008) · mirrored to `04-Records/Journal/` | THE TRADING FLOOR |
| **The device** | Where the crew stand, this session's floor log | `arcane_sync` (one JSON row per device) | the facility store — nothing that matters lives here any more |

Everything a room shows used to ride in `arcane_sync` as one JSON blob
per device. It all moved to tables (0004–0008) because two devices could
not agree on a blob, nothing in it could be validated, and the Bridge has
to aggregate it. The blob now carries only crew positions and the floor
log; `tools/lib/state.mjs` still folds it for those.

## The operating state (supabase/migrations/0004_operating_state.sql)

One registry, `packages/database/src/state.js`, describes every table:
key, settable columns with their validators, defaults, id minting. The
gateway `api/state.js` and the tools go through its verbs — `list`,
`insert`, `update`, `remove` — so a rule holds once. Every change is a
`system_events` row.

### orders
`id` (`ORD-YYYYMMDD-NNN`) · `room` · `text` · `priority` (0–3) · `state` (open | active | blocked | review | done | killed — `ORDER_STATES`) · `holder` · `actor` (human | agent) · `venture` · `blocked_on` · `due` · `note` · `source` (floor | brain | counsel | council) · `brain_n` (its number in 06-Orders/Orders.md) · `done_at`.
Never deleted: `killed` is a state. The unit of routed work; crew on the floor walk toward rooms with open ones.

### list_items
`id` · `list` (moves | stop | watch | pipeline | ideas) · `text` · `tag` · `venture` · `position` · `done` · `outcome` · `done_at`.
One shape, five rooms: THE WAR ROOM (moves, stop), INTELLIGENCE (watch), THE DEAL ROOM (pipeline), THE INVENTOR'S ROOM (ideas). Done keeps the outcome.

### decisions
`id` (`DEC-YYYYMMDD-NNN`) · `question` · `verdict` (BUILD | DELAY | WATCH | KILL) · `summary` · `conditions` (jsonb list) · `dissent` · `positions` (jsonb, the nine seats) · `outcome` · `source` (council | leo) · `device` · `usage` · `reviewed_at`.
A verdict without an outcome is "waiting on you" on the Bridge.

### counsel_turns
`id` · `who` (leo | arcane) · `text` · `specialist` · `proposal` (jsonb: room, text, priority, actor) · `device`.

### venture_focus
`venture` (pk) · `rank` · `allocation` (push | maintain | starve) · `why`. Set in THE WAR ROOM; read by the Bridge, the brief and Counsel.

### goal_progress
`goal_id` (pk, from 05-Knowledge/Goals.md) · `value` · `note`. The computed goals (COA, MRR, posts) are not stored; the typed ones are.

### days
`day` (pk) · `focus` · `note` · `energy` (1–10) · `sleep`. The Bridge writes the focus line; SANCTUM will write the rest.

### THE LAB (supabase/migrations/0005_lab.sql)

**products** — `id` (slug, e.g. `ghk-cu-50mg`) · `name` · `size` · `category` · `listed` (on the store) · `sell_gbp` (per vial) · `supplier_id` · `supplier_code` · `supplier_section` · `kit_cost_usd` · `kit_vials` · `active` · `note`. Never deleted: `active` false retires a line.
**stock_lots** — `id` (`LOT-YYYYMMDD-NNN`) · `product_id` → products · `batch` · `vials` (≥ 0) · `coa` (none | pending | published) · `coa_url` · `cost_usd` (this lot's kit cost when it differed) · `received` · `note`. A product's stock is the sum of its lots; its COA is the worst live lot's.
**dispatch** — `id` (`DSP-YYYYMMDD-NNN`) · `ref` · `items` · `stage` (packing | ready | shipped | delivered | cancelled) · `tracking` · `note` · `shipped_at`. Never deleted: `cancelled` is a stage.
**settings** — `key` (fx_gbp_per_usd | landed_overhead_pct | low_stock_vials) · `value` · `note`. The numbers a room computes with, typed once.
The arithmetic is `apps/facility/src/core/lab.js` (landed cost per vial = kit cost ÷ vials × rate × (1 + overhead); margin on the vial price; `labSummary`), imported by the floor, the Bridge aggregate and the vault mirror alike.

### THE VAULT (0006)
**ledger_months** — `id` (`YYYY-MM:venture`) · `month` · `venture` · `revenue_gbp` (typed; for a priced venture, units × price when empty) · `units` · `visitors` · `leads` · `orders` · `note`. One row per venture per month; THE MARKET and VITALS write the same rows.
**fixed_costs** — `id` (slug) · `name` · `amount_gbp` · `room` · `active` · `note`. Retired, not deleted.
**cash_snapshots** — `day` (pk) · `cash_gbp` · `note`. Runway is the latest snapshot over the monthly shortfall.
**pots** — `id` · `name` · `pct` (0–100) · `note` · `accent` · `position`. The split; the Vault flags a total that is not 100.
The arithmetic is `apps/facility/src/core/money.js` (`moneySummary`, `history`), imported by the floor, the aggregate, the brief and the mirror.

### SANCTUM (0007)
**protocol_items** — `id` (slug) · `name` · `target` · `unit` · `cadence` (day | week) · `active` · `position`.
**protocol_ticks** — `id` (`YYYY-MM-DD:item`) · `day` · `item_id` · `done` · `value`.
**entries** — `id` (`ENT-YYYYMMDD-NNN`) · `kind` (journal | reflection | principle | objective | decision) · `title` · `body` · `status` (open | kept | done | dropped) · `private`. Never deleted, never mirrored.

### THE TRADING FLOOR (0008)
**trades** — `id` (`T-YYYYMMDD-NN`) · `instrument` · `direction` (Long | Short) · `session` · `killzone` · `setup` · `bias` · `grade` · `conviction` · `entry` · `stop` · `target` · `exit` · `risk` · `size` · `opened` · `closed` · `plan_followed` · `rule_breaks[]` · `emotion_before/during/after` · `energy` · `sleep` · `stress` · `streamed` · `process` · `thesis` · `execution` · `review` · `lesson` · `chart` · `example`. R, outcome and the statistics are computed in `core/journal.js`, never stored.
**setups** — `id` (slug) · `name` · `status` · `session` · `tf` · `conditions` · `trigger` · `stop` · `target` · `aplus` · `invalidation`.
**checkins** — `id` · `type` · `mood` · `stress` · `energy` · `sleep` · `streamed` · `acted` · `trigger` · `note`.

### The Bridge aggregate
`packages/database/src/bridge.js` reads these tables plus draft counts, runs and events and arranges them: today (focus, P0/P1 not blocked, moves tagged now, due), waiting (drafts, blocked, review, verdicts without outcomes, stale P0s), active (runs, rooms with work), ventures (rank, allocation, open, top order), the Lab's summary, this month's money and today's protocol. `api/bridge.js` serves it; `tools/brief.mjs` writes the brief from it.

### The store
`apps/facility/src/core/store.js` caches the server tables in the shapes
the floor draws (`store.orders(room)`, `store.openItems('moves')`,
`store.focusOf(v)` …). A change applies at once, goes to `/api/state`,
and if the server refuses it the store reloads and the bar says why.
Without the operator key the server-backed parts are read-only and every
room says so. `vault:sync` lands the tables in the brain
(`tools/lib/state-mirror.mjs`): Orders.md's two tables by number,
Lists.md, Focus.md, Decisions/, Counsel.md.

## Tables (supabase/migrations/0003_content_machine.sql)

### knowledge_sources
`id` (vault | export | notion) · `kind` · `location` · `status` (idle | syncing | ok | error) · `last_synced_at` · `module_count` · `last_error`.
One row per source. THE CONTROL ROOM will read this for sync state.

### archive_modules
`id` (the indexer's id: `<subject>--<title>--<notion tail>`) · `notion_id` · `source_id` → knowledge_sources · `source_path` (the note's file name) · `source_url` · `title` · `subject` · `parent` · `lane` · `kind` (module | index | retired) · `words` · `sensitive` · `flags[]` · `gate` (allowed | open | never) · `excerpt` · `body` · `content_hash` · `source_updated_at` · `indexed_at` · `search` (tsvector, generated, GIN).
`archive_subjects` is a view over it: subject, lane, gate, module count, words.

### content_drafts
`id` (`HER-YYYYMMDD-NNN`, same minting as the CLI) · `run_id` · `module_id` → archive_modules · `parent_id` → content_drafts · `agent` · `format` · `platform` · `status` · `title` · `hook` · `body` · `angle` · `cta` · `tags[]` · `word_count` · `compliance` · `compliance_notes` · `source_subject` · `source_module` · `source_ref` · `source_url` · `source_note` · `revision` · `model` · `created_at` · `updated_at` · `approved_at` · `rejected_at` · `scheduled_for` · `published_at` · `published_url`.
Check constraints hold `status` to the six states and `format` to the five formats.

### content_revisions
`draft_id` · `revision` · `kind` (generated | edit | status | regenerate) · `actor` · `status_before` · `status_after` · `title` · `body` · `platform` · `note` · `created_at`. Unique on (draft_id, revision). Every change is a revision, so the history of a draft is one ordered list.

### agent_runs
`id` (`HER-R-YYYYMMDD-NNN`) · `agent` · `skill` · `objective` · `status` (running | ok | failed | refused) · `model` · `input` (jsonb: module, formats, parent) · `sources[]` · `output` (jsonb: draft ids, refused, warnings) · `usage` (jsonb: tokens) · `error` · `device` (the sync code that asked) · `started_at` · `finished_at`.

### system_events
`at` · `kind` (draft.generated | draft.status | draft.edited | draft.imported | run.ok | run.failed | run.refused | sync.modules) · `actor` · `subject_type` · `subject_id` · `summary` · `data` (jsonb).

## The draft lifecycle

States: `draft → review → approved → scheduled → posted`, and `killed`
from anywhere but posted; `killed → draft` to revive; `posted → approved`
to pull back. The map is `DRAFT_TRANSITIONS` in
`packages/config/src/loop.js`; the views BEACON groups them into are
`DRAFT_VIEWS` there too. `npm run check` proves every state is reachable
and every move lands on a known state.

## Access

RLS is enabled on every content table with **no** policies: only the
service role reads or writes, and the service role exists only in Vercel
functions and in `.env` on Leo's Mac. The browser calls `/api/*` with the
operator key; the API talks to Postgres. The anon key in the bundle can
touch `arcane_sync` and nothing else.

## Identifiers

Draft and run ids are minted by day with a three-digit counter, the same
way in the engine (`nextId` against the table) and in `emit.mjs` (against
the vault's files, the log, and the table when it is reachable), so a
draft made on the floor and one made in the terminal never collide.

## Clients

- `packages/database/src/index.js` — `createDb()`: get/post/patch/delete over PostgREST, errors translated (a missing table names its migration).
- `packages/database/src/content.js` — the verbs: `modules.search/get/subjects/upsert/hashes`, `drafts.list/get/create/edit/setStatus/counts`, `runs.start/finish/list`, `events.add/list`, `sources.mark/list`.
- `packages/database/src/state.js` — the operating-state registry and `state.list/insert/update/remove/all`; `bridge.js` — `aggregate()`.
- `packages/database/src/memory.js` — the in-memory twin (tests); `dev.js` — the dev database (memory + the real index + `data/dev-db.json`).
- `apps/facility/src/core/api.js` — the browser side: `api.modules`, `api.herald`, `api.drafts`, `api.runs`, `api.state`, `api.bridge`.

## Migrations

`supabase/migrations/000N_*.sql`, idempotent, run in order in the Supabase
SQL editor. `npm run db:check` says which are applied. Never change a
table by hand in the dashboard: write the next migration.
