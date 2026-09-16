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
    NX[Arcane Archives<br/>Notion export on disk]
    NC[Notion connector<br/>read tools only]
  end

  subgraph FACILITY["apps/facility — Vite, canvas, Vercel"]
    FLOOR[Floor: 20 rooms, props, sprites]
    ROUTE[Attention routing<br/>crew → open orders + commander]
    DASH[Room dashboards<br/>State · Orders · Crew · Files]
  end

  subgraph LIVE["Firebase — live state"]
    FS[(Firestore<br/>positions · open orders · presence)]
    AU[Auth]
  end

  CONFIG -->|npm run vault:write| SYS
  CONFIG --> FACILITY
  CONFIG --> SKILLS
  NX -->|herald:index| HER
  NC -.->|one page, when stale| HER
  HER -->|drafts + logs| CON
  HER -->|Trace, Daily-Log| REC
  HER -->|Archives-Map| KNO
  HER -->|counts| MEM
  MEM -->|brief| HER
  CC -->|/herald| HER
  OB <--> BRAIN
  FA <--> FACILITY
  FACILITY <-->|sync| FS
  AU --> FS
  BRAIN -->|git sync| FACILITY
  ROUTE --> ORD
  DASH --> CON & MEM & REC
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
| What is true right now? | `brain/03-Memory/Shared-Memory.md` (durable) + Firestore (live) | Durable wins on conflict; the facility re-syncs from the vault. |
| What happened? | `brain/04-Records/Trace/` | Append-only. No trace, no run. |
| What was produced? | `brain/02-Content/` | Frontmatter status is the lifecycle; only humans move it. |
| What does the floor look like? | `apps/facility/src/config/floorplan.js` | Geometry and props are presentation; they import meaning from config. |
| What do the Archives contain? | `data/archives/index.json` (regenerable) + `brain/05-Knowledge/Archives-Map.md` | Index is big and derived; the map is small and committed. |

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

## Deployment

- `apps/facility` → Vercel (static build, `VITE_*` public Firebase config).
- `brain/` → its own private GitHub repo (`arcane-brain`), synced by
  Obsidian Git on desktop and read by skills via `ARCANE_BRAIN`. Kept as a
  folder in this monorepo until day 3, then split (`git subtree split`).
- `packages/config` → published to nowhere; imported by path. Vercel builds
  the facility with it; skills import it relative to the repo.
- Firestore rules: authenticated operator only; agents never hold a service
  account in the browser. Server-side reasoning (Counsel/Council) comes
  later behind a Vercel function with `ANTHROPIC_API_KEY`.
