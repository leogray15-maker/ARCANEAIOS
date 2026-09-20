# ARCANE — implementation audit

Phase 0. Written by inspection of the repository and by reading the live
database, not from the project's own documentation — which turned out to
be wrong about what is blocking. Every claim below says how it was
checked. Nothing was changed while producing this.

Date of inspection: 2026-09-20. Commit: `efcdcf7`.

---

## 1. The architecture as it actually is

```
packages/config/src/*            meaning: 19 agents, 21 rooms, 4 wings, 4 ventures,
   │                             grades, order + draft vocabulary, Council seats,
   │                             6 standing rules.  Enforced by tools/validate-config.mjs.
   ▼
supabase/migrations/0001–0008    state: 30 tables, RLS on, no anon policies.
   ▼
packages/database/src/           the verbs. state.js is a registry (key, settable
   │  index.js  PostgREST client + error translation (names the missing migration)
   │  state.js  24 operating tables: validators, defaults, id minting, side effects
   │  content.js modules · drafts · runs · events
   │  bridge.js  one aggregate, read by api/bridge.js AND tools/brief.mjs
   ▼
api/*.js                         the only door. 12 functions, all behind guard()
   │                             → operator key, constant-time, fails closed.
   ▼
apps/facility/src/core/store.js  optimistic cache over the tables (SERVER_KEYS),
   │                             plus a per-device blob (arcane_sync) for what is left.
   ▼
apps/facility/src/render/*.js    11 full applications + panel.js (the 4-section
                                 dashboard) + widgets.js (the remaining rooms).

Postgres ──► tools/vault-sync.mjs ──► brain/ (Obsidian)   mirror, never a second truth
```

Pure arithmetic lives in `apps/facility/src/core/{lab,money,journal}.js` and is
imported by the floor, the Bridge aggregate, the brief and the vault mirror —
one calculation, four readers. `core/vigil.js` is the same idea for signals.

Sizes: api 588 lines · config 684 · database 873 · content-engine 261 ·
facility 7,055 · tools 2,215 · migrations 722.

## 2. Verification run before touching anything

| Command | Result |
| --- | --- |
| `npm run check` | exit 0 — 19 agents (9 seated), 20 rooms + 1 annex, no agent holds allow, spend deny everywhere |
| `npm test` | exit 0 — HERALD lint 13/13, archives indexer, Notion indexer, api gate, state/vigil (13), content machine (35), operating state (71), floorplan, sprites, props |
| `npm run facility:build` | exit 0 — 305 kB main, built in 588 ms |
| `npm run db:check` | **all 30 tables present** |

There is no typecheck or lint step in this repo (plain ESM, no TypeScript, no
ESLint config). `npm run check` + `npm test` are the equivalent gates.

**No build or test failures were found.** The system's problems are not
compile-time.

## 3. The live database — what is actually in it

Read with the service key from `.env` (read-only queries):

| Table | Rows | Reading |
| --- | --- | --- |
| `archive_modules` | **1,342** | `archives:sync` has run. Gate split: 357 allowed, 289 open, 354 never (342 ungated/other) |
| `products` | **138** | `products:import` has run. 64 listed, 64 priced, 125 costed |
| `settings` | 3 | fx_gbp_per_usd = 0.746, landed_overhead_pct = 0, low_stock_vials = 12 |
| `orders` | 22 | 8 open, 14 done — all `source: brain` (imported from 06-Orders) |
| `content_drafts` | 5 | all `draft`, from HERALD's 2026-09-16 run (short, medium, thread, email, teaser) |
| `agent_runs` | 2 | one ok (HERALD, 16 Sept), one failed (HERALD, 19 Sept — no credits) |
| `system_events` | 210 | order.added 22, product.set 138, ledger.set 21, draft.* 10, cash.set 3, counsel.added 4, run.failed 1 |
| `ledger_months` | 4 | Sept 2026 typed: peptides £1,805.42 · archives 11 units · track 13 units · codex empty |
| `fixed_costs` / `pots` / `cash_snapshots` | 6 / 4 / 1 | the Vault has real figures |
| `protocol_items` | 5 | seeded |
| `counsel_turns` | 4 | ARCANE has been spoken to |
| **`stock_lots`** | **0** | no stock has ever been booked in |
| **`dispatch`** | **0** | no order has ever been dispatched |
| `list_items`, `decisions`, `venture_focus`, `goal_progress`, `days`, `protocol_ticks`, `entries`, `trades`, `setups`, `checkins` | 0 | never used |

### The blocker list in the docs is out of date

- Migrations 0003–0008: **applied.** (`npm run db:check` — 30/30.)
- `archives:sync`: **run** (1,342 modules).
- `products:import`: **run** (138 products).
- API credits: **still blocked.** Verified directly, not inferred:
  `POST api.anthropic.com/v1/messages` with the key in `.env` returns
  HTTP 400 `"Your credit balance is too low to access the Anthropic API."`

`docs/PLAN.md`, `docs/ROOMS.md`, `brain/06-Orders/Orders.md` and the project
memory all still say the migrations and imports are pending. That is now the
single most misleading thing in the repository: it tells the operator to do
work that is already done, and it hides the fact that **the system has real
data in it and is one funded key away from running.**

## 4. Working systems (verified)

- **The config gate.** Six standing rules enforced in code; `npm run check`
  fails the build if one breaks. No agent holds `allow`; spend is deny.
- **The API boundary.** Every one of the 12 functions is wrapped in `guard()`:
  method check, operator key (constant-time, fails closed when unset), JSON
  errors with status/code/hint. `tools/api.test.mjs` asserts 503/401/403/405/400
  for all ten data endpoints, and that a *prefix* of the key is not the key.
- **The registry.** 24 tables with validators, defaults, id minting, refusals
  (orders and decisions are never deleted; products are retired, not dropped)
  and status side effects (`done_at`, `reviewed_at`, `shipped_at`). Every write
  emits a `system_events` row — which is why RECORDS has a timeline nobody wrote.
- **Error translation.** A missing table returns *"run
  supabase/migrations/0005_lab.sql in the Supabase SQL editor"*, not "PGRST205".
- **One aggregate, two readers.** `bridge.js` serves both `/api/bridge` and
  `tools/brief.mjs`. No second copy of "what matters today".
- **Pure arithmetic, shared.** `lab.js` (unit cost, economics, stock lines, the
  Lab summary), `money.js` (revenue, fixed, runway, the split, history),
  `journal.js` (R multiples, stats). Imported by the floor, the aggregate, the
  brief and the mirror.
- **The Content Machine.** Index → sync → Library → HERALD → gate → BEACON →
  revisions → mirror. Proven by 1,342 modules and five real drafts in the
  database, and by 35 assertions in `tools/content-machine.test.mjs`.
- **The agent precedent.** `api/intel.js` is the contract: read the input from
  the table (not the caller), mint a run id, `runs.start`, call the model,
  `runs.finish` with usage and output, translate failure. Two runs recorded.
- **Read-only honesty.** Without the operator key the store never claims to
  save: `commit()` refuses and the bar says *"state read-only — enter the
  operator key"*.

## 5. Broken systems

Nothing is broken in the sense of throwing. One thing is functionally dead:

- **Every model-backed feature** — Counsel, the Council, HERALD, CIPHER —
  fails at the Anthropic call because the account has no credits. The failure
  is now translated into a sentence that says what to do (`api/_lib.js`
  `modelFailure`), and CIPHER records the failed run. Nothing fakes a result.

## 6. Incomplete systems — the real gaps

These are the gaps between "the rooms work" and "the operating system works".

**G1 · No proposal or approval state.** `orders` is already the task model
(id, room, text, priority, state, holder, actor human|agent, venture,
blocked_on, due, note, source floor|brain|counsel|council, brain_n, done_at).
What it lacks: a `proposed` state, the **agent** that proposed it, and a
**`source_id`** pointing at what caused it. CIPHER's proposals live only
inside `agent_runs.output`; press *take it* and the order is created with no
link back to the run. So "what needs approval?" cannot be asked of the
database, and "why does this order exist?" cannot be answered from the order.

**G2 · Signals are ephemeral and unaddressable.** `core/vigil.js` returns
`{severity, room, text, clear}`. No id, no evidence, no timestamps, no status.
They are computed **in the browser only** — the Bridge aggregate does not carry
them, so the server's picture of the day has no signals in it, and no signal
can become work with a traceable link. This is the missing first arrow of
SIGNAL → INTERPRETATION → TASK.

**G3 · System readiness is not surfaced where it matters.** `/api/health`
already reports keys present, database kind, every expected table with its
migration, and the knowledge sources — but only THE CONTROL ROOM reads it.
The bar shows the server rung (green/amber/red) and nothing about missing
migrations, empty imports, or the unfunded model. The operator learns that
HERALD cannot run by pressing the button.

**G4 · A refused write loses the operator's intent.** `commit()` applies
optimistically, and on refusal calls `loadServer()`, which reloads the tables
and discards the change — a correct rollback, but the typed text is gone and
there is no retry. `server.error` is a single string that the next commit
overwrites.

**G5 · The sale → lot chain does not exist.** `dispatch.items` is a free-text
string. There are no dispatch line items, no lot reference, no price captured
at the moment of sale. `stock_lots` and `dispatch` are both empty, so today
nothing decrements stock and realised margin cannot be derived at all — the
Vault's revenue is typed by hand and the Lab's margin is theoretical
(price − landed cost), never realised.

**G6 · Numbers are totals without provenance.** `moneySummary` returns
revenue, fixed, cash, runway; `labSummary` returns value at cost and at price.
The components exist inside the pure modules but are not carried out to the UI,
so £1,805.42 is not clickable and runway cannot be explained.

**G7 · Seventeen of nineteen agents do not run.** Only HERALD and CIPHER have
endpoints (plus ARCANE via `/api/counsel` and the nine seats via
`/api/council`). TALLY, VECTOR and MERIDIAN — the three rooms with enough real
state to be worth reading — have cards and no code.

**G8 · Two small duplicate-truth risks.** (a) The store keeps a per-device
`drafts` map in the blob that `vigil.js` still overlays on the brain's drafts;
BEACON reads the server. (b) Brain-seeded orders (`fromBrain`) live in the
store until a write promotes them into the table — correct, but it means the
same order can be present twice in different shapes during that window.

## 7. Database dependencies

- **Supabase Postgres** at `SUPABASE_URL`, reached only through PostgREST with
  the service role key, only from `api/*` and `tools/*`. RLS on, no anon
  policies — the anon key touches `arcane_sync` alone.
- Migrations are hand-applied in the SQL editor. There is no migration ledger
  table; `checkSchema()` infers applied state by selecting one column from each
  expected table and maps a failure to its migration file. Good enough, and
  honest, but it cannot detect a *partially* applied migration (a table that
  exists without a later column).
- `tools/db-check.mjs`, `archives-sync.mjs`, `products-import.mjs` all need
  `SUPABASE_SERVICE_ROLE_KEY`; `products-import` also needs the local,
  gitignored `data/peptides/catalog.json`.

## 8. Environment variables

| Variable | Where | Present locally | Needed for |
| --- | --- | --- | --- |
| `SUPABASE_URL` | .env, Vercel | yes | everything |
| `SUPABASE_SERVICE_ROLE_KEY` | .env, Vercel | yes | every API function and tool |
| `SUPABASE_ANON_KEY` | .env, browser | yes | the device blob only |
| `ARCANE_OPERATOR_KEY` | .env, Vercel, each browser | yes | every API call |
| `ANTHROPIC_API_KEY` | .env, Vercel | yes, but **unfunded** | Counsel, Council, HERALD, CIPHER |
| `ARCANE_BRAIN`, `ARCANE_ARCHIVES_EXPORT` | .env | yes | vault tools, the Archives index |
| `ARCANE_DB=memory`, `HERALD_MOCK=1` | dev only | — | `npm run dev:local` |

Nothing required is missing. The only defective one is the funding behind
`ANTHROPIC_API_KEY`. It could not be verified whether the *deployed* Vercel
project holds the same values — those are not readable from here.

## 9. Highest-risk areas

1. **`store.merge()` / `importLocalOnce()`** — the one place that can silently
   lose or duplicate operator-typed data. Guarded by a one-shot localStorage
   flag and by emptiness checks, but it runs before the operator sees anything.
2. **Optimistic writes without retry (G4)** — the failure mode is invisible
   data loss of the *intent*, which is the thing the operator actually typed.
3. **Hand-applied migrations** — no ledger, no partial-application detection.
4. **Free-text `dispatch.items` (G5)** — any UI built on it now would harden a
   shape that cannot carry a lot reference later.
5. **Client-only signals (G2)** — the brief and the floor can disagree about
   what is wrong, because only one of them computes it.

## 10. Proposed implementation order

Ordered by leverage, each phase small enough to test and commit on its own.
Every step reuses the existing seams; no new architecture.

1. **Truthful system state.** Extend `/api/health` with a readiness block
   (migrations, imports, model). Cache it in the store; show one honest chip
   in the bar that names the worst thing and links to THE CONTROL ROOM.
   *Touches: api/health.js, core/store.js, main.js, render/control.js.*
2. **Retryable refusals.** Keep the refused intent in the store, show it in the
   bar with a retry, clear it on success. *Touches: core/store.js, ui.css.*
3. **The task model, minimally extended.** Migration 0009: `orders.source_id`,
   `orders.agent`, and `proposed` added to the state vocabulary with an
   approval move. Registry, store, panel, Bridge. This is what makes
   SIGNAL → WORK → RECORD traceable. *No new table.*
4. **Signals become addressable.** Give each signal a deterministic id,
   evidence (the rows it was computed from) and a suggested action; move the
   computation server-side into the Bridge aggregate so the floor and the brief
   read one list; "open work from this signal" writes an order with
   `source: 'signal', source_id: <id>`; a signal with work shows as answered.
5. **BRIDGE as the decision surface.** Add: what needs approval (proposed
   orders), unresolved signals, system blockers — each traceable to its source.
6. **Sales → lots.** Migration 0010: `dispatch_items` (dispatch_id, product_id,
   lot_id, vials, unit_price_gbp, unit_cost_gbp captured at ship). Shipping
   decrements the lot. `lab.js` gains realised margin; `money.js` reads it
   beside typed revenue. Surfaced honestly as "no lots booked in" until there
   are lots.
7. **TALLY, VECTOR, MERIDIAN** on the `api/intel.js` contract — read the tables,
   record the run, return structured output with proposals that require
   approval. Useless until the key is funded, so they ship with a deterministic
   read-only "evidence" path that works without the model.
8. **Explainable numbers.** Carry the components out of the pure modules and
   show them where the total is.
9. **Realtime** — last, once the state flow is right.

