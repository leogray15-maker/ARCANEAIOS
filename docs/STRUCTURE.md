# Repository structure

```
ARCANEAIOSMAIN/                    the monorepo (GitHub: the-arcane)
├── CLAUDE.md                      router for Claude Code in this repo
├── README.md
├── package.json                   workspaces + scripts (check, vault, herald:*, facility)
├── .env.example                   ARCANE_BRAIN, ARCANE_ARCHIVES_EXPORT, VITE_FIREBASE_*
│
├── packages/
│   └── config/                    @arcane/config — THE single source of truth
│       └── src/
│           ├── agents.js          19 agents: call, room, tools, caps, asks, skills, sprite
│           ├── rooms.js           20 rooms: wing, resident, venture, brain folder, widgets
│           ├── wings.js           4 wings
│           ├── permissions.js     GRADES, CAPS, STANDING_RULES, holds()
│           ├── ventures.js        4 ventures + OPERATOR
│           ├── loop.js            BRIEF_BLOCKS, VERDICTS, ORDER/DRAFT states
│           └── skills.js          skill registry (reads/writes per skill)
│
├── tools/
│   ├── validate-config.mjs        refuses a roster that breaks a standing rule
│   ├── vault-gen.mjs              generates 01-System + knowledge cards into the brain
│   └── lib/brain.mjs              vault path, frontmatter, generated-file guard, trace()
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
│           ├── main.js
│           ├── config/floorplan.js   geometry only; meaning imported from @arcane/config
│           ├── core/                 store · cloud (Firestore) · routing · sim
│           └── render/               factory · tiles · props · sprites · ui · panels
│
├── firebase/                      firestore.rules · firestore.indexes.json (day 8)
└── docs/
    ├── ARCHITECTURE.md            the diagrams
    ├── SPRITES.md                 pixel direction
    ├── STRUCTURE.md               this file
    └── PLAN.md                    the 10-day plan
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

**Secrets never enter the tree.** `.gitignore` refuses `.env`, any
`*service-account*.json`, and `serviceAccountKey.json`. The facility gets
public `VITE_` Firebase config only; anything privileged lives in a Vercel
function later.

## Separate repos, eventually

| Repo | Contents | Sync |
| --- | --- | --- |
| `the-arcane` | this monorepo minus `brain/` | GitHub → Vercel |
| `arcane-brain` | the vault | Obsidian Git (desktop) · `git pull` before a skill run (`npm run brain:pull`, day 3) |
