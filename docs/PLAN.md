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

## Next — the rooms in order

1. THE VAULT: money as a monthly ledger (revenue per venture per month, fixed costs, cash snapshots, the split) — tables, not one mutable number; runway from history; the journal link. `vigil.js` reads it.
2. THE RECORDS: runs, events, decisions with outcomes, the trace from the vault, lessons — one timeline with filters.
3. SANCTUM: `days` grows (energy, sleep, note), the protocol moves to a table, private entries (journal, principles, objectives) with the strongest boundary.
4. THE LAB: stock lines, COA state and dispatch on tables; VIGIL's stock signals read them.
5. THE TRADING FLOOR: `trades` (+ setups, check-ins) on tables; the journal's stats and VIGIL's drawdown signal read them.
6. THE CONTROL ROOM: `knowledge_sources`, `agent_runs`, `system_events`, `db-check` on the floor.
7. Agents beyond HERALD only where a workflow needs one: VECTOR proposing the ranking from the numbers is the first candidate.

## Day 1 · Thu 17 — Brain in Obsidian, HERALD in the hand

- Open `brain/` as a vault in Obsidian; confirm templates, daily notes, graph.
- Read the five drafts. Move one to `review`, kill one. Confirm status is the truth.
- `/herald` from Claude Code three times: a random set, `--lane sales` shorts, a named health subject (expect the gate to bite at least once).
- Tune `references/voice.md` against what Leo actually changes in the drafts.
- **Ship:** `git init`, first commit, private GitHub repo `the-arcane`.

## Day 2 · Fri 18 — The brief and the trace as daily habit

- `tools/brief.mjs`: assembles `03-Memory/Brief.md` from Shared-Memory, Signals, Orders, Doctrine (ARCANE's first script). Run it each morning.
- `tools/status-sweep.mjs`: moves draft files between `Drafts/Approved/Posted/Killed` to match their `status`; rolls counts into Shared-Memory.
- HERALD eval pass: run `evals/evals.json` prompts, review outputs, tighten SKILL.md.
- **Ship:** a morning: brief → `/herald` → review in Obsidian → sweep, without touching code.

## Day 3 · Sat 19 — Split the brain, wire sync

- `git subtree split` → private repo `arcane-brain`; `ARCANE_BRAIN` points at the clone.
- Obsidian Git plugin on desktop; `npm run brain:pull` / `brain:push` scripts for skill runs.
- `firebase/firestore.rules`: operator-only auth; collections `state`, `orders`, `presence`.
- `tools/memory-sync.mjs`: pushes Shared-Memory counts + open orders to Firestore (one-way, vault → cloud, for now).
- **Ship:** the brain lives on its own; a run on the laptop shows up in Firestore.

## Day 4 · Sun 20 — Facility shell

- `apps/facility`: Vite, vanilla ESM, 960×640 buffer, integer blit, FIT/2x/3x, drag-pan.
- `floorplan.js`: 20 room rects at v3 scale, doors, corridors, hall; BFS graph with a reachability test.
- Rooms render as wall/floor/door with the services layer and signs, from `@arcane/config` names.
- Deploy to Vercel (empty rooms, correct building).
- **Ship:** the building on a URL.

## Day 5 · Mon 21 — Sprites

- Author the 12×20 crew base (front/back/side × stand/A/B/work×2/talk) and ARCANE 14×24.
- Sprite baker: palette per agent from config; `tools/sprite-sheet.mjs` renders a review PNG.
- Crew placed at home stations, idle bob, ARCANE on the Bridge.
- **Ship:** nineteen distinct figures standing in the right rooms.

## Day 6 · Tue 22 — Movement and attention

- Attention score per room from orders (Firestore mirror, vault fallback). Sampling with home prior and cooldown.
- Walk cycles along the corridor graph; arrival → face anchor → `work` frames.
- Click a room → ARCANE walks there; door ping when a room's score rises.
- **Ship:** a floor that reflects `06-Orders`. Add an order, watch someone walk.

## Day 7 · Wed 23 — Props, light, wear

- 14–24 props per room from the anchor table in `docs/SPRITES.md`, three-tone with shadows.
- Light emitters (screens, cold store, Beacon lamp, Sanctum window). Seeded wear per room.
- Three ambient motions: Beacon lamp, Observatory stars, Lab frost.
- **Ship:** screenshots that beat v2's best.

## Day 8 · Thu 24 — Dashboards

- The four-section frame (State · Orders · Crew · Files) for all 20 rooms.
- Files section reads the room's brain folder (via a small JSON export of the vault, `tools/vault-export.mjs`, run on push).
- BEACON: draft queue with status chips reading real frontmatter. THE RECORDS: today's Trace. BRIDGE: the brief. THE CONTROL ROOM: the matrix from config.
- **Ship:** click BEACON, see today's drafts.

## Day 9 · Fri 25 — Counsel

- Vercel function `api/counsel`: Leo ↔ ARCANE over the brief, Claude behind `ANTHROPIC_API_KEY`, no tools, no writes. Answers or proposes an order.
- Counsel panel in the Bridge dashboard; proposed orders land in `06-Orders` as `review`.
- **Ship:** ask the network a question from the floor.

## Day 10 · Sat 26 — Council + hardening

- `api/council`: one structured call, nine positions, one verdict; writes a Decision record via the vault export path (or queues it for the next pull).
- CI: `npm test` + `vault-gen` dry-run diff on every push; refuse merge if the vault would change without a config change.
- Review the week: what HERALD produced, what posted, what the floor showed. Write the first Sunday review into `04-Records/Decisions`.
- **Ship:** v3.0 tagged.

## After

Second skill (ORACLE: PDF products from modules, or VIGIL: signals from
the ventures' data). Two-way Firestore ↔ vault. Mobile view. Sound.
