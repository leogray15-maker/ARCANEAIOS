# The rooms — what each one does, and how

The facility is the map; the rooms are the instruments. Every room is one
of three things today, and this document says which:

- **REAL** — a full-page application on the tables behind `/api` (orders, moves, drafts, modules …). State persists across devices; every change is a system event; `vault:sync` lands it in the brain.
- **WORKING** — a dashboard with a widget over the same tables (orders, lists, the ledger); real, but a widget in the four-section frame rather than a full application.
- **SHELL** — none left. The placeholder rows are gone.

Every dashboard (WORKING) has the same four sections: **State**
(the widget), **Orders** (that room's board — add, done, block with a
reason, unblock, kill), **Crew** (the resident agent, its grades, who is
here now), **Files** (the brain folder the room owns). The orders board is
real in every room.

## The frame around the rooms

**The bar** (top). Left: the brain's brief date, open orders, drafts
waiting, signals, crew away — each a link. The dot before them is the
server rung: green = state on the server; amber = read-only (no operator
key); red = the last write was refused, and why. FLOOR · BRIDGE · LIBRARY
· BEACON · BRAIN GRAPH switch views. **DEVICE** holds this browser's sync
code (for the blob) and the operator key (for the API): paste the key once
per browser. FIT · 2x · 3x zoom the floor.

**The floor.** Twenty rooms in four wings plus THE TRADING FLOOR annex.
Click a room to open it; ARCANE walks there. Crew drift toward rooms
with open orders — P0 pulls hardest — so the floor is a picture of the
work. Keys on the floor: `b` Bridge, `w` War Room, `l` Library, `n`
Beacon, `p` the Lab, `v` the Vault, `s` Sanctum, `r` the Records, `j` the Journal, `0–4` zoom, `Esc` back. Hover a room for its open orders and who
is there.

**The strip** (bottom of the floor). London time, the three sessions
(Tokyo · London · New York, lit when open), XAUUSD live, the weather, and
the day's counts: orders, drafts waiting, posted, trades today, protocol.

**The Brain Graph.** The Obsidian vault itself — every note and link,
grouped by folder, rooms anchored to their brain folders, agents orbiting
live. Click a note to open it in Obsidian.

## C2 · COMMAND

### BRIDGE — REAL · `#bridge`
*What it is for.* The one screen that answers: what matters today, what is waiting on me, what is moving, what changed, how each venture stands.
*What it does.*
- **Today** — a one-line focus for the day (type, Enter; it is kept per day in `days`). Every P0/P1 order across the whole floor with done / block / kill; orders past their due date; moves tagged *now* from the War Room; add an order to any room from here.
- **Waiting on you** — drafts waiting and approved-unscheduled (links into BEACON), blocked orders with their reason, orders in review, Council verdicts that have no outcome yet (record the outcome inline), P0s open more than two days.
- **Active** — agent runs in the last two days (status, objective, error), rooms with open work and the top order in each.
- **Counsel** — Leo ↔ ARCANE. ARCANE answers from the brief, the numbers, today's focus, the ranking and the moves; names the specialist it concerns; may propose one order, which you add with a click. Turns persist.
- **Right rail** — doctrine (current intent and the five decision principles, from `01-System/Doctrine.md`); the four ventures in the order set in the War Room, each with allocation, open/P0/blocked counts and its top order; VIGIL's live signals; goals with typed progress (the computed ones — COA, MRR, posts — are read-only); the last events from the record.
*Where it lives.* `orders`, `list_items`, `decisions`, `counsel_turns`, `venture_focus`, `goal_progress`, `days` through the store; drafts, runs and events from `/api/bridge`. The same aggregate writes `03-Memory/Brief.md` (`npm run brief`).

### THE WAR ROOM — REAL · `#warroom`
*What it is for.* Which venture gets the next hour, the next pound, the next quarter.
*What it does.*
- **The next three moves** — now / next / later. Add, retag, edit in place, reorder with ↑↓, mark done (it asks what came of it; the answer is kept), reopen. More than three *now* and the room says so.
- **The ranking** — the four ventures in rank order (↑↓), each set to push / maintain / starve with one line of why. The Bridge, the brief and Counsel read this.
- **Stop doing** — the list of what to stop; done means stopped.
- **Where the work is** — open orders by room with the top one; **Verdicts** — the last Council decisions and their outcomes; doctrine.
*Where it lives.* `list_items` (lists `moves`, `stop`), `venture_focus`, `orders`, `decisions`. Mirrored to `05-Knowledge/Lists.md` and `Focus.md`.

### THE COUNCIL — WORKING (decisions REAL)
*What it is for.* A real decision put to nine seated agents; one verdict.
*What it does.* Type the decision in one line → Convene. One structured Claude call: nine positions, each from its own domain, disagreement recorded; ARCANE returns BUILD / DELAY / WATCH / KILL with the conditions that must be true first. The decision lands in `decisions`; record the outcome later, here or on the Bridge. A Council that cannot sit (no credits, no key) says so in the bar and records nothing.
*Where it lives.* `decisions` → `04-Records/Decisions/DEC-*.md` and the Decision-Log.

### THE VAULT — REAL · `#vault`
*What it is for.* The treasury, with a history: revenue, fixed costs, cash, runway, the split.
*What it does.* One month at a time (this month by default; `#vault/2026-08` for another). Revenue by venture — members or orders for a priced venture (×£128, ×£11.99 …) or a typed £ figure; fixed costs as a list you add to, edit and retire; cash as dated snapshots (runway is cash over the monthly shortfall); the split into pots with the pound amounts for this month, flagged when it is not 100%; the history table of every month typed, revenue by venture, fixed, net; the Lab's stock value at cost and at price; the link to the Journal. Empty means not typed, never zero.
*Where it lives.* `ledger_months`, `fixed_costs`, `cash_snapshots`, `pots` (0006). The brief's MONEY block, the goals (members, Track subscribers, MRR), the Bridge's ventures and VIGIL read the same rows. Mirrored to `05-Knowledge/Money.md`. Nothing here moves money.

### SCRIPTORIUM — WORKING (list REAL)
*What it is for.* The Codex: books, masterclasses, long-form writing.
*What it does.* The manuscripts as a list tagged idea → drafting → proofing → live; sales are typed monthly in THE VAULT as the Codex's units.

### THE TRADING FLOOR — REAL · `#journal`
*What it is for.* Leo's own desk: XAUUSD, every trade in the Journal.
*What it does.* TRADES (the log, R multiple, plan followed), NEW TRADE (instrument, direction, session, killzone, setup from the playbook, entry/stop/target/exit, risk, grade, conviction, the Before / During / After blocks, emotions, energy, sleep, stress, rule breaks, chart link), DAILY / WEEKLY / MONTHLY reviews, PLAYBOOK (setups with rules), PSYCHOLOGY (check-ins), equity and R distribution, JSON export/import. VIGIL reads it for drawdown, three losses in a row, rule breaks and plan-followed rate.
*Where it lives.* `trades`, `setups`, `checkins` (0008); every trade is a row with its own columns, ids `T-YYYYMMDD-NN`. Mirrored to `04-Records/Journal/<id>.md` and `Journal-Log.md`. The operator's own record and nothing else.

## C1 · PRODUCTION

### THE LAB — REAL · `#lab`
*What it is for.* Arcane Peptides as operations: what is sold, what it costs, what is on the shelf, what is going out.
*What it does.*
- **The catalogue** — ON THE STORE (64 lines) · EVERY LINE (the supplier's whole sheet, 138) · IN STOCK · DISPATCH. Each line: supplier code, kit cost in dollars, landed cost per vial in pounds, your price, profit and margin per vial (red under 60%, amber under 75%), vials on hand, COA. Search; the rate, the landed overhead and the low-stock line are typed at the top and every margin recomputes. A `?` chip carries the doubt from the margin sheet (blend ratios, units, uncertain matches).
- **A product** — the figures (price, kit cost, vials per kit, code, size, category, note; saved on leaving the field), on/off the store, retire. Its lots: stock in with a batch, a count, the COA state and link, the date, a kit cost if this lot differed; count vials up and down; set the COA none → pending → published. Stock, COA and value are the sum of the lots.
- **Dispatch** — add an order ref and its items; packing → ready (tracking) → shipped → delivered, or cancelled. The Market shows the same queue.
- VIGIL raises a breach for any line in stock without a published COA and a warning for a low line; the Bridge's Peptides card shows vials, COA and the queue; the brief's Peptides line reads the same numbers.
*Where it lives.* `products`, `stock_lots`, `dispatch`, `settings` (0005). Seeded once from `data/peptides/catalog.json` (local, gitignored — it carries cost prices) by `npm run products:import`; the database is the truth after that. Mirrored to `05-Knowledge/Lab.md`. Nothing here is a claim about what a compound does.

### VITALS — WORKING (ledger REAL)
*What it is for.* Arcane Track: members, and what they are worth.
*What it does.* This month's members, visitors and sign-ups typed into Track's ledger row (revenue at £11.99 follows), the months before. No integration with the app yet; health data from the app never comes here.

### FORGE — WORKING (orders REAL)
*What it is for.* Building: the site, the app, automation, workflows.
*What it does.* The build queue is this room's orders board — open, blocked, active, done lately — where the engineering orders live (migrations, keys, deploys, repairs). The Bridge shows every P0 and P1 of them.

### THE MARKET — WORKING (ledger REAL)
*What it is for.* The shop front: visitors → leads → orders.
*What it does.* This month's funnel for Arcane Peptides — visitors, leads, orders, revenue — typed into the same ledger row THE VAULT shows, with the conversion rates; the Lab's dispatch queue.

### BEACON — REAL · `#beacon`
*What it is for.* What we are saying. The output side of the Content Machine.
*What it does.*
- **Queue** — DRAFTS (draft + review) · APPROVED · SCHEDULED · PUBLISHED · REJECTED, with counts; search across hooks, titles and sources; each row shows hook, format, platform, source module, status, a `note` chip when the compliance gate flagged a line, a `mock` chip when the mock writer made it.
- **The workspace** (one draft) — title, platform, the body in an editor; Save runs the same lint gate HERALD passed (a dose, a compound, a claim, a wrong shape is refused with the reason) and keeps the text as a revision. Moves: Approve, Reject (with a reason), Mark scheduled (with a date), Mark published (with the URL), Back to draft — only the moves the config allows. Regenerate (same format, same module) and Alternate take (told to find a different line) make a new draft that points back at this one. Copy. History: every revision with restore. Provenance: module (link to the Library), subject, Notion page, the Obsidian note, angle, cta, run id, model.
*Where it lives.* `content_drafts`, `content_revisions`, `agent_runs`; mirrored to `02-Content/{Drafts,Approved,Posted,Killed}`.

## C3 · KNOWLEDGE

### THE LIBRARY — REAL · `#library`
*What it is for.* What we know. The Arcane Archives, searchable.
*What it does.* Subjects on the left (green = Allowed for HERALD, grey = open on request, red = never); full-text search across titles, subjects and the text of every module (`/` focuses it); filters for the gate and the lane; the results with words and gate. Open a module: its full text, provenance (id, source note, Notion id, course, indexed when, flags), what has already been cut from it (linked into BEACON), and **Generate content** — tick the formats, add a note, and HERALD writes; refused drafts are named with the gate's reason; the rest land in BEACON.
*Where it lives.* `archive_modules` (put there by `npm run herald:index && npm run archives:sync` from the Obsidian vault, incremental by content hash). Read-only: nothing in the Archives is ever written to.

### INTELLIGENCE — WORKING (lists REAL)
*What it is for.* Competitors, markets, pricing, suppliers, regulation.
*What it does.* A watchlist tagged opportunity / threat / signal; the vault's signals table. Web research is not wired; this is the list CIPHER will be given.

### THE OBSERVATORY — WORKING
*What it is for.* Everything that changes while nobody is looking.
*What it does.* VIGIL's live signals, computed now from the state — the brief's age, low stock, missing COAs, the draft queue, nothing marked posted, stale P0s, the split, journal drawdown and rule breaks, the protocol — each with the room it belongs to and what clears it. The bar counts them.

### THE DEAL ROOM — WORKING (lists REAL)
*What it is for.* Leads, prospects, partners, suppliers.
*What it does.* A pipeline list tagged lead → contacted → meeting → proposal → won / lost. No CRM is wired; ENVOY sends nothing.

### THE LOUNGE — WORKING (lists REAL)
*What it is for.* Downtime, and noticing when there has not been any.
*What it does.* Minutes in the building this session (red past ninety); the same stop-doing list as the War Room.

## C4 · NETWORK & LIFE

### THE AGENT GARAGE — WORKING (read-only)
*What it does.* Every agent's card: role, call sign, room, brief, Council seat. Agents are defined in `packages/config/src/agents.js`; there is no editing here yet.

### THE CONTROL ROOM — REAL · `#control`
*What it does.* The machine's own state: which keys the server holds (never their values — Anthropic, the service key, the operator key), whether the database answers and whether it is Supabase or the dev database, every table the code expects with its migration and whether it exists (the missing ones name the file to run), the knowledge sources' sync state, the last agent runs, and the permission matrix. Reads `/api/health`; nothing here is edited.

### THE INVENTOR'S ROOM — WORKING (lists REAL)
*What it does.* An idea queue tagged BUILD / WATCH / KILL, and the count of items in the brain's inbox. SPARK's evaluation is not wired; the tags are Leo's.

### THE RECORDS — REAL · `#records`
*What it does.* TIMELINE — every system event (orders, moves, drafts, decisions, stock, money, the protocol …) newest first, by day, searchable, filtered by kind, each linking where it happened; RUNS — every agent run with status, objective, model, tokens, how long; DECISIONS — verdicts with outcomes, recorded here or on the Bridge; LESSONS — one line each, tagged to a venture, retired when no longer true; TRACE — the vault's Trace and this session's floor log. Append-only.

### SANCTUM — REAL · `#sanctum`
*What it does.* TODAY — energy (1–10), hours slept, the day's focus (the same line as the Bridge), a note on the day; the protocol as items (train, sleep floor, deep work, steps, read — yours to edit, add, retire) with daily ticks, streaks, a weekly count for weekly items, the last seven days as cells; the week's energy and sleep; principles kept and objectives open. Then five kinds of entry — JOURNAL, REFLECTIONS, PRINCIPLES (kept), OBJECTIVES (done or dropped), LIFE DECISIONS — written, edited, dropped, never deleted.
*Where it lives.* `days`, `protocol_items`, `protocol_ticks`, `entries` (0007). Private: the API is operator-only and entries are never mirrored into the brain repository; only the day and the protocol are (`04-Records/Protocol.md`). No gamification; a streak is a count.

## Under every room

- **`/api/*`** — the only door to the database. Every call carries the operator key; without it the API refuses and the rooms say so. Counsel, the Council and HERALD need `ANTHROPIC_API_KEY` on the server too.
- **The store** — the browser's cache of the tables plus the blob. A change shows at once, goes up, and if refused the store reloads and the bar says why.
- **The brain** — `npm run vault:sync` lands the tables in Obsidian (orders by number, lists, focus, the Lab, money, drafts, decisions, counsel, trades, the protocol — never Sanctum's entries) and `npm run brief` writes the four-block brief from the same aggregate the Bridge reads.
- **Local** — `npm run dev` is the production loop on a laptop; `npm run dev:local` runs it all on the dev database with the mock writer, no keys needed.
