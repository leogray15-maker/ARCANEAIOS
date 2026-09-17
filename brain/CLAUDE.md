# THE ARCANE — Brain

> This vault is the persistent memory of THE ARCANE (LEOOS v3).
> You are reading the master router. Read it fully before you touch a file.
> Version 3.0 · Operator: Leo · Commander: ARCANE

## Where this lives

This folder is the repo's `brain/` and is also inside Leo's Obsidian vault
(`~/Desktop/Arcane`) as `ARCANE-AI-OS-v3`, by symlink — one vault holding
the Arcane Archives pages, the healing and peptide notes, and this brain,
so a draft's `source_note` links straight to the Archives page it was cut
from and the whole thing is one graph. `npm run vault:graph` exports that
graph for the facility's Brain Graph view.

## What this is

One brain, shared by one human and nineteen agents. Everything the network
knows, decided, produced or is waiting on lives here as plain Markdown so
that a human in Obsidian and an agent in Claude Code read the same page.

Firestore carries *live* state (who is where on the floor, what is open this
second). This vault carries *durable* state (what is true, what was decided,
what was produced, and why). When they disagree, the vault wins and the
facility re-syncs from it.

## The map

| Folder | Owner (room · agent) | What lives here | Who writes |
| --- | --- | --- | --- |
| `00-Inbox/` | THE INVENTOR'S ROOM · SPARK | Anything unsorted. Ideas, pastes, voice notes. | Human, any agent |
| `01-System/` | THE CONTROL ROOM · WARDEN | Doctrine, permission matrix, tools, agent and room cards, skills. | **Generated** from `packages/config` — do not hand-edit generated files |
| `02-Content/` | BEACON · HERALD | Content drafts and their lifecycle. `Drafts/` is the landing zone. | HERALD (drafts only), human (moves status) |
| `03-Memory/` | BRIDGE · ARCANE | Shared memory, the current four-block brief, signals. | ARCANE, VIGIL, human |
| `04-Records/` | THE RECORDS · RELIC | Trace (every run), daily log, decisions. | Every agent appends; nobody edits history |
| `05-Knowledge/` | THE LIBRARY · ORACLE | Facility, ventures, goals, operator, the Archives map. | ORACLE, HERALD (Archives map), human |
| `06-Orders/` | BRIDGE · ARCANE | The open-orders board. | ARCANE, human |
| `99-Templates/` | — | The shape of every file type. Copy, never edit in place. | Human |

## Standing rules

These are enforced in `packages/config` by `tools/validate-config.mjs`, and
again by every skill before it writes. They are repeated here so an agent
that opens only this vault still knows them.

1. **No agent holds `allow`.** Nothing executes unattended.
2. **Spend is `deny` for the entire network**, commander included. Money moves by Leo's hand.
3. **Notion is read-only.** The Archives are a source, never a target. No agent creates, updates or moves a Notion page.
4. **Zero medical, dosing or treatment claims** — about any compound, protocol or condition, to anyone.
5. **Nothing publishes unattended.** A draft waits in `02-Content/Drafts` until a human changes its `status`.
6. **Every run writes a Trace entry** into `04-Records/Trace/` before it reports success. No trace, no run.
7. **Generated files are regenerated, not edited.** Anything with `generated: true` in its frontmatter comes from config. Change the config, run `npm run vault:write`.

## How an agent works in here

1. **Read the brief.** `03-Memory/Brief.md` — four blocks: VENTURES, MONEY, GOALS, ROOMS. Signals are in `03-Memory/Signals.md`, doctrine in `01-System/Doctrine.md`. If it is older than a day, say so before acting on it.
2. **Read your card.** `01-System/Agents/<NAME>.md` — your domain, tools, grades, and what you must ask before doing.
3. **Check your grade** for the act you are about to perform. `draft` means produce and stop. `approval` means ask, then do. `deny` means do not.
4. **Do the work** using your skill's procedure (`01-System/Skills.md` lists them).
5. **Write into only the folders your skill is registered to write.** Use the template in `99-Templates/` for the file type. Frontmatter is not optional.
6. **Append a Trace entry** (`99-Templates/Trace-Entry.md`) to today's file in `04-Records/Trace/`. Then, and only then, report.
7. **Never delete.** Move a file to `Killed/` or set `status: killed`. History is append-only.

## File conventions

- Filenames: `YYYY-MM-DD` for dated logs; `<PREFIX>-<YYYYMMDD>-<NNN>-<format>-<slug>.md` for produced artefacts (HERALD uses `HER`).
- Every file has YAML frontmatter with at least `type`, `created`, `updated`, `status`, `agent`, `tags`.
- Dates are ISO 8601 with time where it matters: `2026-09-16 21:45`.
- Wiki-links `[[Like This]]` between notes. Agents are `[[HERALD]]`, rooms are `[[BEACON]]`.
- Money in GBP, `£1,280`. Numbers are numbers, never "a lot".

## The core loop

```
shared memory (03-Memory + Firestore)
      │
      ▼
four-block brief (03-Memory/Brief.md — VENTURES · MONEY · GOALS · ROOMS — ARCANE writes it)
      │
      ├── Counsel: Leo ↔ ARCANE (+ one specialist)  → answer or order
      └── Council: nine seats, one verdict           → 04-Records/Decisions/
      │
      ▼
order (06-Orders/Orders.md — routed to a room; crew walk toward open orders)
      │
      ▼
action — human, or an agent under its grade (a skill run)
      │
      ▼
trace (04-Records/Trace/YYYY-MM-DD.md) → daily log → shared memory updated
```

## Where things are

- Current brief → `03-Memory/Brief.md`
- What is true right now → `03-Memory/Shared-Memory.md`
- What changed → `03-Memory/Signals.md`
- Open work → `06-Orders/Orders.md`
- Content waiting for approval → `02-Content/Drafts/`
- Every draft ever made → `02-Content/Content-Log.md`
- What happened today → `04-Records/Daily-Log/YYYY-MM-DD.md`
- Every run, in order → `04-Records/Trace/YYYY-MM-DD.md`
- Why we decided X → `04-Records/Decisions/`
- The roster and the matrix → `01-System/Agents/`, `01-System/Permission-Matrix.md`
- The Archives, mapped → `05-Knowledge/Archives-Map.md`

## Skills registered

See `01-System/Skills.md`. As of v3.0 the production skill is **HERALD** (`/herald`),
which reads the Archives and lands drafts in `02-Content/Drafts/`.
