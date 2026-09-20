---
type: knowledge
created: 2026-09-20 12:40
updated: 2026-09-20 12:40
status: active
generated: false
agent: ARCANE
tags: [knowledge, facility, build]
---

# The Build — everything THE ARCANE is, room by room

Hand-kept. This is the read-through: what exists, what each part is for,
what it writes, and where the seams are if you want to build on top of it.
The generated cards ([[Facility]], [[Ventures]], the agent cards in
`01-System/`) stay the source of truth for the roster and the geometry;
this note is the picture they do not give you.

---

## 1. What it is

An operating system for four ventures, rendered as a facility you can walk.
Twenty-one rooms in four wings, nineteen agents, one operator, one brain.

- **Arcane Peptides** — research compounds, per order. [[THE LAB]].
- **The Arcane Archives** — £128 / month, 3,300+ modules. [[THE LIBRARY]].
- **Arcane Track** — £11.99 / month, skin healing. [[VITALS]].
- **The Codex** — books and masterclasses, one-off. [[SCRIPTORIUM]].
- **Trading** — XAUUSD, the operator's own desk. [[THE TRADING FLOOR]].

The floor is not decoration. Crew walk toward rooms with open orders, P0
pulls hardest, so the building is a picture of where the work is. But
every room is also an application: you type into it and the number changes
everywhere the number appears.

## 2. The spine — how a fact moves

    packages/config  →  Postgres (Supabase)  →  /api/*  →  the store  →  a room
                                     ↓
                            npm run vault:sync  →  brain/  (Obsidian)

1. **`packages/config/src/`** is the single source of truth for *meaning*:
   the nineteen agents, the twenty-one rooms, the four wings, the ventures,
   the capability grades, the draft vocabulary, the Council seats, the six
   standing rules. Nothing else defines those. `npm run check` enforces them.
2. **Postgres** holds *state* — every row a room writes. Row-level security
   is on with no anonymous policies: the browser can never reach the database.
3. **`/api/*`** is the only door. Twelve functions, each behind an operator
   key (a bearer token, constant-time compare, fails closed).
4. **The store** (`apps/facility/src/core/store.js`) is the browser's cache
   over those tables. A change shows instantly, goes up, and if the server
   refuses it the store reloads and the bar says why.
5. **The brain** is the mirror and the record. `npm run vault:sync` writes
   the tables back into Obsidian as Markdown; `npm run brief` writes the
   four-block brief from the same aggregate the Bridge reads.

Two things follow from that shape. First, the floor never lies about
persistence: if the key is missing, every room goes read-only and says so.
Second, anything a room knows, the brain and the brief know too, without
a second implementation.

## 3. The frame around the rooms

- **The bar.** Brief date, open orders, drafts waiting, signals, crew away —
  each a link. The dot is the server rung: green = state on the server,
  amber = read-only, red = the last write was refused and why. DEVICE holds
  this browser's sync code and the operator key.
- **The floor.** Click a room to open it. Hover for its open orders and who
  is there. Keys: `b` Bridge, `w` War Room, `l` Library, `n` Beacon, `p` Lab,
  `v` Vault, `s` Sanctum, `r` Records, `j` Journal, `i` Intelligence,
  `c` Control, `0–4` zoom, `Esc` back.
- **The navigator.** `≡`, `Cmd-K`, or `g` — every room and view, searchable,
  with what is waiting in each. This is the reliable way in on a phone.
- **The strip.** London time, the three sessions lit when open, XAUUSD, the
  weather, the day's counts.
- **The Brain Graph.** The Obsidian vault as a graph, rooms anchored to
  their folders, agents orbiting. Click a note to open it in Obsidian.
- **The phone.** Everything above works at 390px: bottom tabs, pinch zoom
  on the floor, tables that scroll themselves, no control under 16px.

## 4. The rooms

### C2 · COMMAND

**BRIDGE** · `#bridge` · ARCANE — *the one screen*
Today's focus (one line, kept per day), every P0/P1 across the floor with
done / block / kill, overdue orders, the moves tagged *now*. **Waiting on
you**: drafts waiting, blocked orders with their reason, orders in review,
Council verdicts with no outcome, P0s open more than two days. **Active**:
agent runs in the last two days, rooms with open work. **Counsel**: Leo ↔
ARCANE, answering from the brief, the numbers, the ranking and the moves;
it may propose one order, which you add with a click. Right rail: doctrine,
the four ventures in rank order, VIGIL's signals, goals, the last events.

**THE WAR ROOM** · `#warroom` · VECTOR — *what gets the next hour*
The next three moves (now / next / later — more than three *now* and the
room says so), the venture ranking with push / maintain / starve and one
line of why, the stop-doing list, where the work is by room, the last
verdicts.

**THE COUNCIL** — *a decision put to nine seats*
One line in, one structured call out: nine positions each from its own
domain, disagreement recorded not smoothed over, then BUILD / DELAY /
WATCH / KILL with the conditions that must be true first. Seats by weight:
ARCANE 0, TALLY 1, VECTOR 2, WARDEN 2, MERIDIAN 3, HERALD 4, CIPHER 4,
ANVIL 5, KEEPER 9. The verdict lands in `decisions`; the outcome is
recorded later, here or on the Bridge.

**THE VAULT** · `#vault` · TALLY — *the treasury with a history*
One month at a time. Revenue by venture (members or orders × price, or a
typed figure), fixed costs as a living list, cash as dated snapshots,
runway as cash over the monthly shortfall, the split into pots flagged when
it is not 100%, the history of every month typed, and the Lab's stock value
at cost and at price. Empty means not typed, never zero.

**SCRIPTORIUM** · SCRIBE — *the Codex*
Manuscripts as a list: idea → drafting → proofing → live. Sales are typed
in the Vault as the Codex's units.

**THE TRADING FLOOR** · `#journal` — *the operator's own desk*
Every trade a row: instrument, direction, session, killzone, setup from the
playbook, entry/stop/target/exit, risk, grade, conviction, Before / During /
After, emotions, energy, sleep, stress, rule breaks, chart link. Daily,
weekly and monthly reviews; the playbook of setups; psychology check-ins;
equity curve and R distribution; JSON export. VIGIL reads it for drawdown,
three losses in a row, rule breaks and plan-followed rate.

### C1 · PRODUCTION

**THE LAB** · `#lab` · MERIDIAN — *Peptides as operations*
The catalogue in four views: ON THE STORE (64 lines) · EVERY LINE (the
supplier's whole sheet, 138) · IN STOCK · DISPATCH. Each line carries the
supplier code, the kit cost in dollars, the landed cost per vial in pounds,
your price, and profit and margin per vial — red under 60%, amber under
75%. The USD rate, the landed overhead and the low-stock line are typed at
the top and every margin recomputes. A `?` chip carries the doubt from the
margin sheet. A product opens to its figures and its lots: stock in with a
batch, a count and a COA state; count vials up and down; publish the COA.
Dispatch runs packing → ready → shipped → delivered. VIGIL raises a breach
for any line in stock without a published COA.

**VITALS** · LUMEN — *Arcane Track*
Members, visitors and sign-ups typed into Track's ledger row; revenue at
£11.99 follows. The app is not wired in; health data never comes here.

**FORGE** · ANVIL — *building*
The build queue is this room's orders board: migrations, keys, deploys,
repairs. Every P0 and P1 of them shows on the Bridge.

**THE MARKET** · ABACUS — *the shop front*
Visitors → leads → orders → revenue for Peptides, typed into the same
ledger row the Vault shows, with the conversion rates, plus the dispatch
queue.

**BEACON** · `#beacon` · HERALD — *what we are saying*
The draft queue: DRAFTS · APPROVED · SCHEDULED · PUBLISHED · REJECTED, with
search across hooks, titles and sources. Open a draft and you get the body
in an editor whose Save runs the same compliance gate HERALD passed — a
dose, a compound, a claim or a wrong shape is refused with the reason.
Moves are only the ones the config allows. Regenerate (same module, same
format) and Alternate take (told to find a different line) make new drafts
that point back. Every revision is kept and restorable; provenance links
back to the module it was cut from.

### C3 · KNOWLEDGE

**THE LIBRARY** · `#library` · ORACLE — *what we know*
The Archives indexed from Obsidian or straight from Notion, then synced
into the database. Subjects on the left with their gate — green Allowed,
grey on request, red never. Full-text search across titles, subjects and
the text of every module. Open a module for its full text, its provenance,
what has already been cut from it, and **Generate content**: tick the
formats, add a note, and HERALD writes. Read-only: nothing is ever written
back into the Archives.

**THE INTELLIGENCE** · `#intel` · CIPHER — *what the world did*
The watchlist is yours; CIPHER researches only what is on it. Run the watch
or ask one question and it reads the open web through Anthropic's search
tool, then reports up to eight items: kind, headline, what it means for a
venture by name, the entry it came from, the source, and how firm it is —
confirmed, reported or rumour. An item may carry one proposal, the smallest
next action routed to a room; it becomes an order only when you press
*take it*. The only outward-facing call in the system.

**THE OBSERVATORY** · VIGIL — *what changed while nobody looked*
Signals computed from state, now: the brief's age, low stock, missing COAs,
the draft queue, nothing posted, stale P0s, a split that is not 100%,
journal drawdown and rule breaks, the protocol. Each names the room it
belongs to and what clears it.

**THE DEAL ROOM** · ENVOY — *leads and partners*
A pipeline list: lead → contacted → meeting → proposal → won / lost. No CRM
is wired; ENVOY sends nothing.

**THE LOUNGE** · EMBER — *downtime, and noticing there has not been any*
Minutes in the building this session, red past ninety, and the stop-doing
list.

### C4 · NETWORK & LIFE

**THE AGENT GARAGE** · FOUNDRY — *the roster*
Every agent's card: role, call sign, room, brief, Council seat. Read-only —
agents are defined in `packages/config/src/agents.js`. (And the purple
Vanquish, which is not defined anywhere but the paint.)

**THE CONTROL ROOM** · `#control` · WARDEN — *the machine's own state*
Which keys the server holds (never their values), whether the database
answers and which one it is, every table the code expects with its
migration and whether it exists — the missing ones name the file to run —
the knowledge sources' sync state, the last agent runs, and the permission
matrix.

**THE INVENTOR'S ROOM** · SPARK — *the idea queue*
Ideas tagged BUILD / WATCH / KILL, and the count in the brain's inbox.
SPARK's evaluation is not wired; the tags are yours.

**THE RECORDS** · `#records` · RELIC — *append-only memory*
TIMELINE (every system event, newest first, by day, searchable, each
linking where it happened) · RUNS (every agent run with status, objective,
model, tokens, duration) · DECISIONS (verdicts and outcomes) · LESSONS (one
line each, tagged to a venture, retired when no longer true) · TRACE.

**SANCTUM** · `#sanctum` · KEEPER — *the operator*
Energy, sleep, the day's focus and a note on the day. The protocol as items
you edit with daily ticks, streaks and the last seven days as cells. The
week's energy and sleep. Then five kinds of entry — journal, reflections,
principles, objectives, life decisions — written, edited, dropped, never
deleted. Private: entries are never mirrored into the brain.

## 5. The nineteen

Live today: **ARCANE** (Counsel on the Bridge), the **nine Council seats**
speaking in one structured session, **HERALD** (the Content Machine),
**CIPHER** (the watch), **VIGIL** (signals, computed rather than called).
The other twelve are cards with a room, a brief and a grade — the scaffolding
is there (`agent_runs`, the permission matrix, the skills registry) but they
do not run yet. That is the next frontier, and the cheapest one: an agent is
a prompt, a skill entry in `packages/config/src/skills.js`, and an endpoint.

| Agent | Role | Room |
| --- | --- | --- |
| ARCANE | Commander | BRIDGE |
| VECTOR | Strategist | THE WAR ROOM |
| TALLY | Treasurer | THE VAULT |
| MERIDIAN | Quartermaster | THE LAB |
| LUMEN | Physician | VITALS |
| ANVIL | Engineer | FORGE |
| ABACUS | Commerce | THE MARKET |
| HERALD | Signalman | BEACON |
| SCRIBE | Scrivener | SCRIPTORIUM |
| ORACLE | Archivist | THE LIBRARY |
| CIPHER | Intelligence | THE INTELLIGENCE |
| VIGIL | Observer | THE OBSERVATORY |
| ENVOY | Deals | THE DEAL ROOM |
| EMBER | Steward | THE LOUNGE |
| FOUNDRY | Agent-wright | THE AGENT GARAGE |
| WARDEN | Risk & Control | THE CONTROL ROOM |
| SPARK | Inventor | THE INVENTOR'S ROOM |
| RELIC | Records | THE RECORDS |
| KEEPER | Steward | SANCTUM |

## 6. The Content Machine, end to end

    Obsidian or Notion  →  herald:index  →  archives:sync  →  archive_modules
      →  THE LIBRARY (search, pick a module, pick formats)
      →  /api/herald  →  HERALD writes  →  the compliance gate
      →  content_drafts  →  BEACON (edit, approve, schedule, publish)
      →  content_revisions + agent_runs  →  vault:sync  →  02-Content/

The gate is the part that matters: no dose, no compound claim, no medical
language, and a shape check per format. It runs when HERALD writes *and*
again on every hand edit, so a draft cannot be edited past it. Refused
lines are named with the reason rather than silently dropped. Nothing
publishes unattended — a human moves every status.

## 7. The data model

| Migration | Tables | What they hold |
| --- | --- | --- |
| 0001–0002 | `arcane_state`, `arcane_sync` | The device blob: crew positions and the floor log. All that is left of it. |
| 0003 | `knowledge_sources`, `archive_modules`, `content_drafts`, `content_revisions`, `agent_runs`, `system_events` | The Content Machine and the record of every run and every change. |
| 0004 | `orders`, `list_items`, `decisions`, `counsel_turns`, `venture_focus`, `goal_progress`, `days` | The operating state: work, lists, verdicts, the ranking, the day. |
| 0005 | `settings`, `products`, `stock_lots`, `dispatch` | The Lab. |
| 0006 | `ledger_months`, `fixed_costs`, `cash_snapshots`, `pots` | The Vault. |
| 0007 | `protocol_items`, `protocol_ticks`, `entries` | Sanctum. |
| 0008 | `trades`, `setups`, `checkins` | The Trading Floor. |

Every write emits a `system_events` row, which is why THE RECORDS can show
a timeline nobody had to write by hand. Lists are one table with a `list`
column: moves, stop, watch, pipeline, ideas, lessons, manuscripts — which
is why a new list is a one-line change, not a migration.

## 8. The API

`/api/state` (the gateway to every operating table) · `/api/bridge` (one
aggregate for the Bridge and the brief) · `/api/modules` · `/api/herald` ·
`/api/drafts` · `/api/runs` · `/api/counsel` · `/api/council` · `/api/intel`
· `/api/health`. Each carries the operator key. The model calls share one
failure translator, so an unfunded key, an invalid key, a rate limit and an
overloaded model each say their own thing.

## 9. The six standing rules

1. No agent holds `allow` on any capability. Nothing executes unattended.
2. No agent spends money — `spend` is deny for the whole network, commander
   included. Money moves by the operator's hand.
3. Notion is read-only. The Archives are a source, never a target.
4. No medical, dosing or treatment claim, to anyone.
5. Nothing publishes unattended.
6. Every run writes a Trace entry before it reports success.

These are enforced in `tools/validate-config.mjs`, not just written down.
`npm run check` fails the build if one is broken.

## 10. The commands

    npm run dev            the facility with the API — the production loop on a laptop
    npm run dev:local      the same on the dev database with the mock writer, no keys
    npm run check          validate the config against the standing rules
    npm test               check + the gate, the engine, the state, the floor
    npm run brief          write 03-Memory/Brief.md and VIGIL's signals
    npm run vault:sync     bring the floor's state into the brain, then the brief
    npm run vault:write    regenerate the brain's generated cards
    npm run herald:index   index the Archives export
    npm run archives:sync  put the index into the database
    npm run products:import  put the Peptides catalogue into the database
    npm run db:check       which migrations the database has had

## 11. What is real, and what is waiting

Real and on tables: the Bridge, the War Room, the Vault, the Lab, Sanctum,
the Records, the Control Room, the Library, BEACON, the Intelligence, the
Trading Floor. Working as dashboards over the same tables: Vitals, Forge,
the Market, Scriptorium, the Council's own room, the Observatory, the Deal
Room, the Lounge, the Garage, the Inventor's Room.

Waiting on the operator, not on the code:
- Migrations 0003–0008 have not been run against the live database. Until
  they are, the deployed site works in device mode and says so.
- The Anthropic API account has no credits. That is a prepaid balance at
  console.anthropic.com, separate from any Claude subscription — a
  subscription limit resetting does not fund it. Until it is funded,
  Counsel, the Council, HERALD and CIPHER cannot run.
- `npm run archives:sync` and `npm run products:import` have not been run,
  so the Library and the Lab are empty of your real rows.

## 12. Where to build on top

The seams, so an idea lands somewhere concrete:

- **A new list** (anything that is a list of things with a tag) — add the
  name to `LISTS` in `packages/database/src/state.js`. One line.
- **A new room application** — `apps/facility/src/render/<room>.js` with
  `render<Room>` / `bind<Room>`, a route in `main.js`, `opens: '#<room>'` on
  the room in `packages/config/src/rooms.js`.
- **New operating state a room edits** — a table in the next migration, its
  entry in the registry in `state.js` (columns, validators, defaults), store
  methods, and its mirror in `tools/lib/state-mirror.mjs`.
- **A new agent that actually runs** — a prompt and an endpoint in `api/`,
  registered in `packages/config/src/skills.js` with the room it works in
  and what it may read and write. `npm run check` verifies a skill cannot
  out-rank its agent. Model the shape on `api/intel.js`: read the input from
  the table rather than the caller, record the run, propose rather than act.
- **A new signal** — `apps/facility/src/core/vigil.js`. Pure function of
  state; it appears in the bar, the Observatory and the brief at once.
- **Arithmetic anything** — `core/lab.js`, `core/money.js`, `core/journal.js`
  are pure and shared by the floor, the aggregate, the brief and the mirror.
  Put the sum there once and it is right in four places.

The obvious next moves, in the order they pay:
1. **Sales against lots** — dispatch already knows what went out; tie it to
   the lots it came from and the Vault gets realised margin instead of typed
   revenue, and the Lab gets reorder points.
2. **TALLY, VECTOR and MERIDIAN as live agents** — the three rooms with
   enough real state for an agent to say something useful about it.
3. **Realtime** — one Supabase channel so two devices watching the same room
   move together.
4. **The Notion source on an Edge Function** — the Archives index refreshing
   itself instead of waiting for a laptop.

