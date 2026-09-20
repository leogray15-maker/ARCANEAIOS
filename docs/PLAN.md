# Implementation plan — the first ten days

Foundations first, then the loop, then the floor. Every day ends with
`npm test` green and something visible in either Obsidian or the browser.
Dates assume a start of 2026-09-17.

## Done today (2026-09-16)

- [x] Monorepo skeleton, workspaces, scripts, gitignore, env example
- [x] `packages/config` — 19 agents, 20 rooms, 4 wings, grades, loop vocabulary, skill registry
- [x] `tools/validate-config.mjs` — refuses `allow`, any spend, Notion writes, skill over-reach
- [x] `brain/` — master router, doctrine, templates, memory, brief, orders, records, Obsidian config
- [x] `tools/vault-gen.mjs` — 45 generated cards, guarded, idempotent
- [x] HERALD — SKILL.md, six references, five templates, four scripts, 13/13 lint self-tests
- [x] Archives indexed: 43 subjects, 1,073 modules, 316 gated
- [x] First real run: `HER-R-20260916-001`, five drafts in `02-Content/Drafts`, traced

## Also done 2026-09-16 (evening) — the floor made real

- [x] Sprite system: composed identity (kit + item + palette), 3 facings × 3 cels, 171 validated frames
- [x] 50 prop painters, 267 placements across 20 rooms, door approaches proven clear
- [x] Static/live renderer at 30 fps, depth-sorted props and crew, emitters and ambient motion
- [x] Sim: ARCANE routes door-to-door on click, crew idle and drift, "Here now" in the dashboard
- [x] Deep links `?zoom=3&room=beacon`
- [x] Second pass: 16×20 crew / 20×26 ARCANE with 4-cel walk + blink, 72 painters, 366 placements, static props baked, floor/wall/fixture atmosphere, `/sheet.html` review page
- Pulled forward from Days 4–7. What remains of those days: work/talk cels, attention routing from orders, prop density pass (target 16–24), sprite-sheet review tool.

## Also done 2026-09-17 — the brain reaches the floor

- [x] Brief blocks are VENTURES / MONEY / GOALS / ROOMS (config, brain, HERALD)
- [x] `tools/vault-export.mjs` → `public/brain.json` at build: brief, orders, drafts, goals, trace, signals, decisions, Archives map, file index
- [x] Store ported (orders, stock, ledger, budget/split, goals, draft status, funnel, positions, log) with localStorage and a Supabase rung (`docs/SUPABASE.md`)
- [x] Attention routing: crew weigh rooms every 45–150 s at home / 8–20 s away; open orders pull (P0 hardest), home and the commander's room pull
- [x] Dashboards for all 20 rooms in the four-section frame; LAB, BEACON, BRIDGE, VAULT, LIBRARY, MARKET carry real widgets; every room has an editable orders board
- [x] The Lab and Beacon rebuilt to the reference images; lighting pass on all sprites; equipment labels at 2x+
- Remaining from the original days: Supabase Auth + write-back to the vault (day 3), Counsel/Council (days 9–10), Library/Bridge/Vault/Forge/Market to the references (next visual pass)

## Also done 2026-09-17 (evening) — the interface

- [x] Zoom fixed (HUD out of the captured stage), HiDPI backing store so 2x/3x are integer device scales; keys 0–4, wheel zoom about the cursor
- [x] Full-page dashboards for all 20 rooms in a two-column frame, hash-routed (`#room/<id>`), Esc/back; hover tooltip on the floor
- [x] One stylesheet (`src/ui.css`): 8px grid, five type sizes, hairlines
- [x] Trading Journal at `#journal`: trade log, Daily/Weekly/Monthly, Playbook, Psychology, equity + R distribution, JSON export/import; linked from THE VAULT and THE RECORDS
- [x] Thin rooms made real: watchlist (Intelligence), pipeline (Deal Room), idea queue with verdicts (Inventor), next three moves (War Room), stop-doing (Lounge), daily protocol with streaks (Sanctum)
- [x] Brain Graph at `#graph` is the Obsidian vault itself: 1,663 notes and 1,724 links laid out at export (`npm run vault:graph`), grouped by folder, hub flowers and a dust ring, rooms anchored to their brain folders, agents orbiting live; click a note to open it in Obsidian
- [x] The v3 brain is inside the vault by symlink (`ARCANE-AI-OS-v3`); drafts link to their Archives page via `source_note`
- [x] HERALD on Obsidian: the index reads the vault's Archives notes, an Allowed/Never gate in `05-Knowledge/Archives-Sources.md`, copy-first into `02-Content/Sources/`, a daemon (`herald:auto`) that writes through the Claude API with a launchd schedule, `vault:sync` for the site's decisions, `Board.md` and the CONTENT view (`docs/HERALD-AUTO.md`)
- [x] The floor spread: staggered rooms, door passages, an atrium with a plaza; THE TRADING FLOOR annex below COMMAND opens the Journal
- [x] No sign-in: per-device sync codes (`supabase/migrations/0002_sync_codes.sql`); the bottom strip with live London time, sessions, weather, gold and OS numbers
- [x] Supabase wired: migration `supabase/migrations/0001_arcane_state.sql`, magic-link sign-in in the bar, the store syncs the operator's own row and polls every 30 s (`docs/SUPABASE.md`)

## Also done 2026-09-17 (night) — the loop closes

- [x] Counsel on the Bridge (`api/counsel`) and the Council in its chamber (`api/council`): Claude behind `ANTHROPIC_API_KEY` on Vercel, gated on a known sync code, structured outputs, proposed orders land on the room's board, decisions get an outcome later
- [x] VIGIL's signals are computed, not typed (`core/vigil.js`): stock, COA, the draft queue, stale P0s, the split, journal drawdown and rule breaks, the protocol — on the Observatory, counted in the bar, written to `Signals.md`
- [x] ARCANE writes the brief (`npm run brief`, `tools/brief.mjs`) from the config, the vault and the floor's folded state; `Brief.md` is generated; the HERALD daemon writes it after every run
- [x] `vault:sync` folds every device's row and lands orders, lists, protocol, trades, decisions and counsel in their record files, then writes the brief
- [x] CI on every push (`.github/workflows/ci.yml`): rules, lint, fold and signals, no card drift, the build, no service key in the bundle
- [x] Work and talk cels; the Forge, Market and Library dressed to their references
- Still for Leo: run migration 0002, top up Anthropic credits, `ANTHROPIC_API_KEY` on Vercel, `SUPABASE_SERVICE_ROLE_KEY` in `.env`, install the HERALD schedule — all listed as open orders in `06-Orders/Orders.md`

## Also done 2026-09-18 — the Content Machine

The first thing built after the floor: the loop Leo runs every day.
Library → module → HERALD → BEACON → approve, with the database as the
runtime truth and the vault as the record. `docs/CONTENT-MACHINE.md`,
`docs/DATA-MODEL.md`.

- [x] `supabase/migrations/0003_content_machine.sql`: `archive_modules` (+ full-text search, `archive_subjects` view), `knowledge_sources`, `content_drafts`, `content_revisions`, `agent_runs`, `system_events`; RLS on, service role only
- [x] `packages/database`: PostgREST client with errors that name their migration; the verbs (modules, drafts, revisions, runs, events); an in-memory twin for tests; the dev database (real index + `data/dev-db.json`)
- [x] `packages/content-engine`: HERALD's one engine — prompt, schema, `writeDrafts`, staging in the lint's contract, the gate, one repair, landing with provenance and a run; `herald:auto` and `emit.mjs` use it, so the terminal and the floor write with one voice
- [x] `api/`: the operator gate (`ARCANE_OPERATOR_KEY`, bearer, constant-time, fails closed) on every route including Counsel and the Council; `modules`, `herald` (300 s), `drafts` (moves along `DRAFT_TRANSITIONS`, edits linted), `runs`
- [x] THE LIBRARY as an application: subjects, full-text search, the gate as a filter, the module with its text and provenance, Generate content, what has been cut from it
- [x] BEACON as an application: Drafts · Approved · Scheduled · Published · Rejected; the workspace — editor (linted on save), moves, schedule with a date, publish with a URL, reject with a reason, regenerate, alternate take, copy, restore any revision, the history
- [x] `DRAFT_TRANSITIONS` / `DRAFT_VIEWS` in config, proven closed by `npm run check`
- [x] `tools/archives-sync.mjs` (index → database, by content hash), `tools/db-check.mjs`, `tools/dev-api.mjs` (+ Vite proxy; `npm run dev`, `npm run dev:local`), `tools/lib/content-mirror.mjs` (database → vault, vault → database), `vault:sync` mirrors drafts
- [x] `tools/content-machine.test.mjs` in `npm test`: the gate, the engine, the status machine, edits, regenerate, the record — 35 checks, no network
- [x] The whole loop walked in a headless browser on the dev database: key prompt → browse → search → module → generate → draft → edit (saved as a revision) → an edit naming a dose refused → approve → reload persists → the queue → reject with a note → regenerate with a parent
- [x] The CONTENT view is gone; the top bar reads LIBRARY · BEACON; the bar's "drafts waiting" comes from the database
- [x] The frontmatter reader now reads JSON-quoted scalars back exactly (a hook with an inner quote used to fail its own lint)
- Still for Leo, in order (also open orders in `06-Orders/Orders.md`): run `0002` and `0003` in the SQL editor; put `SUPABASE_SERVICE_ROLE_KEY` and a fresh `ARCANE_OPERATOR_KEY` in `.env` and the Vercel project; `npm run archives:sync`; top up Anthropic credits and set `ANTHROPIC_API_KEY` on Vercel; `npm run vault:sync` once to import the five drafts from 2026-09-16; delete `arcaneaios-firebase-adminsdk-*.json` from the repo folder (untracked, but it should not be there)
- Not verified here, because it cannot be from this machine: the SQL against a live Postgres (no psql/Docker; migration was written to PostgREST's documented behaviour and the client to its filter grammar) and live Claude generation (no credits). Everything else above ran.

## Also done 2026-09-18 (evening) — the command rooms on real state

The floor's operating state moved out of the per-device JSON blob into
tables, and the first two command rooms were built on them.

- [x] `supabase/migrations/0004_operating_state.sql`: `orders`, `list_items`, `decisions`, `counsel_turns`, `venture_focus`, `goal_progress`, `days`; RLS on, service role only
- [x] `packages/database/src/state.js`: one registry (columns, validators, defaults, id minting) and the verbs; `api/state.js` the gateway; every change a system event; orders are never deleted
- [x] `packages/database/src/bridge.js`: the aggregate — today · waiting · active · ventures — served by `api/bridge.js` and written into the brief by `tools/brief.mjs`
- [x] The store's server rung: orders, lists, decisions, counsel, focus, goal progress and the day are cached from `/api/state`; a change applies at once and goes up; a refusal reloads and the bar says why; read-only without the operator key; this device's blob is imported once
- [x] BRIDGE as an application: the day's focus line; P0/P1 across the floor with done/block/kill; due orders; moves tagged now; waiting on you (drafts, approved, verdicts without outcomes, blocked, review, stale P0s, outcomes recorded inline); runs and rooms with work; Counsel persisted; doctrine; ventures with their rank and allocation; VIGIL; goals with typed progress; the record
- [x] THE WAR ROOM as an application: the next three moves (now/next/later, reorder, edit, done with an outcome, reopen), the venture ranking (rank, push/maintain/starve, one line of why), stop doing, where the work is, verdicts
- [x] Every orders board can block (with a reason), unblock and kill; brain-seeded rows become real rows the first time they are touched; "Blocked on: #5" resolves against the vault's closed rows
- [x] Counsel and the Council go through the API client (the operator key travels with them) and Counsel is told today's focus, the ranking, the moves and the stop list
- [x] `vault:sync` mirrors the tables: Orders.md rebuilt by number (and new rows typed in Obsidian imported first), `05-Knowledge/Lists.md`, `Focus.md`, `04-Records/Decisions/`, `Decision-Log.md`, `Counsel.md`
- [x] `tools/operating-state.test.mjs` (43 checks) in `npm test`; the Bridge and the War Room walked in headless Chromium on the dev database
- Still for Leo: run `0004` (order #17), then set the ranking and the day's focus (#18) — plus everything from the morning (#11–#16)

## Also done 2026-09-19 — THE LAB on the real catalogue

Leo brought the supplier sheet (per 10-vial kit, USD) and his store prices (per vial, GBP), then his own margin sheet at 0.746 £/$. THE LAB was next in his list, so it went ahead of the Vault.

- [x] `supabase/migrations/0005_lab.sql`: `products`, `stock_lots`, `dispatch`, `settings`; the registry entries, defaults and refusals (products retire, dispatch cancels, nothing deletes)
- [x] `data/peptides/catalog.json` (local, gitignored): 138 lines — 64 on the store (51 costed, 13 with no supplier match), 74 supplier-only — matched by size to the store's "from" price, with the margin sheet's doubts carried as notes; `tools/products-import.mjs` lands it once and keeps what Leo has since typed
- [x] `apps/facility/src/core/lab.js`: landed cost per vial, margin, markup, stock and COA from lots, the summary — one module for the floor, the Bridge aggregate, the brief and the vault mirror
- [x] THE LAB as an application: the catalogue with cost, price, margin, stock and COA; the rate, landed overhead and low-stock line typed at the top; a product's figures and lots (stock in, count, COA state and link); the dispatch queue packing → ready → shipped
- [x] VIGIL's stock and COA signals read the lots; the Bridge's Peptides card and the brief's Peptides line read the summary; the Market shows the queue; `05-Knowledge/Lab.md` mirrored by `vault:sync`
- [x] The placeholder inventory and dispatch rows are gone from `roomdata.js`; the blob's `stock` key is left behind
- [x] 14 more checks in `tools/operating-state.test.mjs`; the Lab walked in headless Chromium: rate change recomputes margins, a lot in, COA published, counted down, price changed, dispatch through to shipped, VIGIL and the Bridge picked it up
- Still for Leo: run `0005` (order #19) and `npm run products:import` (#20); 0002 is confirmed applied (it is the only table in the dashboard), 0003 and 0004 are not

## Also done 2026-09-19 (later) — every room on tables

"Let's get the whole ARCANE OS working." The last of the blob went, and the rooms that were shells or widgets over it became applications on tables.

- [x] `0006_vault.sql` (`ledger_months`, `fixed_costs`, `cash_snapshots`, `pots`), `0007_sanctum.sql` (`protocol_items`, `protocol_ticks`, `entries`), `0008_trading.sql` (`trades`, `setups`, `checkins`); registry entries with their validators and defaults; the dev database seeds what the migrations seed
- [x] `core/money.js`: revenue by venture per month (units × price or typed £), fixed, the latest cash snapshot, runway, the split, history — one module for the Vault, the aggregate, the brief and the mirror
- [x] THE VAULT as an application: a month at a time, revenue by venture, fixed costs (add, edit, retire), cash snapshots, the split with amounts and the not-100 flag, history, the Lab's stock value, the Journal link
- [x] SANCTUM as an application: energy, sleep, focus (shared with the Bridge), a note on the day; the protocol as editable items with ticks, streaks, weekly counts and the last seven days; journal, reflections, principles, objectives, life decisions — private, never mirrored
- [x] THE RECORDS as an application: the timeline of every system event (search, filter by kind, links), runs with tokens and durations, decisions with outcomes, lessons (a list, tagged to a venture), the vault's trace and the floor log
- [x] THE CONTROL ROOM as an application on `api/health`: which keys the server holds, whether the database answers and which it is, every table with its migration and whether it exists, the sources' sync state, the last runs, the permission matrix
- [x] THE TRADING FLOOR's journal on `trades`, `setups`, `checkins` (the UI unchanged; `saveTrade` and friends write through the store); THE MARKET and VITALS write the ledger rows the Vault reads; FORGE's widget is its orders board; SCRIPTORIUM's manuscripts are a list; the placeholder rows in `roomdata.js` are gone
- [x] VIGIL reads the pots, the ledger, the cash snapshots, the ticks and the trades; Counsel is told this month's money, the Peptides funnel and the protocol; the brief's MONEY block and the goals read the aggregate
- [x] `vault:sync` mirrors the protocol (`04-Records/Protocol.md`), the journal (`04-Records/Journal/`), money (`05-Knowledge/Money.md`) from the tables; Sanctum's entries are never written to the brain
- [x] 14 more checks in `tools/operating-state.test.mjs` (71); the Vault, Sanctum, the Journal, the Records and the Control Room walked in headless Chromium with no page errors
- Still for Leo: run `0005`–`0008` (orders #19, #21), `npm run products:import` (#20), then type this month's figures in THE VAULT (#22) and tick the protocol

## Also done 2026-09-19 (evening) — the merge repaired, and the watch made real

A cloud session's PR (Notion as an Archives source; CIPHER reading the open web) merged into main while the state layer was landing. The merge left six files with conflict markers committed, `npm test` red, `/api/intel` importing a `knownDevice` gate that no longer exists, and THE INTELLIGENCE calling `store.intel()` against a store that no longer had it.

- [x] Resolved the six conflicts by union where both sides were true (`.gitignore`, `.env.example`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, and two generated brain cards regenerated)
- [x] `api/intel.js` ported to the operator gate, and its run recorded in `agent_runs` (`CIP-R-…`) like HERALD's — status, model, terms, items, the pages it opened, tokens and searches; a failure is recorded as failed with its reason
- [x] The watchlist is read server-side from `list_items`, not from the caller's copy: one source of truth, and the client cannot widen what CIPHER researches
- [x] THE INTELLIGENCE is an application (`#intel`, key `i`): the watchlist, run the watch or ask it one question, the items with kind, source and confidence, *take it* to turn a proposal into an order, the run history — and the same runs appear in THE RECORDS and THE CONTROL ROOM
- [x] `tools/api.test.mjs` rewritten for the operator gate: every endpoint (counsel, council, intel, herald, state, bridge, drafts, modules, runs, health) refuses without the key, with the wrong key, on the wrong method, and before reaching the model or the database; health never leaks a key's value; a prefix of the key is not the key
- [x] Kept the PR's good work as it stands: the Notion indexer and its stub tests, `docs/ARCHIVES.md`, the archives fixture test
- [x] `npm test` green again (the suite now also runs the archives and API-gate tests); the room walked in headless Chromium — a run with no credits fails visibly and lands as a failed run in all three rooms

## Also done 2026-09-20 — the operating loop, made real

Audit first (`ARCANE_IMPLEMENTATION_AUDIT.md`), which found the live
database further along than the docs said: migrations 0003–0008 applied,
1,342 modules and 138 products imported; only the API credits missing.
Then, in order, each committed on its own:

- **The machine says what is wrong with it.** `packages/database/src/readiness.js` judges the tables (migrations by table *and by column*, the imports, stock, the model by its last real run) and the bar and THE CONTROL ROOM show the verdict.
- **A refused write keeps the operator's intent** and offers a retry in the bar.
- **`proposed` is an order state** (0009): an agent proposes, the operator approves; `source` / `source_id` on every order say what caused it.
- **Signals are addressable, evidenced and answerable**, computed by the same rules on the floor and the server; a signal is answered by work that names it.
- **The sale draws from its lot** (0010): dispatch lines close supplier → lot → cost → product → sale → revenue → realised margin; THE LAB shows what was actually made, THE VAULT shows realised profit beside typed revenue.
- **TALLY, MERIDIAN and VECTOR** run on the one agent contract (`api/_agent.js`), read deterministic evidence, record every run, and propose; a dry reading works without the model.
- **The Bridge is the decision surface**: the machine's blockers, then proposals, then signals that become work. THE RECORDS says what a run caused.
- **Every number in the Vault shows its working.**
- **Devices keep up** by asking for the stamp of the last change and re-reading only when it moves.

`ARCANE_IMPLEMENTATION_REPORT.md` is the account.

## The operating-system pass (2026-09-20, evening) — plan

The brief: turn the facility into one interconnected operating system —
goals → targets → ventures → projects → tasks → agents → outputs → money →
decisions → reviews → lessons → new goals. The audit before this pass found
the seams already present (the registry, the agent contract, `proposed`
orders, signals with evidence, the Bridge aggregate) and the objects missing
(goals with a hierarchy, projects, reviews, capital rules, bottlenecks,
richer decisions). Built in this order, each step tested and committed:

1. **Foundation** — migration `0011_command.sql` (goals, projects, reviews,
   bottlenecks, capital_rules, capital_allocations; `orders` gain
   project_id, goal_id, estimate_h, actual_h, depends_on, recurrence;
   `decisions` gain options, evidence, assumptions, risks, impact, owner,
   review_on, retro; `list_items` gain value_gbp, due, note). Registry
   entries, config vocabulary, the pure modules (`core/goals.js`,
   `core/projects.js`, `core/capital.js`), store methods, the aggregate.
2. **Command** — NORTH STAR (`#goals`, the hierarchy 10y → day, click
   through), TARGETS (`#targets`, target / actual / variance / % / time
   left / trend, actuals bound to the tables), MISSION CONTROL
   (`#projects`, health computed), THE TASK ENGINE (`#tasks`, every order
   with project, goal, estimate, dependency, recurrence, orphan flag).
3. **Ops and reviews** — DAILY OPS (`#ops`: the three, P0/P1, habits,
   deep work, waiting, agent work, shutdown → daily review), THE REVIEW
   ROOM (`#review`: day / week / month / quarter, prefilled from the
   state, kept in `reviews`, shown in THE RECORDS).
4. **Money** — CAPITAL PLAN (`#capital`: the waterfall, rules, this
   month's proposed allocation, confirm → history, cumulative); the Vault
   gains COGS, gross, tax reserve, deployable capital, a forecast and a
   history chart.
5. **Agents** — AGENT HQ (`#agents`, `#agents/<id>`: status derived from
   runs and orders, queue, permissions, outputs, tokens, approval rate,
   audit); THE ORCHESTRATOR (`/api/orchestrate`: a question → the readers
   that apply → evidence → a Council question, proposed, never run).
6. **Intelligence** — THE DECISION ROOM (`#decisions`), BOTTLENECKS,
   venture pages (`#venture/<id>`), quick capture (parse → confirm), the
   palette's actions, global search (`/api/search`).
7. Docs, the navigator's groups, the report.

Decisions taken in this pass (revisit only if Leo objects): the floor stays
the home screen and the Bridge is the Scoreboard (`#scoreboard` is an
alias); new rooms are applications reachable from the navigator and from
their parent room, not new floor geometry; orders remain the task engine
in the config's vocabulary; an orphan task is flagged, never refused; the
`goals` table is the truth and `05-Knowledge/Goals.md` becomes a generated
mirror, as Orders.md did; nothing here moves money or executes a trade.

## Next

1. Run 0009 and 0010 against the live database, then deploy — in that order (the deployed code writes the new columns).
2. Fund the Anthropic API account; then the readers, CIPHER, HERALD and the Council all work as tested.
3. Book real stock into THE LAB and record dispatch lines: from then on the margin is realised, cover is measurable, and MERIDIAN has a chain to read.
4. A reorder point per product from measured cover (MERIDIAN's `reorder` output, once there is a rate), and a `stock.cover` signal that proposes it.
5. Supabase Realtime Broadcast (no table policies: the API publishes "something changed", devices subscribe with the anon key) if the 15-second stamp proves too slow with two devices in use.
6. A Notion API source for `archives:sync` on an Edge Function schedule.
7. Retire the per-device `drafts` overlay in the store's blob (BEACON reads the server; VIGIL's content rules now read counts) — the last duplicate-truth risk from the audit.
