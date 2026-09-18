# HERALD, constantly

HERALD makes content from the Arcane Archives in Leo's Obsidian vault and
lands it in the brain. Nothing in the Archives is ever edited: every run
**copies the source note first** into `02-Content/Sources/`, then cuts the
drafts from that copy. The vault is the truth for what was made and what
happened to it; the site is where it is read and decided on.

## The loop

```
Obsidian vault (Arcane ARCHIVES, read only)
   │  npm run herald:index          — index the notes; course hubs become subjects
   ▼
Archives-Sources.md                — the Allowed / Never gate (yours to edit)
   │  npm run herald:auto           — pick · copy the note · write five cuts (Claude API) · lint · emit · trace
   ▼
brain/02-Content/Drafts  +  content_drafts      — status: draft   (files for the record; rows so BEACON sees them at once, when the service key is in .env)
   ▼
arcaneaios.vercel.app  →  BEACON                — you edit, approve, reject, schedule, publish, regenerate; every change is a revision in the database
   │  npm run vault:sync                        — the database's drafts land in the vault as generated files, in their status folders
   ▼
brain/02-Content/{Drafts,Approved,Posted,Killed}   — the record

The same engine runs from the floor: Library → module → Generate
(docs/CONTENT-MACHINE.md). `auto.mjs` is the unattended pick-and-write
on this Mac; the prompt and the gate are shared.
```

## Run it

| Command | Does |
| --- | --- |
| `npm run herald:auto` | one run: one module, five formats, through the Claude API (`HERALD_MODEL`, default `claude-opus-5`) |
| `npm run herald:auto -- --push` | …then regenerate the board and exports, commit, push |
| `npm run herald:auto -- --lane sales --formats short,thread --count 2` | narrow it |
| `npm run herald:auto -- --dry` | stage and lint, do not emit |
| `npm run herald:auto -- --mock` | test the plumbing without the API |
| `npm run vault:sync` | bring the site's status changes into the vault |
| `npm run content:board` | regenerate `02-Content/Board.md` |
| `npm run herald:schedule install 3` | every 3 hours, on this Mac, via launchd (`uninstall`, `status`) |

Each scheduled firing: `git pull`, `vault:sync`, `herald:auto --push`.
Output in `data/herald-auto.log`. The gate (`lint.mjs`) never moves — a
draft that trips it is repaired once by the model, then dropped.

## Needs

- `ANTHROPIC_API_KEY` in `.env` with credits on the account.
- `SUPABASE_SERVICE_ROLE_KEY` in `.env` for `vault:sync` and for `emit.mjs` to land rows (from the Vercel integration's variables — `storage_SUPABASE_SERVICE_ROLE_KEY`; server-side only, never bundled). Without it, drafts land in the vault only and `vault:sync` imports them later.
- The vault at `ARCANE_VAULT` (default `~/Desktop/Arcane`) with the brain symlinked in as `ARCANE-AI-OS-v3`.
- GitHub push access from this Mac for `--push`.

## What it will not do

- Edit, move or delete anything in the Archives.
- Cut from a subject not under **Allowed** in `05-Knowledge/Archives-Sources.md`, or from anything under **Never**, or from reposted third-party pieces (lane `external`).
- Move a draft past `draft`. Only you do that.
- Emit more than 10 drafts in one run, or anything the gate refuses.
