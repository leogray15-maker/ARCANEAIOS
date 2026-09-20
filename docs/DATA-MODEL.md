# Data model

Four kinds of thing, four places, never one table.

| Kind | Question it answers | Lives in | Written by |
| --- | --- | --- | --- |
| **Knowledge** | What do the Archives say? | `archive_modules`, `knowledge_sources` · the vault export on disk | `tools/archives-sync.mjs` |
| **Content** | What are we saying? | `content_drafts`, `content_revisions` · mirrored to `brain/02-Content` | HERALD (`draft` only), Leo (everything else) |
| **Agents** | What did an agent do, and how did it go? | `agent_runs` · `04-Records/Trace` for CLI runs | HERALD's engine, CIPHER's watch, `emit.mjs` |
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
`id` (`ORD-YYYYMMDD-NNN`) · `room` · `text` · `priority` (0–3) · `state` (proposed | open | active | blocked | review | done | killed — `ORDER_STATES`) · `holder` · `actor` (human | agent) · `agent` (who proposed it) · `venture` · `blocked_on` · `due` · `note` · `source` (floor | brain | counsel | council | signal | agent) · `source_id` (the run, signal or decision it came from) · `brain_n` (its number in 06-Orders/Orders.md) · `done_at`.
Never deleted: `killed` is a state. The unit of routed work; crew on the floor walk toward rooms with open ones.

**`proposed` is the approval step.** An agent may put something forward, but a
proposal is not work: it is not counted open, it pulls no crew, it is not
mirrored into the vault, and it can only become `open` (approved) or `killed`
(refused) — never `done`, because nobody did it. A proposal must name the
`agent` that made it and a `source` other than the floor; the registry refuses
one that does not. `source_id` is what makes the chain readable in both
directions: an order can say which run or signal produced it, and THE RECORDS
can show what a run caused.

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

**dispatch_items** (0010) — `id` (`DSI-YYYYMMDD-NNN`) · `dispatch_id` · `product_id` · `lot_id` (which lot it came out of; null until picked) · `vials` · `unit_price_gbp` · `unit_cost_gbp` · `note`.
The lines of a dispatch, and the chain supplier → lot → unit cost → product → sale → revenue → realised margin. **Shipping is the moment the chain closes**: `state.update('dispatch', id, { stage: 'shipped' })` checks every line first (a lot must hold enough vials and must belong to the line's product), then draws the lots down and writes each line's price (the product's, unless the line says otherwise) and cost (the landed cost of *that lot* at *that moment*). A later change to the exchange rate or the price list never rewrites a past sale. A shipped dispatch cannot be cancelled or unshipped, only delivered. `realised()` in `core/lab.js` sums shipped lines — and names the ones it could not cost rather than giving them a cost of zero.

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

### NORTH STAR, MISSION CONTROL, the review cycle, bottlenecks, the capital plan (0011)
**goals** — `id` (`GL-YYYYMMDD-NNN`, or a slug for the seeded ones) · `title` · `horizon` (decade | three | year | quarter | month | week | day — longest first, `HORIZON_IDS`) · `parent_id` → goals, one horizon up (checked: a goal must serve a *longer* horizon than its parent's, never itself, never a shorter one) · `category` · `venture` · `owner` · `metric` (a key from `core/goals.js` `METRICS`, or empty) · `unit` · `currency` · `target` · `current` (typed; ignored when `metric` is set) · `status` (active | done | dropped | paused) · `starts` · `ends` · `note` · `position`. Never deleted: `dropped` is a status. A goal with neither a metric nor a typed value but with children reads as the mean of its children's progress (`core/goals.js` `target()`), never invented. `05-Knowledge/Goals.md` seeded the table once (`importGoals`, matching the hand-written rows' ids so a typed `goal_progress` value carries over) and is now its mirror (`mirrorGoals`) — a hand-written copy is kept beside it as `Goals-hand.md`.
**projects** — `id` (`PRJ-YYYYMMDD-NNN`) · `name` · `objective` · `venture` · `goal_id` → goals · `owner` · `agent` · `status` (idea | ready | active | blocked | done | dropped) · `budget_gbp` · `spent_gbp` · `starts` · `due` · `note` · `position`. Its tasks are the orders that name it (`orders.project_id`); health (on_track | at_risk | blocked | complete) is computed from them, never typed (`core/projects.js` `projectSummary`).
**reviews** — `id` (`REV-YYYYMMDD-NNN`) · `kind` (day | week | month | quarter, `REVIEW_KINDS` in `packages/config/src/loop.js` carries each kind's questions) · `period` (`2026-09-20` | `2026-W38` | `2026-09` | `2026-Q3`, `core/goals.js` `periodOf`) · `answers` (jsonb, one key per question) · `facts` (jsonb, what the state said when it was written) · `summary` · `status` (draft | kept). Once `kept` it is the record: editing or deleting it is refused.
**bottlenecks** — `id` (`BTL-YYYYMMDD-NNN`) · `text` · `area` · `severity` (info | warn | breach) · `venture` · `evidence` · `owner` · `proposed` · `status` (open | easing | cleared) · `source` · `source_id`. Never deleted: `cleared` is a status, kept for the record.
**capital_rules** — `id` (slug) · `name` · `min_available` (the rule applies once available profit reaches this) · `pcts` (jsonb `{pot_id: pct}`, must add to 100) · `active` · `position` · `note`. The first active rule (lowest `position`) whose threshold is met applies; below every threshold, the Vault's own pots apply, renormalised without the tax pot.
**capital_allocations** — `id`/`month` (`YYYY-MM`) · `available` · `rule_id` · `proposed` (jsonb `{pot_id: gbp}`, as the rules computed it) · `confirmed` (jsonb, as Leo confirmed it) · `note`. A planning record, never a bank action; once `confirmed` it cannot change. The waterfall itself — revenue → cost of goods (from shipped `dispatch_items`, or "unknown" when nothing has shipped) → gross → fixed → net → the tax pot's reserve → available → the buckets — is `core/capital.js` `waterfall()`, over the same tables THE VAULT reads.
`orders` gains `project_id`, `goal_id`, `estimate_h`, `actual_h`, `depends_on` (another order; checked to exist, and an order may not wait on itself), `recurrence` (day | week | month | ''): marking a recurring order done writes the next occurrence, due one period on. `decisions` gains `context`, `options` (jsonb), `evidence`, `assumptions`, `risks`, `impact_gbp`, `impact`, `owner`, `review_on`, `retro`, `venture`, `goal_id` — what a decision weighed, not only what it concluded. `list_items` gains `value_gbp`, `due`, `note`.

### The OpenJarvis port: governance (0012, `docs/OPENJARVIS_PORT.md`)
**permission_memory** — `permission_key` (`room:agent:tool:resource`, pk) · `decision` (always_allow | always_deny) · `tier` (trivial | low | medium | high — never `high`: a high-tier action is asked every time and can never be remembered) · `times_approved` · `times_denied` · `notes`.
**agent_budgets** — `agent` (pk, an id from `packages/config/src/agents.js`) · `tokens_daily` · `tokens_monthly` · `runs_daily` · `max_turns` · `active` · `note`. Ceilings only: usage is always computed live from `agent_runs`, never duplicated here.
**room_budgets** — `room` (pk) · `budget_gbp` · `period` (month | quarter | year) · `goal_metric` (a key from `core/goals.js` `METRICS`, or empty) · `goal_target` · `note`. A room without a venture (Forge, the Garage, Control) still has money to answer for.
`agent_runs` gains `heartbeat_at`, `current_activity` (a run says it is still alive; stale past the reap window is `stalled`, recovered atomically by `runs.reap()` — a conditional `PATCH … status=eq.running`, never read-then-write) and a reserved `checkpoint` jsonb column for the Orchestrator's tool loop, which does not exist yet. `system_events` gains `prev_hash`/`row_hash`: every `events.add()` call chains the row to the one before it (`packages/database/src/audit.js`); `verifyAuditChain()` walks the chain and names the first row it does not follow from. Resolving whether an agent may use a tool at all — the capability ceiling, an explicit deny, a remembered permission, the tool's own risk tier — is `packages/config/src/governance.js` `resolvePermission()`, fail-closed on anything it does not recognise.

### The Bridge aggregate
`packages/database/src/bridge.js` reads these tables plus draft counts, runs and events and arranges them: today (focus, P0/P1 not blocked, moves tagged now, due), waiting (drafts, blocked, review, verdicts without outcomes, stale P0s), active (runs, rooms with work), ventures (rank, allocation, open, top order), the Lab's summary, this month's money and today's protocol, the north star and every active goal as a target, projects with their computed health, open bottlenecks, the review cycle's state, every agent's derived status (roster counts, level, streak), the capital waterfall, and the audit chain's verdict. `api/bridge.js` serves it; `tools/brief.mjs` writes the brief from it.

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
`id` (`HER-R-YYYYMMDD-NNN` for HERALD, `CIP-R-…` for CIPHER) · `agent` · `skill` · `objective` · `status` (running | ok | failed | refused) · `model` · `input` (jsonb: the module and formats, or the watch's question and terms) · `sources[]` · `output` (jsonb: draft ids, refused and warnings, or the watch's items, summary and the pages it opened) · `usage` (jsonb: tokens, searches) · `error` · `device` (the sync code that asked) · `started_at` · `finished_at`.
Every agent that runs is recorded here, so THE RECORDS, THE CONTROL ROOM and each agent's own room read one list. CIPHER's run carries the watch itself in `output`: THE INTELLIGENCE reads the last one back rather than keeping its own copy.

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
