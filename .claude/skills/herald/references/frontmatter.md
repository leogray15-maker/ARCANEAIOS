# Frontmatter — the contract every draft carries

The template is `brain/99-Templates/Content-Draft.md`; the per-format
copies are in `templates/`. `lint.mjs` validates; `emit.mjs` fills the
fields marked *set on emit*. Never hand-fill those.

| Field | Who sets it | Meaning |
| --- | --- | --- |
| `type` | template | Always `content-draft`. |
| `id` | *emit* | `HER-YYYYMMDD-NNN`. Sequential per day across Drafts + Content-Log. |
| `title` | HERALD | Working title, ≤ 60 chars. Becomes the filename slug. |
| `format` | HERALD | `short` `medium` `thread` `email` `teaser`. |
| `platform` | HERALD | `X` `Threads` `Instagram` `TikTok` `YouTube` `LinkedIn` `Email` `Kick`. |
| `status` | HERALD writes `draft`; **only a human moves it** | `draft → review → approved → scheduled → posted → killed`. |
| `agent` | template | `HERALD`. |
| `run` | *emit* | `HER-R-YYYYMMDD-NNN`. Groups the drafts of one run. |
| `source_subject` | HERALD | The Archives subject, exactly as in the index. |
| `source_module` | HERALD | The module title, exactly as in the index. |
| `source_ref` | HERALD | The index id. Stable across runs; `pick.mjs` uses it to avoid reuse. |
| `source_url` | HERALD | `https://www.notion.so/<notionId>` when the index has one. |
| `angle` | HERALD | One line: why this cut, for whom. |
| `hook` | HERALD | The first line of the body, verbatim. Lint checks they match. |
| `cta` | HERALD | `none` `archives` `reply` `follow` `link`. |
| `tags` | HERALD | Lane + two or three topic tags, lowercase, no `#`. |
| `word_count` | *emit* | Counted from the body with comments stripped. |
| `compliance` | *emit* | `pass`. A failing draft never reaches the vault. |
| `compliance_notes` | *emit* | WARN hits, joined with `;`. Empty when clean. |
| `created` / `updated` | *emit* | `YYYY-MM-DD HH:MM`. |
| `approved_by` `scheduled_for` `posted_at` `posted_url` | human, later | Filled as the draft moves. |

## Status lifecycle (human-driven)

```
draft ──► review ──► approved ──► scheduled ──► posted
  │          │           │
  └──────────┴───────────┴──────► killed
```

Moving a file between `Drafts/`, `Approved/`, `Posted/`, `Killed/` is
optional housekeeping; the `status` field is the truth. A future sweep
will move files to match their status.

## Filename

`HER-20260916-003-thread-the-hater-map.md` — id, format, slug. Sortable,
greppable, safe in every OS and in Obsidian links.
