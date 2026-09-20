# ARCANE — implementation report

The account of one pass, 2026-09-20, from `efcdcf7` to `eb2762e`: eleven
commits, 56 files, +2,823 / −132 lines, every step tested and committed
on its own. The audit that preceded it is `ARCANE_IMPLEMENTATION_AUDIT.md`.

Every claim of "works" below says how it was verified. Section 13 lists
what could not be verified and why.

---

## 1. What I found

The repository was better than its own documentation said, and worse
than its rooms looked.

**Better:** the live database had migrations 0003–0008 applied (30 of 30
tables), 1,342 Archive modules indexed and 138 products imported. The
docs, the plan, the open orders and the project memory all said those
were still pending. The only external blocker was — and is — API credits:
verified directly (`POST api.anthropic.com/v1/messages` → HTTP 400
*"credit balance is too low"*), not inferred from the UI. Tests, build and
config validation all passed (exit 0). Nothing was broken at compile time.

**Worse:** the rooms did not form a loop. Specifically —

- no proposal or approval state: CIPHER's suggestions lived inside a run's
  output and vanished when the room closed; nothing could ask the database
  "what needs approval?", and no order could say why it existed;
- signals were `{severity, room, text, clear}`, computed in the browser
  only — no id, no evidence, no link to work, and the server's picture had
  none of them;
- readiness lived in `/api/health` and was read by one room; the bar could
  not say "a migration has not run" or "the model has no credits";
- a refused write rolled back correctly and lost what the operator typed;
- `dispatch.items` was a free-text string: nothing decremented stock,
  nothing captured a price or a cost, and realised margin could not exist;
- 17 of 19 agents had cards and no code; the three with the richest state
  (TALLY, MERIDIAN, VECTOR) among them;
- totals had no working: £1,805 was a number, not an explanation.

## 2. What I changed

In the order it was done, each on the existing seams:

| Commit | What | Seam used |
| --- | --- | --- |
| `52760e7` | The audit | — |
| `49a1821` | Readiness computed from the tables; the bar and THE CONTROL ROOM show it. A refused write keeps the intent and offers retry. | `/api/health`, `core/store.js`, `main.js` |
| `40505dc` | `proposed` as an order state; `source_id` and `agent` on orders; registry rules; CIPHER writes proposals as rows; approve/reject on the Bridge and in every room | migration 0009, `config/loop.js`, `state.js`, `bridge.js`, `panel.js`, `ui.js` |
| `4f7f604` | Signals with id, kind, evidence, since, proposal; the same rules on the server; work opened from a signal names it | `core/vigil.js`, `bridge.js` aggregate, `store.js`, Observatory widget |
| `1a45c30` | `dispatch_items`; shipping draws lots down and captures price and cost; `realised()`; THE LAB and THE VAULT show what was actually made | migration 0010, `state.js`, `core/lab.js`, `core/money.js`, `lab.js`, `vault.js` |
| `7cf2009` | `api/_agent.js` (the contract), `evidence.js`, TALLY / MERIDIAN / VECTOR endpoints, skills registered, the reader section in three rooms | `api/`, `packages/database/src/`, `config/skills.js`, `render/agent.js` |
| `532629a` | Bridge: the machine's blockers, proposals, signals with open-work; RECORDS: what a run caused | `render/bridge.js`, `render/records.js` |
| `62e9dc2` | The Vault's numbers show their working | `core/money.js` (`explain`), `render/vault.js` |
| `123b617` | A half-applied migration is detected by column and named | `packages/database/src/index.js` |
| `ab3df86` | Devices re-read only when the last-change stamp moves | `/api/state?stamp=1`, `store.js` |
| `eb2762e` | Docs | `docs/ROOMS.md`, `ARCHITECTURE.md`, `PLAN.md`, `DATA-MODEL.md`, `SUPABASE.md` |

No new architecture. No new store. No browser access to Postgres. No anon
policies. No fake state: every empty figure says what it is waiting for.

## 3. What is now functional

Verified in headless Chromium against the dev stack (`npm run dev:local`)
and, where a read suffices, against the live database:

- **Truthful system state.** The bar shows *"3 degraded: The dev database"*
  or *"2 blocking: …"*, linking to THE CONTROL ROOM, where every check
  appears with its evidence and its fix, worst first. Against the live
  database `npm run db:check` now says exactly: *2 migrations to run, in
  this order: 0009_proposals.sql, 0010_dispatch_items.sql*.
- **Retryable refusals.** Broke the write path in the browser, typed a move:
  the bar said *not saved — moves: cannot reach the API*, the optimistic
  row was rolled back, `retry` re-sent the same intent, the bar said
  *moves: saved*, the row appeared. No page errors.
- **Proposals.** A `proposed` order appears on the Bridge under *Needs an
  answer* (agent, priority, room, reason, the run it came from) and in its
  room, above the work, not in it. Approve → it becomes work at once and
  reaches the Bridge's P0/P1 list. Reject → killed, never deleted. A
  proposal without an agent or with `source: floor` is refused by the
  registry with a sentence.
- **Signals.** The Observatory shows each with its evidence line and
  *since*; *open work* writes an order naming the signal; the row then
  reads *answered · ORD-…*. The Bridge's rail does the same. The live
  database's aggregate returns the same list the floor computes (1 signal
  today: `content.unposted`).
- **Sales → lots.** In THE LAB: add a dispatch, add a line from a lot (5 in
  stock), ship it: the lot reads 3 left, the line shows £24.45 sold /
  £2.61 cost / £43.68 profit, *Made £43.68 on £48.90 — margin 89%*; the
  realised block totals every shipped dispatch by product and by lot.
  Server-side, the same walk showed the lot drawn from 5 → 3 and the
  line's price and cost captured. THE VAULT shows realised profit for the
  month beside typed revenue and says which is which.
- **The readers.** In THE VAULT, *just the reading* records `TAL-R-…` as a
  reading and shows the evidence and *what the data cannot say*; *Read
  now* records a failed run with the credit sentence and still shows the
  reading; RECORDS lists the runs. Through the API, a dry TALLY read
  returned the live month's figures; a real MERIDIAN read returned 402
  with the reason and the evidence. Against the live database, all three
  evidence functions read real figures (revenue £3,220, cash £800 at
  2026-09-19, 1 signal) and named real gaps (*no stock has been booked
  in*, *no venture ranking has been set*).
- **Explainable numbers.** Clicking a Vault stat shows its working:
  *REVENUE = The Arcane Archives £1,792 (14 × £128)*; *RUNWAY = needs a
  cash snapshot*.
- **Cross-device.** A write from a second client appeared in the first
  within one 15-second poll, with no reload.
- **The phone** still fits: all 23 rooms and views at 390px, no control
  under 16px, no page errors.

## 4. Database changes

Two migrations, both idempotent, both additive, neither destructive:

- **`0009_proposals.sql`** — `orders.source_id text default ''`,
  `orders.agent text default ''`; the `state` check constraint widened to
  include `proposed`; indexes on `(source, source_id)` and on proposed rows.
  Existing rows keep their state and get empty strings, which is what
  "a human typed this" means.
- **`0010_dispatch_items.sql`** — `dispatch_items` (`id`, `dispatch_id` →
  dispatch, `product_id` → products, `lot_id` → stock_lots nullable,
  `vials > 0`, `unit_price_gbp`, `unit_cost_gbp`, `note`), RLS on, no
  policies, the `updated_at` trigger. `dispatch.items` (the text) is kept
  as a note.

`packages/database/src/index.js` now checks columns as well as tables, so
a half-applied schema is reported under the migration that completes it,
and a PostgREST *column not found* is translated to *run 0009*.

## 5. API changes

- `/api/health` — adds `counts` (six tables) and `ready` (the readiness
  verdict: level, blocked/degraded counts, one-line summary, items with
  evidence and fix). Judges the model by the last run that reached it.
- `/api/state?stamp=1` — `{ stamp, id }` of the last system event.
- `/api/state` — the registry now accepts `dispatch_items`; refuses a
  proposal without an agent/source; refuses `proposed → done/active`;
  refuses cancelling or unshipping a shipped dispatch; shipping draws the
  lots down and captures each line's economics.
- `/api/intel` — proposals become `proposed` orders naming the run;
  response carries `proposed: [ids]`.
- **New:** `/api/tally`, `/api/meridian`, `/api/vector` — `POST { code,
  question?, dry? }`, behind the operator key, on `api/_agent.js`.
- All model-backed endpoints share `modelFailure()` (402 no credits, 503
  bad key / overloaded, 429 rate limit, 502 otherwise), each with a
  sentence that says what to do.

## 6. Agent changes

- `api/_agent.js` — the contract: read → problems → run with the reading
  on it → reason (structured) → proposals as `proposed` orders → close.
  `dry: true` and a failing model both still read and still record.
- `packages/database/src/evidence.js` — `tallyEvidence`,
  `meridianEvidence`, `vectorEvidence`: deterministic over the tables
  through the existing pure modules; each returns `facts`, `problems`,
  `sources`, `brief`.
- CIPHER now uses the shared `propose()`.
- `packages/config`: three skills registered (`tally-reading`,
  `meridian-chain`, `vector-position`) with `SKILL.md` files; the three
  agents carry the `database` tool. `npm run check` validates them: a
  skill cannot out-rank its agent.
- **A discrepancy to note.** The brief for this work described VECTOR as
  the operational reader and MERIDIAN as the strategic one. In
  `packages/config` — the single source of meaning — MERIDIAN is the
  Quartermaster in THE LAB and VECTOR the Strategist in THE WAR ROOM. I
  followed the config: MERIDIAN reads the chain, VECTOR reads the
  position. The capabilities described are all built; only the names are
  the config's.

## 7. UI changes

Within the existing language — no cards added, no gradients, no
dashboards:

- the bar: one readiness chip before everything else; the refused-write
  line with *retry* / *let it go*; repaints only when the text changes
  (a repaint mid-click was detaching the button);
- THE CONTROL ROOM: the readiness table, worst first, with evidence and fix;
- every room's order board and the Bridge: the proposals block (shared,
  `ui.js`), approve / reject; orders show what caused them;
- THE OBSERVATORY and the Bridge's rail: evidence, *since*, *open work*,
  *answered*;
- THE LAB: dispatch lines with lot picking; per-dispatch and overall
  realised margin by product and by lot; MERIDIAN's reader;
- THE VAULT: realised profit beside typed revenue; every stat clickable
  for its working; TALLY's reader;
- THE WAR ROOM: VECTOR's reader;
- THE RECORDS: a run shows what it caused, what it read, the gaps it found.

## 8. Tests added

`npm test` runs 84 green suites/checks, exit 0. New this pass:

| File | Asserts | Checks |
| --- | --- | --- |
| `tools/readiness.test.mjs` | every rule the bar relies on, including "an absent count is not a passing count" and the missing-column case | 25 |
| `tools/proposals.test.mjs` | what a proposal must carry; cannot be marked done; not counted as work; approval in the record with the operator as actor; killed never deleted; signal as source | 24 |
| `tools/signals.test.mjs` | stable unique ids; evidence is the real numbers; every proposal is a legal order; **the floor and the server produce the same list**; the server does not judge a vault it cannot see | 24 |
| `tools/realised.test.mjs` | shipping draws down and captures; FX change does not rewrite a past sale; cannot unship or cancel; stock cannot go negative and a refusal moves nothing; wrong-lot refused; incomplete figures say so | 28 |
| `tools/agents.test.mjs` | the contract with a stand-in model: reads tables not the caller, records input/sources/usage/device, proposals name the run, dedup, nothing operational moved, dry run, credit failure (402, still reads, recorded), no key (503), refusal, VECTOR's Council question | 33 |
| `tools/api.test.mjs` | gate coverage for the three new endpoints | +6 |
| `tools/operating-state.test.mjs` | proposals are not mirrored until approved; 22 tables | +5 |
| `apps/facility/test/props.test.mjs` | (earlier today) no two props of a kind overlap | — |

## 9. Remaining blockers

1. **Migrations 0009 and 0010 have not been run against the live
   database.** Until they are, the deployed API will refuse order writes
   with *"orders has no column source_id yet — run
   supabase/migrations/0009_proposals.sql"* — honest, retryable, but a
   regression in capability. Run them **before** deploying this code.
2. **The Anthropic API account has no credits.** Counsel, the Council,
   HERALD, CIPHER and the three readers all record a failed run with the
   reason. The readings (`dry`) work regardless.
3. **No stock has been booked in and no dispatch lines exist** in the live
   database, so realised margin, cover and MERIDIAN's chain are empty by
   fact, and say so.
4. Eight open orders in the live `orders` table say the migrations and
   imports are still to do (#11, #13, #17, #19, #20, #21 by their brain
   numbers). They are done; they should be closed by the operator, not by
   a script.

## 10. Exact commands to finish deployment

In this order:

```
# 1. In the Supabase SQL editor, paste and run, in order:
supabase/migrations/0009_proposals.sql
supabase/migrations/0010_dispatch_items.sql

# 2. Confirm from the repo (needs the service key in .env):
npm run db:check           # must end: "every table the code expects is there"

# 3. Deploy:
git push origin main       # Vercel builds from main (npm run check && facility:build)

# 4. Then, in the deployed site: DEVICE → paste the operator key once per browser.
#    The bar will say what, if anything, is still wrong.

# 5. Fund the API:
#    console.anthropic.com → Plans & Billing → buy credits (auto-reload recommended).
#    Nothing in the repo changes.

# 6. Optional, to make the readings mean something:
#    THE LAB → a product → book a lot (batch, count, COA) → DISPATCH → lines from that lot → ship.
```

## 11. Environment variables required

| Variable | Where | State |
| --- | --- | --- |
| `SUPABASE_URL` | `.env`, Vercel | set |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env`, Vercel | set (only the API and the tools ever hold it) |
| `SUPABASE_ANON_KEY` | `.env`, browser | set (the device blob only) |
| `ARCANE_OPERATOR_KEY` | `.env`, Vercel, each browser | set |
| `ANTHROPIC_API_KEY` | `.env`, Vercel | set, **unfunded** |
| `ARCANE_BRAIN`, `ARCANE_ARCHIVES_EXPORT` | `.env` | set (vault tools) |
| `ARCANE_DB=memory`, `HERALD_MOCK=1` | dev only | `npm run dev:local` sets them |

Nothing new is required. The deployed Vercel values could not be read
from here; the live site's `/api/health` reports their presence once the
operator key is entered.

## 12. Recommended next engineering step

Book real stock and record dispatch lines for a fortnight, then build the
**reorder point** from measured cover: MERIDIAN's `reorder` output already
names the product and the rate; a `stock.cover:<product>` signal that
proposes the reorder order closes SIGNAL → INTERPRETATION → PROPOSAL →
APPROVAL for the one chain that earns money. Everything it needs exists
after this pass; it is one signal rule and one test.

## 13. What could not be verified, and why

- **Model reasoning end to end.** No credits. The agent contract is asserted
  with a stand-in model (33 checks) and the failure paths were exercised
  against the real API; the real readings will run the moment the account
  is funded, on code that is otherwise identical. I have not seen a real
  TALLY, MERIDIAN or VECTOR answer.
- **Migrations 0009 and 0010 against live Postgres.** No `psql` here and the
  rule is that migrations are run by hand in the SQL editor. Both were
  exercised against the in-memory twin (which mirrors the registry's
  defaults row for row) and are written idempotently; the error
  translation and `db:check` were verified against the live database's
  *absence* of them.
- **The deployed environment's variables.** Not readable from here.
- **Realtime with two humans.** The stamp poll was verified with two
  clients on one machine, not two people.
