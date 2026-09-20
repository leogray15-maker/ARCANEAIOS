# The OpenJarvis port — what ARCANE already had, what it needed, what was built

ARCANE stays ARCANE: the rooms, the nineteen agents, the floor, the grades,
the `proposed` order as the approval step. OpenJarvis is a source of
runtime discipline, not a product to imitate. This document is the audit
the brief asked for, then the record of what was actually built against
it — so the next session does not re-derive either.

Read this beside `docs/ARCHITECTURE.md` (the stack), `docs/ROOMS.md` (what
each room does) and `docs/DATA-MODEL.md` (the tables). It does not repeat
them.

## Why some of the brief does not fit, structurally

Two facts about ARCANE's actual shape decide a lot of what follows, so
they are stated once, here, rather than repeated in every row:

1. **Every agent has exactly one home room and one ceiling.** Nineteen
   agents, nineteen rooms, one `caps` object each. There is no case in the
   current roster of one agent needing different permissions in two
   rooms, so a room-level *grant* system (OpenJarvis's per-room capability
   overrides) has nothing to override. The ceiling *is* the room's rule.
   The resolution hierarchy below keeps the layer in case that ever
   changes, but it collapses to one step today.
2. **ARCANE's agents do not run a multi-step tool loop.** `api/_agent.js`
   reads the tables, makes one structured model call, writes proposals,
   closes the run. There is no loop that calls a tool, reads the result,
   and decides whether to call another — so loop detection, checkpoints
   and a workflow DAG have no live caller yet. They are built here as
   real, tested, pure modules with nowhere yet to plug in, and the
   Orchestrator (already on `docs/PLAN.md`'s list, now scaffolded) is the
   thing that would call them. This is said plainly in the tables below
   rather than pretended away.

Two further constraints from the deployment itself:

- **No process runs between requests.** Vercel functions are stateless
  and short-lived (300 s max here). A heartbeat, a scheduler, a
  reconnecting WebSocket server — anything that needs to be *alive*
  between calls needs either a database row it can poll, or Vercel Cron
  (a real, supported feature) hitting an endpoint on a timer. There is no
  third option without adding infrastructure ARCANE does not have.
- **One operator, one key.** `ARCANE_OPERATOR_KEY` is a considered,
  recorded decision (see `[[arcane-v3-state]]`): it is not a security
  *profile* system because there is one person and one trust boundary.
  OpenJarvis's PERSONAL/SHARED/SERVER profiles and its `ARCANE_HOME`
  config layer solve a multi-installation, multi-user problem ARCANE does
  not have. Porting them would add a second configuration system next to
  `.env` + Vercel env vars for no current benefit.

## The mapping

| OpenJarvis capability | ARCANE today | Verdict | This pass |
| --- | --- | --- | --- |
| Agent capability ceiling | `agent.caps` — seven graded capabilities (`CAPS`/`GRADES`, `packages/config/src/permissions.js`), enforced by `holds()`, checked by `tools/validate-config.mjs` | **exists** | Reused as the ceiling; not duplicated with a second `file:read`/`network:fetch` vocabulary |
| Capability grants per room | N/A — one agent, one room, one ceiling (see above) | **not applicable** | Documented; the hierarchy has the step, collapsed to a no-op |
| Capability denial always wins | Not formalised | **missing** | `resolvePermission()` — deny at any layer is final |
| Resource patterns (paths/domains/rooms/APIs/destinations) | Not formalised | **missing** | `permission_key` is `room:agent:tool:resource`; `resource` is a domain for `web`, a room id for `room:write`, free text otherwise |
| Tool capability requirements | `TOOLS`/`TOOL_BY_ID` exist (`packages/config/src/agents.js`) with a `state` note only | **partial** | Extended with `requiresCap`, `minGrade`, `risk`, `confirm`, `timeoutMs` |
| Approval tiers (trivial/low/medium/high) | Grades exist; no tier | **partial** | `tierOf(tool, grade)` derives a tier from the tool's risk and the agent's grade |
| Permission memory | None | **missing** | `permission_memory` table (0012) + `resolvePermission()`; high tier can never be remembered |
| Agent runtime state | `proposed` orders + `agent_runs.status` already exist; no single derived status | **partial** | `core/agents.js` (built in the OS pass, extended here): `idle/working/waiting/blocked/needs_approval/error/offline` **+ stalled + budget_exceeded** |
| Agent heartbeat | `agent_runs.started_at`/`finished_at` only | **missing** | `heartbeat_at`, `current_activity` columns (0012); `runs.heartbeat()` |
| Agent budgets | Token usage is recorded per run (`usage.in/out/cached`); no ceiling | **partial** | `agent_budgets` table: ceilings only (`tokens_daily`, `tokens_monthly`, `runs_daily`); usage stays computed from `agent_runs`, never duplicated — the same rule every other total in this codebase follows |
| Checkpoints | None; no loop to checkpoint | **missing, no caller yet** | Column reserved (`agent_runs.checkpoint jsonb`); `resilience.js` has the save/read helpers, tested; wired to nothing until the Orchestrator exists |
| Error taxonomy | `modelFailure()` already classifies by status/message | **partial** | Extended to also return `kind: RETRYABLE\|FATAL\|ESCALATE` and `suggestion` |
| Exponential retry | None | **missing** | `withRetry()` in `resilience.js`, bounded, used once (the model call in `api/_agent.js`) for `RETRYABLE` only |
| Loop detection | None; no loop | **missing, no caller yet** | `loopGuard()` in `resilience.js`, tested against a fingerprint history; ready for the Orchestrator |
| Event bus | `system_events` + `events.add()`/`events.list()` already are ARCANE's bus — Records, the Bridge, the brief and the mirror all read it | **exists** | New kinds only (`agent.stalled`, `agent.budget_exceeded`, `agent.heartbeat`, `permission.remembered`); existing kinds (`order.*`, `draft.*`, `decision.*`, `run.*`) are not renamed — vault-sync and the UI pattern-match on them |
| WebSocket live updates | 15 s stamp poll (`GET /api/state?stamp=1`) → reload on change | **deferred, already on the plan** | `docs/PLAN.md` already names Supabase Realtime Broadcast as the next step if polling proves too slow; a hand-rolled WebSocket server has nowhere to live on Vercel. Not built this pass |
| Approval queue | `proposed` orders, shown on the Bridge and in every room (`proposalsBlock`) | **exists** | A persistent count is now in the bar (**the Order Bell**) so it is visible from anywhere, not only the Bridge |
| Hash-chained audit | `system_events` is append-only (no update/delete route) but not chained | **partial** | `prev_hash`/`row_hash` columns (0012); `events.add()` computes the chain; `verifyAuditChain()` walks it; THE CONTROL ROOM shows the result |
| Bounded queues | Client-side lists are already sliced (`counsel.slice(-40)`, `log` capped at 80, run lists limited) | **exists** | No change |
| Configuration profiles | `.env` + Vercel env vars; one operator key | **not a fit** | See above; not ported |
| User overrides | Env vars already override in `loadEnv()` (never clobber what is set) | **exists** | No change |
| Health / system pulse | The bar's readiness chip (`store.systemStatus()`) already exists | **partial** | Ambient pulse animation added to the bar dot, keyed to the same three levels |
| Scheduled agents | `tools/herald-schedule.sh` (launchd) for HERALD only | **partial** | Generalised onto Vercel Cron: `vercel.json` gets a `crons` entry, `api/tick.js` runs the reap (below) and any due scheduled run |
| Workflow / DAG execution | None | **missing, scaffold only** | `packages/database/src/workflow.js`: a pure step runner (`agent | condition | approval`), tested; no UI this pass — the Agent Orchestrator (already planned) is its first real caller |
| Taint / data classification | No tool reads anything but the database and, for CIPHER, the open web through the server; nothing crosses from `secret`-shaped data to an outward tool today | **not applicable at current tool surface** | Documented; `contact`/`publish` grades already gate the one outward path (CIPHER's web read, ENVOY's unsent drafts) |
| Room isolation | One agent per room already means an agent's queries are already scoped to its own tables in practice; not enforced structurally | **partial** | Not enforced this pass — no cross-room data leak exists to close yet; noted as a real gap only if a second agent per room is ever added |
| Zombie recovery (atomic) | None | **missing** | `runs.reap()` — a single PostgREST `PATCH … status=eq.running&heartbeat_at=lt.<cutoff>` — a conditional update is atomic by construction (a second caller's PATCH matches zero rows), never read-then-write |
| Room budgets / goals | Ventures have money (`ledger_months`); rooms without a venture (Forge, Control Room, the Garage …) have none | **missing** | `room_budgets` table (0012): budget, period, an optional bound metric, a target |
| Ledger tying cost to room/venture/project | `ledger_months`, `capital_allocations`, `dispatch_items` already trace revenue and cost of goods to a venture; agent token cost is recorded per run but not rolled up | **partial** | `core/agents.js` already sums tokens per agent (OS pass); this pass adds the room/venture roll-up read by THE VAULT and left as tokens, not pounds — no per-token price exists in the codebase and inventing one would violate "never invent a figure" |
| Order engine upgrade | `orders` already carries priority, state, project/goal, estimate/actual hours, dependency, recurrence (0011, this session) | **exists** | Not duplicated with a second task table |
| Priority dispatch (P0 first) | `ORDER_PRIORITY`, sorted everywhere orders are listed | **exists** | No change |
| P0 preemption | None — crew "attention" weighting exists (`store.attention()`) but nothing moves an active order aside | **missing** | Not built this pass: ARCANE's agents do not hold long-running exclusive work to preempt (each agent run is one bounded model call, not a multi-hour task); the concept has no referent yet. Flagged for the Orchestrator |
| Order state machine | `ORDER_STATES`/`ORDER_FROM_PROPOSED`, enforced in `state.js`'s `check()`, one gateway (`api/state.js`) | **exists** | Not replaced with `queued/assigned/active` — same shape, different words, and renaming would break the mirror and every UI that reads it |
| Agent dashboards (gamified) | `render/agent.js` (the reader section), the Garage's roster widget | **exists, thin** | Deepened: level, streak, and three measured achievements per agent, computed from real runs and approvals — no invented points |
| Command palette | Cmd-K navigator exists (`render/nav.js`) — it goes places, it does not act | **partial** | Not extended to actions this pass (a real scope of its own); noted in Next |
| Scoreboard / Observatory / Records integration | The Bridge aggregate already is this integration point; VIGIL already reads the tables; Records already shows runs and what they caused | **exists** | Extended: VIGIL gets two new rules (`agent.stalled`, budget exceeded); Records' run row shows the heartbeat age |

## What this pass built

1. **`supabase/migrations/0012_governance.sql`** — `permission_memory`,
   `agent_budgets`, `room_budgets`; `agent_runs` gains `heartbeat_at`,
   `current_activity`, `checkpoint`; `system_events` gains `prev_hash`,
   `row_hash`.
2. **`packages/config/src/governance.js`** — the tool registry's new
   fields, `tierOf()`, `resolvePermission()`, fail-closed on an unknown
   capability or an unregistered tool, a malformed policy refused whole.
3. **`packages/database/src/resilience.js`** — `classify()` (the error
   taxonomy), `withRetry()` (bounded exponential backoff), `loopGuard()`
   (fingerprint repetition and A-B-A-B detection), `saveCheckpoint()` /
   `latestCheckpoint()` (bounded to five).
4. **`packages/database/src/audit.js`** — the hash chain: `nextHash()`,
   `verifyAuditChain()`.
5. **`packages/database/src/workflow.js`** — the pure DAG step runner.
6. **`core/agents.js`** extended — `stalled`, `budget_exceeded`, level,
   streak, achievements.
7. **`api/_agent.js`** — the model call goes through `withRetry()`;
   `modelFailure()` returns a `kind`.
8. **`api/tick.js`** + `vercel.json` `crons` — the reap, on a timer.
9. **The bar** — the Order Bell (pending proposals, from anywhere), the
   system pulse.
10. **THE CONTROL ROOM** — audit chain verdict, room budgets, agent
    budgets.
11. Tests: `tools/governance.test.mjs` (permission resolution, tiers, the
    tool registry's fail-closed rules), `tools/resilience.test.mjs`
    (backoff timing, loop detection, checkpoints), `tools/audit.test.mjs`
    (the chain, tamper detection), `tools/workflow.test.mjs` (the DAG
    runner).

## Explicitly not ported, and why

- **Configuration profiles / `ARCANE_HOME` / TOML manifests** — solves a
  multi-install problem ARCANE does not have; would sit beside `.env` as
  a second source of truth for the same settings.
- **A hand-rolled WebSocket server** — no process to host it on Vercel;
  Realtime Broadcast is the already-planned successor to the stamp poll.
- **P0 preemption** — no long-running exclusive agent work exists to
  preempt.
- **Taint labels / room isolation enforcement** — no cross-room data path
  exists yet that the grades do not already gate.
- **Full workflow UI / a second Orchestrator screen** — the DAG runner is
  real and tested; nothing calls it yet, so a UI for it would be a page
  with nothing behind it. Wait for the first real workflow.
- **Command-palette actions** — the palette still only navigates; turning
  it into an action surface (create order, approve, run an agent) is a
  real scope of its own, listed in Next.
