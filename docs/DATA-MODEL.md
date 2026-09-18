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
| **Working set (not yet on tables)** | Stock, ledger, protocol, the journal | `arcane_sync` (one JSON row per device) | the facility store |

The operating state used to ride in `arcane_sync` too. It moved to
tables (`0004_operating_state.sql`) because two devices could not agree
on a JSON blob, and because the Bridge has to aggregate it. What is left
in the blob — stock, the ledger, the protocol, the journal — moves the
same way when its room is built (THE VAULT, THE LAB, SANCTUM, THE
TRADING FLOOR). `tools/lib/state.mjs` still folds the blob for those.

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

### The Bridge aggregate
`packages/database/src/bridge.js` reads these tables plus draft counts, runs and events and arranges them: today (focus, P0/P1 not blocked, moves tagged now, due), waiting (drafts, blocked, review, verdicts without outcomes, stale P0s), active (runs, rooms with work), ventures (rank, allocation, open, top order). `api/bridge.js` serves it; `tools/brief.mjs` writes the brief from it.

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
