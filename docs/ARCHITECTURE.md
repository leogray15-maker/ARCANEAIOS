# THE ARCANE — Architecture

One facility, one brain, nineteen agents, one operator. This document is
the map of how the parts connect. The parts themselves are documented
where they live.

## The layers

```mermaid
flowchart TB
  subgraph OPERATOR["Leo — the one human"]
    OB[Obsidian]
    FA[Facility in the browser]
    CC[Claude Code / Cursor]
  end

  subgraph CONFIG["packages/config — single source of truth"]
    AG[agents.js · 19 agents, grades, tools]
    RM[rooms.js · 20 rooms, 4 wings, brain folders]
    LP[loop.js · brief blocks, verdicts, states]
    SK[skills.js · skill registry]
    VAL[tools/validate-config.mjs<br/>refuses: allow, spend, notion-write]
    AG & RM & LP & SK --> VAL
  end

  subgraph BRAIN["brain/ — Obsidian vault, durable memory (private git repo)"]
    SYS[01-System<br/>generated cards + matrix]
    CON[02-Content<br/>Drafts → Posted]
    MEM[03-Memory<br/>Shared-Memory · Brief · Signals]
    REC[04-Records<br/>Trace · Daily-Log · Decisions]
    KNO[05-Knowledge<br/>Facility · Ventures · Archives-Map]
    ORD[06-Orders]
  end

  subgraph SKILLS[".claude/skills — agent procedures"]
    HER[HERALD<br/>index → pick → write → lint → emit]
  end

  subgraph SOURCES["Sources (read-only)"]
    NX[Arcane Archives<br/>Obsidian vault · Notion export on disk]
  end

  subgraph ENGINE["packages/content-engine + packages/database"]
    GEN[generate: prompt → Claude → lint gate → repair → land]
    DBC[createDb · modules · drafts · revisions · runs · events]
  end

  subgraph API["api/ — Vercel functions, operator key on every call"]
    AM[modules]
    AH[herald]
    AD[drafts]
    AR[runs]
    AS[state · bridge]
    AC[counsel · council]
  end

  subgraph DB["Supabase Postgres — the runtime system of record"]
    KN[(archive_modules<br/>knowledge_sources)]
    CT[(content_drafts<br/>content_revisions)]
    OS[(orders · list_items · decisions<br/>counsel_turns · venture_focus · goal_progress · days)]
    AG[(agent_runs)]
    EV[(system_events)]
    SY[(arcane_sync<br/>stock · ledger · protocol · journal, for now)]
  end

  subgraph FACILITY["apps/facility — Vite, canvas, Vercel"]
    FLOOR[Floor: 21 rooms, props, sprites]
    BRI[BRIDGE<br/>today · waiting · active · signals · ventures]
    WAR[THE WAR ROOM<br/>moves · ranking · stop]
    LIB[THE LIBRARY<br/>browse · search · module · Generate]
    BEA[BEACON<br/>Drafts · Approved · Scheduled · Published · Rejected]
    DASH[Room dashboards<br/>State · Orders · Crew · Files]
  end

  CONFIG -->|npm run vault:write| SYS
  CONFIG --> FACILITY & API & ENGINE
  NX -->|herald:index| HER
  HER -->|archives:sync| KN
  CC -->|/herald · herald:auto| HER
  HER -->|emit: files + rows| CON & CT & REC
  ENGINE --> DBC --> DB
  AH --> GEN
  AM --> KN
  AD --> CT
  AR --> AG & EV
  FA --> BRI & WAR & LIB & BEA & FLOOR
  LIB --> AM & AH
  BEA --> AD & AH
  BRI & WAR & DASH -->|the store| AS --> OS
  BRI --> AC
  FACILITY <-->|anon key, RLS| SY
  CT -->|vault:sync| CON
  OS -->|vault:sync| ORD & REC & KNO
  OB <--> BRAIN
  MEM -->|brief| HER
  DASH --> MEM & REC
```

## The core loop

```mermaid
sequenceDiagram
  participant M as Shared memory<br/>(03-Memory + Firestore)
  participant A as ARCANE (Commander)
  participant L as Leo
  participant C as Council (9 seats)
  participant O as Orders (06-Orders)
  participant H as Agent skill (e.g. HERALD)
  participant R as THE RECORDS (04-Records)

  M->>A: state, signals
  A->>M: writes the four-block brief<br/>STATE · SIGNALS · ORDERS · DOCTRINE
  alt Counsel
    L->>A: a question
    A-->>L: answer, or an order
  else Council
    L->>C: a real decision
    C-->>A: nine positions
    A-->>L: one verdict: BUILD / DELAY / WATCH / KILL + conditions
    A->>R: Decision record
  end
  A->>O: order routed to a room (crew walk toward it)
  alt Human action
    L->>M: does the thing, updates memory
  else Agent action
    O->>H: /skill run under the agent's grade
    H->>H: gate (lint) — refuse or proceed
    H->>M: output (e.g. draft in 02-Content)
    H->>R: Trace entry + Daily-Log line — before reporting
  end
  R->>M: daily rollup updates shared memory
```

## Where truth lives

| Question | Answer lives in | Why there |
| --- | --- | --- |
| Who are the agents and what may they do? | `packages/config` | Code the validator can refuse. Everything else is generated from it. |
| What is true right now? | `brain/03-Memory/Shared-Memory.md` (durable) + `arcane_sync` (stock, ledger, protocol, journal — until their rooms are built) | Durable wins on conflict; the facility re-syncs from the vault. |
| What is the floor working on, and what did Leo decide? | `orders`, `list_items`, `decisions`, `counsel_turns`, `venture_focus`, `goal_progress`, `days`; mirrored into `06-Orders`, `05-Knowledge/Lists.md`, `Focus.md`, `04-Records` by `vault:sync` | The rooms write tables through one registry; the Bridge aggregates them; the vault records them. |
| What happened? | `system_events` + `brain/04-Records/Trace/` | Append-only. No trace, no run. |
| What was produced, and where is it in its life? | `content_drafts` / `content_revisions`; mirrored to `brain/02-Content/` by `vault:sync` | The floor decides; the vault records. Only humans move a status; every change is a revision. |
| What did an agent do? | `agent_runs` | Objective, sources, output, usage, error, the device that asked. |
| What does the floor look like? | `apps/facility/src/config/floorplan.js` | Geometry and props are presentation; they import meaning from config. |
| What do the Archives contain? | the Obsidian vault → `data/archives` (regenerable) → `archive_modules` (searchable) | The vault is the source; the index is derived; the table is what the Library reads. |
| Who may call the API? | `ARCANE_OPERATOR_KEY` on the server, pasted once per browser | The site is public; the OS is not. A sync code is identity, not authority. |

## The permission model, in one paragraph

Seven grades, seven capabilities, nineteen agents, one matrix. `allow`
exists in the vocabulary so the matrix can state that nobody holds it.
`spend` is `deny` everywhere. Notion is `read-only` at the tool level, so
no grade can reach a Notion write. A skill is registered against an agent
and lists the folders it writes; the validator refuses a skill that writes
where its agent's grade does not reach. The Control Room renders the
matrix; the vault prints it; the validator enforces it; the runtime checks
it again before an act. Four places, one source.

## Attention routing (facility)

Each room has an *attention score*: open orders weighted by priority
(P0=8, P1=4, P2=2, P3=1), plus a commander-proximity bonus. Crew choose a
destination by sampling rooms proportional to score, with a strong prior
for their home station and a cooldown so they do not oscillate. Routing is
BFS over the corridor graph. The score is computed from `06-Orders` (via
Firestore mirror) so the floor is a picture of the work, not a screensaver.

## The Content Machine

`docs/CONTENT-MACHINE.md` has the pipeline step by step and
`docs/DATA-MODEL.md` the tables. In one line: the vault is indexed to
disk, the index is synced to Postgres, the Library reads Postgres, HERALD
writes from it through one engine (shared by the API and the CLI) behind
the lint gate, BEACON is where Leo decides, and `vault:sync` lands the
result back in the brain as the record.

## Deployment

- `apps/facility` → Vercel (static build; only the Supabase URL and anon key are injected, by name).
- `api/*.js` → Vercel functions on the same project, with `ANTHROPIC_API_KEY`, `ARCANE_OPERATOR_KEY` and the service-role key in the project environment. `vercel.json` includes `.claude/skills/herald/**` so the references ship with the functions, and allows 300 s for HERALD.
- Supabase: `supabase/migrations/*.sql` run in order in the SQL editor; `npm run db:check` reports the state.
- `brain/` → its own private GitHub repo (`arcane-brain`), synced by Obsidian Git on desktop and read by skills via `ARCANE_BRAIN`. Kept as a folder in this monorepo until the split (`git subtree split`).
- `packages/*` → published to nowhere; imported by path and by workspace symlink.
