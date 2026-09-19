# THE ARCANE — LEOOS v3

The operating system of the Arcane ventures, rendered as a facility you
can walk. Twenty rooms across four wings. Nineteen agents as pixel crew
who walk toward the work. One shared memory in an Obsidian vault. One
brief. Counsel and Council. Strict permission grades — no agent ever
holds `allow`. The first production skill is **HERALD**, the content
creator.

```
 C1 PRODUCTION │ C2 COMMAND     │ C3 KNOWLEDGE    │ C4 NETWORK & LIFE
 THE LAB       │ BRIDGE         │ INTELLIGENCE    │ THE AGENT GARAGE
 VITALS        │ THE WAR ROOM   │ THE OBSERVATORY │ THE CONTROL ROOM
 FORGE         │ THE COUNCIL    │ THE DEAL ROOM   │ THE INVENTOR'S ROOM
 THE MARKET    │ THE VAULT      │ THE LIBRARY     │ THE RECORDS
 BEACON        │ SCRIPTORIUM    │ THE LOUNGE      │ SANCTUM
```

## Quick start

```bash
npm install
npm run check           # the roster obeys the standing rules
npm run vault:write     # generate the brain's system cards
npm run herald:index    # index the Arcane Archives (the Obsidian vault, or ARCANE_ARCHIVES_EXPORT)
npm run dev:local       # the facility with the API on a dev database and a mock HERALD — no keys needed
```

Open the Library, pick a module, Generate content, decide in BEACON. For
the real thing: the migrations in `supabase/migrations`, the keys in
`.env` (see `.env.example`), `npm run archives:sync`, then `npm run dev`.
`docs/CONTENT-MACHINE.md` is the pipeline; `docs/SUPABASE.md` the set-up.

Open `brain/` in Obsidian. In Claude Code, `/herald` runs the same engine
from the terminal.

## Read next

- `docs/ARCHITECTURE.md` — how the facility, brain, agents and content pipeline connect
- `docs/CONTENT-MACHINE.md` — Archives → HERALD → BEACON, end to end
- `docs/DATA-MODEL.md` — the tables, the draft lifecycle, who may write what
- `docs/STRUCTURE.md` — why the repo is shaped this way
- `docs/SPRITES.md` — pixel direction: sizes, palette, animation
- `docs/PLAN.md` — the ten-day build order
- `docs/ARCHIVES.md` — the three ways the Archives are indexed, and the read-only guarantee
- `brain/CLAUDE.md` — the brain's own router
- `.claude/skills/herald/SKILL.md` — the HERALD skill

## Standing rules

No `allow`. No spend. Notion read-only. Zero medical claims. Nothing
publishes unattended. Every run traced. Generated files regenerated.
All seven are enforced by `npm run check` and the HERALD gate, not by prose.
