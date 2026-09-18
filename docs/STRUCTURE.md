# Repository structure

```
ARCANEAIOSMAIN/                    the monorepo (GitHub: the-arcane)
├── CLAUDE.md                      router for Claude Code in this repo
├── README.md
├── package.json                   workspaces + scripts (check, vault, herald:*, facility)
├── .env.example                   ARCANE_BRAIN, ARCANE_ARCHIVES_EXPORT, VITE_FIREBASE_*
│
├── packages/
│   ├── config/                    @arcane/config — THE single source of truth
│   │   └── src/
│   │       ├── agents.js          19 agents: call, room, tools, caps, asks, skills, sprite
│   │       ├── rooms.js           20 rooms: wing, resident, venture, brain folder, widgets, what a room opens
│   │       ├── wings.js           4 wings
│   │       ├── permissions.js     GRADES, CAPS, STANDING_RULES, holds()
│   │       ├── ventures.js        4 ventures + OPERATOR
│   │       ├── loop.js            BRIEF_BLOCKS, VERDICTS, ORDER/DRAFT states, DRAFT_TRANSITIONS, DRAFT_VIEWS
│   │       └── skills.js          skill registry (reads/writes per skill)
│   ├── database/                  @arcane/database — the runtime system of record (server-side only)
│   │   └── src/
│   │       ├── index.js           createDb(): PostgREST with the service key; errors name their migration
│   │       ├── content.js         modules · drafts · revisions · runs · events, as verbs
│   │       ├── state.js           the operating-state registry: orders · list_items · decisions · counsel · focus · goals · days
│   │       ├── bridge.js          aggregate(): today · waiting · active · ventures, from the tables
│   │       ├── memory.js          the in-memory twin (tests)
│   │       ├── dev.js             the dev database: real index + data/dev-db.json
│   │       └── modules-from-index.js   data/archives → archive_modules rows, with the gate
│   └── content-engine/            @arcane/content-engine — HERALD's core, shared by /api/herald and herald:auto
│       └── src/
│           ├── herald.js          systemPrompt · schema · writeDrafts · stageText · gate · lintEdit · generate
│           └── mock.js            the mock writer (explicit flag only)
│
├── api/                           Vercel functions — the only thing that touches the database
│   ├── _auth.js                   the operator gate (bearer key, constant-time)
│   ├── _lib.js                    db(), client(), systemContext()
│   ├── modules.js                 GET the Archives (search, one module, subjects)
│   ├── herald.js                  POST generate (module → drafts)
│   ├── drafts.js                  GET/PATCH drafts (move, edit — linted)
│   ├── runs.js                    GET runs, events, schema state
│   ├── state.js                   GET/POST/PATCH/DELETE the operating state through the registry
│   ├── bridge.js                  GET the Bridge aggregate
│   ├── counsel.js · council.js    the reasoning layer
│
├── supabase/migrations/           0001 (unused) · 0002 arcane_sync · 0003 the Content Machine · 0004 the operating state
│
├── tools/
│   ├── validate-config.mjs        refuses a roster that breaks a standing rule
│   ├── vault-gen.mjs              generates 01-System + knowledge cards into the brain
│   ├── archives-sync.mjs          index → archive_modules, incremental
│   ├── db-check.mjs               which migrations the database has had
│   ├── dev-api.mjs                api/*.js on a port, for npm run dev
│   ├── vault-sync.mjs             the floor → the vault (drafts mirrored from the database)
│   ├── content-machine.test.mjs   the engine, the gates and the status machine, headless
│   ├── operating-state.test.mjs   the registry, the Bridge aggregate and the vault mirror, headless
│   └── lib/
│       ├── brain.mjs              vault path, frontmatter, generated-file guard, trace()
│       ├── state.mjs              the sync rows, folded
│       ├── content-mirror.mjs     database ↔ vault for drafts
│       └── state-mirror.mjs       database ↔ vault for orders, lists, focus, decisions, counsel
│
├── brain/                         the Obsidian vault  (→ its own private repo on day 3)
│   ├── CLAUDE.md                  master router for any agent opening the vault
│   ├── 00-Inbox/
│   ├── 01-System/                 Doctrine (hand) + generated: Agents/, Rooms/, matrix, tools, skills
│   ├── 02-Content/                Drafts/ Approved/ Posted/ Killed/ + Content-Log.md
│   ├── 03-Memory/                 Shared-Memory.md · Brief.md · Signals.md
│   ├── 04-Records/                Trace/ · Daily-Log/ · Decisions/ · Decision-Log.md
│   ├── 05-Knowledge/              Facility · Ventures · Goals · Operator · Archives-Map
│   ├── 06-Orders/                 Orders.md
│   ├── 99-Templates/              one template per file type
│   └── .obsidian/                 app, core-plugins, templates, daily-notes (workspace ignored)
│
├── .claude/
│   └── skills/
│       └── herald/                the first production skill
│           ├── SKILL.md           router (82 lines)
│           ├── references/        voice · formats · compliance · frontmatter · archives-map · pipeline
│           ├── templates/         short · medium · thread · email · teaser
│           ├── scripts/           lib · index-archives · pick · lint · emit
│           └── evals/evals.json
│
├── data/
│   └── archives/                  gitignored, regenerable: index.json + modules/*.txt
│
├── apps/
│   └── facility/                  Vite + vanilla ESM + canvas → Vercel
│       ├── index.html
│       ├── vite.config.js
│       └── src/
│           ├── main.js               routes: #  #room/<id>  #bridge  #warroom  #library[/<module>]  #beacon[/<view>|/draft/<id>]  #journal  #graph
│           ├── config/floorplan.js   geometry only; meaning imported from @arcane/config
│           ├── core/                 store (server tables + the blob) · cloud + sync (the sync row) · operator (the key) · api (the client) · reason · sim · vigil
│           └── render/               factory · props · sprites (the world) · panel · widgets · bridge · warroom · library · beacon · journal · graph (the work)
│
└── docs/
    ├── ARCHITECTURE.md            the diagrams
    ├── CONTENT-MACHINE.md         Archives → HERALD → BEACON, end to end
    ├── DATA-MODEL.md              the tables and the lifecycle
    ├── SUPABASE.md                set-up, keys, the operator key
    ├── HERALD-AUTO.md             the unattended run
    ├── SPRITES.md                 pixel direction
    ├── STRUCTURE.md               this file
    └── PLAN.md                    the plan and what is done
```

## Why it is shaped this way

**Config is a package, not a folder of JSON.** It is JavaScript so the
facility imports it at build time, the vault generator imports it at
generate time, and the validator can run logic over it. One import path,
three consumers, zero drift.

**The brain is in the Obsidian vault by symlink.** `~/Desktop/Arcane/ARCANE-AI-OS-v3 → repo/brain`, so Obsidian indexes it beside the Archives pages and git tracks the same files. `tools/vault-graph.mjs` reads the whole vault (`ARCANE_VAULT`) and ships its link graph as `apps/facility/public/graph.json`, committed because the vault is local.

**The brain is a folder that can leave.** Every writer reaches it through
`brainDir()` and `ARCANE_BRAIN`. Keeping it inside the monorepo for the
first days makes the loop testable in one checkout; moving it to its own
private repo (`git subtree split -P brain -b brain-main`) is a one-line
change to `.env`. Vercel then never rebuilds because a note changed, and
Obsidian Git syncs the vault on its own cadence.

**Skills live where Claude Code looks.** `.claude/skills/<id>/SKILL.md` is
what makes `/herald` work in the terminal, Cursor and the desktop app.
The registry in `packages/config/src/skills.js` is what makes the facility
and the vault know the skill exists. A skill is both, always.

**Data is derived and ignored.** `data/archives` is nine megabytes of
extracted text that rebuilds in one second. It is never committed; the
small map it produces is.

**Secrets never enter the tree, and the database is never in the bundle.**
`.gitignore` refuses `.env` and any service-account file. The facility
build reads the Supabase URL and anon key by exact name and nothing else;
`packages/database` is imported only by `api/` and `tools/`, and CI greps
the bundle for a service key on every push.

## Separate repos, eventually

| Repo | Contents | Sync |
| --- | --- | --- |
| `the-arcane` | this monorepo minus `brain/` | GitHub → Vercel |
| `arcane-brain` | the vault | Obsidian Git (desktop) · `git pull` before a skill run (`npm run brain:pull`, day 3) |
