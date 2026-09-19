# THE ARCANE — LEOOS v3

An agentic operating system rendered as a facility you can walk. Twenty
rooms, four wings, nineteen agents, one operator (Leo), one brain.

This file routes Claude Code. The brain has its own router at
`brain/CLAUDE.md` — read that before touching anything in `brain/`.

## Where things are

| Need | Go to |
| --- | --- |
| The roster, rooms, grades, loop vocabulary | `packages/config/src/` — **the single source of truth** |
| The rules that are enforced (not just written) | `tools/validate-config.mjs` — run `npm run check` |
| The brain (Obsidian vault) | `brain/` — router at `brain/CLAUDE.md` |
| Regenerate the brain's system cards | `npm run vault` (dry) · `npm run vault:write` |
| The brief and live signals | `npm run brief` — Brief.md is generated; change what it reads |
| The floor's state back into the vault | `npm run vault:sync` — needs the service key in `.env` |
| HERALD, the content skill | `.claude/skills/herald/SKILL.md` — invoke `/herald` |
<<<<<<< HEAD
| HERALD's engine (shared by the API and the CLI) | `packages/content-engine/src/herald.js` |
| The Archives index | `npm run herald:index` → `data/archives/` (gitignored) → `npm run archives:sync` → Postgres |
| The database (tables, verbs, migrations) | `packages/database/`, `supabase/migrations/`, `docs/DATA-MODEL.md` — `npm run db:check` |
| The floor's operating state (orders, moves, decisions, focus, the day) | `packages/database/src/state.js` (the registry) · `api/state.js` · the store's server rung in `apps/facility/src/core/store.js` |
| The Bridge's picture | `packages/database/src/bridge.js` — one aggregate for `api/bridge.js` and `tools/brief.mjs` |
| THE LAB's arithmetic (cost per vial, margin, stock, COA) | `apps/facility/src/core/lab.js` — pure; the floor, the aggregate and the mirror all import it |
| THE VAULT's arithmetic (revenue by month, runway, the split) | `apps/facility/src/core/money.js` — the same pattern; `journal.js` for trades |
| What each room does, and which are real | `docs/ROOMS.md` |
| The API (the only thing that touches the database) | `api/*.js` — operator key on every call (`api/_auth.js`) |
| The Content Machine, end to end | `docs/CONTENT-MACHINE.md` |
=======
| The Archives index | `npm run herald:index` → `data/archives/` (gitignored) · `docs/ARCHIVES.md` |
>>>>>>> 76fa0ba54f36debeacc6b8669ca3ea880c702848
| Architecture, sprites, structure, plan | `docs/` |
| The facility app | `apps/facility/` — `npm run dev` (with the API) · `npm run dev:local` (no keys needed) |

## Standing rules (enforced in code — do not work around them)

1. No agent holds `allow`. 2. Spend is `deny` for the whole network.
3. Notion is read-only. 4. Zero medical/dosing claims. 5. Nothing
publishes unattended. 6. Every run is traced. 7. Generated files are
regenerated, never edited.

If a task needs one of these to bend, stop and say so. Do not edit
`validate-config.mjs`, the lint patterns in `herald/scripts/lib.mjs`, or a
`generated: true` file to make something pass.

## How to change things

- **Add or change an agent, room, grade, tool, skill** → edit `packages/config/src/*`, run `npm run check`, then `npm run vault:write`. Never edit `brain/01-System/Agents/*.md` directly.
- **Add a skill** → `.claude/skills/<id>/SKILL.md` + register in `packages/config/src/skills.js` (agent, room, reads, writes). `npm run check` verifies the skill cannot out-rank its agent.
- **Write into the brain from a script** → go through `tools/lib/brain.mjs` (`brainDir()`, `writeGenerated()`, `trace()`). Never `fs.writeFileSync` into `brain/` directly.
- **Change the floor's geometry or props** → `apps/facility/src/config/floorplan.js` and `render/`. Room *meaning* stays in `packages/config`.
- **Change a table** → write the next `supabase/migrations/000N_*.sql` (idempotent), never the dashboard by hand; add the verb in `packages/database/src/content.js`; the API route in `api/`; never let the browser reach the database directly.
- **Add operating state a room edits** (a list, a table of things Leo types) → a table in the next migration, its entry in the registry in `state.js` (columns, validators, defaults), the store methods that call `api.state`, and its mirror in `tools/lib/state-mirror.mjs`. Not a new key in the blob.
- **Change how a draft may move** → `DRAFT_TRANSITIONS` / `DRAFT_VIEWS` in `packages/config/src/loop.js`; BEACON and the API both read it.
- **Change HERALD's voice or gate** → `references/*.md` (voice) or, for the gate, stop: the lint patterns are a standing rule.
- **Add a room application** → `apps/facility/src/render/<room>.js` with `render<Room>` / `bind<Room>`, a route in `main.js`, and `opens: '#<room>'` on the room in `rooms.js`. Data comes through `core/api.js`, never a second store.

## Commands

```
npm run check          validate the config against the standing rules
npm test               check + HERALD lint self-test
npm run vault:write    regenerate the brain's generated cards
npm run brief          ARCANE writes 03-Memory/Brief.md + VIGIL's live signals (from the vault, and the floor if the service key is in .env)
npm run vault:sync     bring the floor's state into the vault (drafts from the database, orders, lists, protocol, journal, decisions, counsel), then the brief
npm run archives:sync  put the Archives index into the database (incremental; needs the service key)
npm run products:import  put the Peptides catalogue (data/peptides/catalog.json, local) into the database; keeps what Leo has typed
npm run db:check       which migrations the database has had
npm run dev            the facility with the API (tools/dev-api.mjs) — the production loop on a laptop
npm run dev:local      the same with the dev database and mock HERALD — no keys needed
npm run herald:index   index the Archives export
npm run herald:pick    choose source modules  (-- --lane mindset --count 3 | --show <id>)
npm run herald:lint    gate the staged drafts
npm run herald:emit    land the batch and log the run
npm run facility       dev server for the facility
```

## Voice in this repo

Comments explain *why*, in plain sentences. Commit messages say what
changed and what it means, one line, no prefixes. No emojis anywhere in
code, docs or the brain.
