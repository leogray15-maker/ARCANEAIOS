# Implementation plan — the first ten days

Foundations first, then the loop, then the floor. Every day ends with
`npm test` green and something visible in either Obsidian or the browser.
Dates assume a start of 2026-09-17.

## Done today (2026-09-16)

- [x] Monorepo skeleton, workspaces, scripts, gitignore, env example
- [x] `packages/config` — 19 agents, 20 rooms, 4 wings, grades, loop vocabulary, skill registry
- [x] `tools/validate-config.mjs` — refuses `allow`, any spend, Notion writes, skill over-reach
- [x] `brain/` — master router, doctrine, templates, memory, brief, orders, records, Obsidian config
- [x] `tools/vault-gen.mjs` — 45 generated cards, guarded, idempotent
- [x] HERALD — SKILL.md, six references, five templates, four scripts, 13/13 lint self-tests
- [x] Archives indexed: 43 subjects, 1,073 modules, 316 gated
- [x] First real run: `HER-R-20260916-001`, five drafts in `02-Content/Drafts`, traced

## Day 1 · Thu 17 — Brain in Obsidian, HERALD in the hand

- Open `brain/` as a vault in Obsidian; confirm templates, daily notes, graph.
- Read the five drafts. Move one to `review`, kill one. Confirm status is the truth.
- `/herald` from Claude Code three times: a random set, `--lane sales` shorts, a named health subject (expect the gate to bite at least once).
- Tune `references/voice.md` against what Leo actually changes in the drafts.
- **Ship:** `git init`, first commit, private GitHub repo `the-arcane`.

## Day 2 · Fri 18 — The brief and the trace as daily habit

- `tools/brief.mjs`: assembles `03-Memory/Brief.md` from Shared-Memory, Signals, Orders, Doctrine (ARCANE's first script). Run it each morning.
- `tools/status-sweep.mjs`: moves draft files between `Drafts/Approved/Posted/Killed` to match their `status`; rolls counts into Shared-Memory.
- HERALD eval pass: run `evals/evals.json` prompts, review outputs, tighten SKILL.md.
- **Ship:** a morning: brief → `/herald` → review in Obsidian → sweep, without touching code.

## Day 3 · Sat 19 — Split the brain, wire sync

- `git subtree split` → private repo `arcane-brain`; `ARCANE_BRAIN` points at the clone.
- Obsidian Git plugin on desktop; `npm run brain:pull` / `brain:push` scripts for skill runs.
- `firebase/firestore.rules`: operator-only auth; collections `state`, `orders`, `presence`.
- `tools/memory-sync.mjs`: pushes Shared-Memory counts + open orders to Firestore (one-way, vault → cloud, for now).
- **Ship:** the brain lives on its own; a run on the laptop shows up in Firestore.

## Day 4 · Sun 20 — Facility shell

- `apps/facility`: Vite, vanilla ESM, 960×640 buffer, integer blit, FIT/2x/3x, drag-pan.
- `floorplan.js`: 20 room rects at v3 scale, doors, corridors, hall; BFS graph with a reachability test.
- Rooms render as wall/floor/door with the services layer and signs, from `@arcane/config` names.
- Deploy to Vercel (empty rooms, correct building).
- **Ship:** the building on a URL.

## Day 5 · Mon 21 — Sprites

- Author the 12×20 crew base (front/back/side × stand/A/B/work×2/talk) and ARCANE 14×24.
- Sprite baker: palette per agent from config; `tools/sprite-sheet.mjs` renders a review PNG.
- Crew placed at home stations, idle bob, ARCANE on the Bridge.
- **Ship:** nineteen distinct figures standing in the right rooms.

## Day 6 · Tue 22 — Movement and attention

- Attention score per room from orders (Firestore mirror, vault fallback). Sampling with home prior and cooldown.
- Walk cycles along the corridor graph; arrival → face anchor → `work` frames.
- Click a room → ARCANE walks there; door ping when a room's score rises.
- **Ship:** a floor that reflects `06-Orders`. Add an order, watch someone walk.

## Day 7 · Wed 23 — Props, light, wear

- 14–24 props per room from the anchor table in `docs/SPRITES.md`, three-tone with shadows.
- Light emitters (screens, cold store, Beacon lamp, Sanctum window). Seeded wear per room.
- Three ambient motions: Beacon lamp, Observatory stars, Lab frost.
- **Ship:** screenshots that beat v2's best.

## Day 8 · Thu 24 — Dashboards

- The four-section frame (State · Orders · Crew · Files) for all 20 rooms.
- Files section reads the room's brain folder (via a small JSON export of the vault, `tools/vault-export.mjs`, run on push).
- BEACON: draft queue with status chips reading real frontmatter. THE RECORDS: today's Trace. BRIDGE: the brief. THE CONTROL ROOM: the matrix from config.
- **Ship:** click BEACON, see today's drafts.

## Day 9 · Fri 25 — Counsel

- Vercel function `api/counsel`: Leo ↔ ARCANE over the brief, Claude behind `ANTHROPIC_API_KEY`, no tools, no writes. Answers or proposes an order.
- Counsel panel in the Bridge dashboard; proposed orders land in `06-Orders` as `review`.
- **Ship:** ask the network a question from the floor.

## Day 10 · Sat 26 — Council + hardening

- `api/council`: one structured call, nine positions, one verdict; writes a Decision record via the vault export path (or queues it for the next pull).
- CI: `npm test` + `vault-gen` dry-run diff on every push; refuse merge if the vault would change without a config change.
- Review the week: what HERALD produced, what posted, what the floor showed. Write the first Sunday review into `04-Records/Decisions`.
- **Ship:** v3.0 tagged.

## After

Second skill (ORACLE: PDF products from modules, or VIGIL: signals from
the ventures' data). Two-way Firestore ↔ vault. Mobile view. Sound.
