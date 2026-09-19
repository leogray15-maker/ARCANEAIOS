# The Archives — where HERALD's source text comes from

The Arcane Archives are ~1,300 pages across ~200 subjects. HERALD does not
read them at run time; it reads an **index** built from them:

```
data/archives/index.json        metadata for every module   (gitignored)
data/archives/modules/<id>.txt  clean text per module       (gitignored)
brain/05-Knowledge/Archives-Map.md  the subject map         (generated, committed)
```

Rebuild it with `npm run herald:index`. The index is derived — deleting it
costs nothing but the time to rebuild.

## Three sources, one index

| `--from` | Reads | Needs | Use when |
| --- | --- | --- | --- |
| `vault` (default when present) | `<ARCANE_VAULT>/Arcane ARCHIVES/*.md` | the Obsidian vault | on Leo's Mac |
| `export` | the Notion HTML export on disk | `ARCANE_ARCHIVES_EXPORT` | on a Mac without the vault |
| `notion` | Notion, over the API | `NOTION_TOKEN` | anywhere else — CI, a cloud session, a server |

All three produce the same shape, and the same module ids for the same
pages, because subject, lane, hub and sensitivity are worked out once from
a common note shape rather than per source. `archives.test.mjs` asserts
exactly that: one fixture Archives described twice, indexed both ways, and
the two indexes compared id for id. That is the contract — everything
downstream reads the index, never the source.

## Reading Notion

`--from notion` exists so the OS does not depend on one laptop being open.

**Set-up, once.**

1. Create an internal integration at <https://www.notion.so/profile/integrations>.
   It needs **read content** only. Do not grant insert or update.
2. Open the *The Arcane Archives* page in Notion → `···` → **Connections** →
   add the integration. Child pages inherit it.
3. Put the token in `.env` at the repo root:

   ```
   NOTION_TOKEN=ntn_...
   ARCANE_ARCHIVES_NOTION_ID=      # optional; pins the root page by id
   ```

4. `npm run herald:index -- --from notion`

**Read-only by construction.** `notion.mjs` carries a list of the three
Notion reads it is allowed to make — `GET /pages/{id}`, `GET
/blocks/{id}/children`, `POST /search` — and refuses anything else before
a request leaves the process. Standing rule 3 is not a note in this file;
it is a branch in the code, with tests that assert `PATCH`, `POST /pages`,
`PUT` and `DELETE` all throw. Revoking the integration's write scope in
Notion is a second lock on the same door, and worth doing anyway.

**The cache.** A cold run is ~2,000 requests against Notion's 3-per-second
limit — minutes, not seconds. So a run first sweeps `/search`, which
returns `last_edited_time` a hundred pages at a time, and re-reads only
the pages whose cache is stale. `data/archives/notion-cache/<id>.json`
holds each page's text *and* its child ids, so an unchanged tree is walked
without touching the blocks endpoint at all. Delete the folder to force a
cold rebuild; it is gitignored and never a source of truth.

## What the lanes do

`laneFor()` in `scripts/lib.mjs` maps a subject to a lane, and the lane
decides handling:

- `external` — reposted third-party writing. **Never a source.** Detected
  by content, not by title alone.
- `health`, `trading` — **sensitive.** Never picked unless Leo names the
  subject, and the compliance gate hard-fails dosing, compounds and claims
  on anything cut from them.
- everything else — open, subject to `brain/05-Knowledge/Archives-Sources.md`,
  which is the operator's own allow list and is read on every run.

A module is also marked sensitive if the compliance scan finds a hard
pattern in its text, whatever its lane.
