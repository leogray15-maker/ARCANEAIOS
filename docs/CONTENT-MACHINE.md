# The Content Machine

The Arcane Archives in, post-ready drafts out, nothing published without
Leo. This document is the pipeline end to end: where each step runs, what
it reads, what it writes, and what refuses.

```
Obsidian vault  ~/Desktop/Arcane/Arcane ARCHIVES     (a Notion export; read-only, 1,342 notes)
      │
      │  npm run herald:index                        .claude/skills/herald/scripts/index-archives.mjs
      ▼
data/archives/index.json + modules/*.txt             1,139 usable modules, lanes, sensitivity flags  (gitignored)
      │
      │  npm run archives:sync                       tools/archives-sync.mjs — hash-compared, only changes written
      ▼
archive_modules  (Supabase)                          KNOWLEDGE: title, subject, lane, gate, text, full-text search
      │
      │  GET /api/modules                            api/modules.js — operator key required
      ▼
THE LIBRARY  #library                                apps/facility/src/render/library.js
      │        browse · search · open · "Generate content"
      │  POST /api/herald { module_id, formats }     api/herald.js (up to 300 s)
      ▼
packages/content-engine                              herald.js: one Claude call → JSON drafts → lint gate → one repair → land
      │        lint = .claude/skills/herald/scripts/lint.mjs (the same patterns the CLI uses; never copied)
      ▼
content_drafts + content_revisions + agent_runs + system_events        CONTENT · AGENTS · RECORDS
      │
      │  GET/PATCH /api/drafts                       api/drafts.js
      ▼
BEACON  #beacon                                      apps/facility/src/render/beacon.js
      │        Drafts · Approved · Scheduled · Published · Rejected
      │        edit (linted) · approve · reject · schedule · publish · regenerate · alternate take · copy · history
      │
      │  npm run vault:sync                          tools/vault-sync.mjs → tools/lib/content-mirror.mjs
      ▼
brain/02-Content/{Drafts,Approved,Posted,Killed}     the durable record, one generated file per draft, Board.md, Content-Log.md
```

## Where truth lives

| Thing | Truth | Mirror |
| --- | --- | --- |
| A module's text | the Obsidian vault (Notion export) | `data/archives` → `archive_modules` |
| Which subjects HERALD may cut from | `brain/05-Knowledge/Archives-Sources.md` (Allowed / Never) | `archive_modules.gate` at sync time |
| A draft, its status, its revisions | `content_drafts` / `content_revisions` | `brain/02-Content/*` (generated files) |
| A run | `agent_runs` | `04-Records/Trace` (CLI runs write both) |
| What happened | `system_events` (append-only) | — |

Before this, the vault was the truth for drafts and the site could only
mark a status into a JSON blob. That is inverted now: the floor writes to
Postgres, and the vault follows. The reason is simple — Vercel functions
cannot write to a git repo, and Leo needs to approve from any device.

## The two ways HERALD runs

**From the floor.** Library → module → Generate. `api/herald.js` reads the
module from the database, calls `generate()` in `packages/content-engine`,
and lands drafts directly. The run is in `agent_runs` with the device that
asked; nothing touches the vault until `vault:sync`.

**From the terminal.** `/herald` (the skill, by hand) or `npm run
herald:auto` (unattended). Both stage Markdown, lint, and `emit.mjs` lands
the files in `02-Content/Drafts` with the Trace entry — and, when the
service key is in `.env`, the same rows in the database so BEACON shows
them at once. `auto.mjs` writes with the engine's `writeDrafts()`, so the
prompt, the schema and the references are one set in one place.

Both paths share: `systemPrompt()` (voice.md, formats.md, compliance.md),
the JSON schema, `stageText()` (the frontmatter contract), and `lintText()`.

## Provenance

Every draft carries: `module_id` (→ `archive_modules`), `source_module`,
`source_subject`, `source_ref` (the index id), `source_url` (Notion),
`source_note` (the Obsidian wikilink), `angle`, `run_id`, `model`,
`parent_id` (when regenerated or varied from another draft), `revision`,
`created_at`, and the lifecycle stamps. The Library shows what has been
cut from a module; BEACON links back to the module.

## The gates, in order

1. **Source gate** — `archive_modules.gate`: `never` (and lane `external`)
   is refused by the API outright; `open` needs the operator to tick
   "cut from it anyway"; `allowed` just goes. Edit the lists in
   `Archives-Sources.md`, run `archives:sync`.
2. **Compliance gate** — `lint.mjs`. HARD patterns (dose units, dosing
   verbs, named compounds, medical framing, claim-verb + condition,
   guaranteed returns) refuse a draft; the engine asks the model to repair
   once; what still fails is dropped and named in the run and on the
   Library panel. WARN patterns land in `compliance_notes` and show as a
   `note` chip in BEACON. The same lint runs on every edit Leo saves.
3. **Status gate** — `DRAFT_TRANSITIONS` in `packages/config/src/loop.js`.
   The API refuses any move not in the map; BEACON only draws buttons for
   moves in the map; `npm run check` proves the map is closed.
4. **Operator gate** — `api/_auth.js`. Every call needs the bearer key.

## Running it locally

```
npm run dev:local          # dev database (real modules from data/archives, content in data/dev-db.json) + mock HERALD + Vite
npm run dev                # same, against Supabase and the real API key from .env
```

Set `ARCANE_OPERATOR_KEY` in `.env` first; paste the same value into the
DEVICE control in the bar (or the prompt any room shows). `npm run
herald:index` once so the dev database has modules.

Mock HERALD (`HERALD_MOCK=1`) cuts the module's own sentences into the
five shapes; its drafts are titled MOCK and carry `model: mock`. It exists
to prove the plumbing when there are no credits. It never runs on Vercel.

## Formats

short 30–120 · medium 120–350 · thread 150–500 (5–9 posts ≤ 280 chars) ·
email 180–450 (Subject / Preview / body / Leo) · teaser 20–60. Specs in
`.claude/skills/herald/references/formats.md`; ranges enforced by the lint.

## What is not built yet

- Scheduling and publishing integrations. `scheduled` and `posted` are
  marks Leo makes; nothing posts anywhere.
- A Notion API source. The vault export is the source; `archives-sync`
  would take Notion rows through the same `moduleRows → upsert` path.
- Performance feedback (what a post did). `published_url` is stored; that
  is the hook for it.
- Semantic search / related modules. Full-text search is Postgres
  `websearch_to_tsquery` over title, subject and body.
