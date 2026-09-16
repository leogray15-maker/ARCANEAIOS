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
| HERALD, the content skill | `.claude/skills/herald/SKILL.md` — invoke `/herald` |
| The Archives index | `npm run herald:index` → `data/archives/` (gitignored) |
| Architecture, sprites, structure, plan | `docs/` |
| The facility app | `apps/facility/` — `npm run facility` |

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

## Commands

```
npm run check          validate the config against the standing rules
npm test               check + HERALD lint self-test
npm run vault:write    regenerate the brain's generated cards
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
