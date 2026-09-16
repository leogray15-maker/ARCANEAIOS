# The Archives — what to cut, and from where

The live map is generated into `brain/05-Knowledge/Archives-Map.md` by
`npm run herald:index`. This file is the *editorial* view: what each lane
is for and what tends to convert.

## Lanes

| Lane | What it holds | Converts to | Handling |
| --- | --- | --- | --- |
| mindset | Discipline, procrastination, leadership, daily quests, the entrepreneur's interior | Follows, saves, Archives signups | Open. The bread and butter. |
| philosophy | Stoicism, first principles, thinking, rules for life, LG philosophies | Shares, authority | Open. Best for threads. |
| sales | Sales mastery, copywriting, inbound, product, personal brand, content playbook | Consulting leads, Archives | Open. Best for mediums and emails. |
| dark | Dark psychology, mind hijacking, productive isolation, the red book, silent grind | Reach, the contrarian brand | Open. Keep it observational, never instructional against a named person. |
| lifestyle | Playboy life, premium archive, terminate playlist | Reach | Open lane, **per-module flags are common** — the premium archive is full of supplement stacks. Trust the flag. |
| health | Health ascendance, biohacking, bulking, glitched brain | — | **Sensitive.** Named-only. Principle, never physiology. |
| trading | Journey to getting rich, investing guide | — | **Sensitive.** Named-only. Psychology of trading, never a position or a return. |
| meta | Welcome, courses index | — | Never a source. |

## What a good source module looks like

- 250–2,000 words. Under 250 rarely has a turn in it; over 2,000 has three
  posts in it and you should cut the sharpest.
- Has a line that already reads like a hook. The modules were written to
  be read aloud; the best posts are already in them, one edit away.
- Not flagged. If it is flagged in an open lane, it is because the body
  names a compound or a dose — cut around it or pick another.

## Reuse

`pick.mjs` excludes modules already in `Content-Log.md`. Re-cutting a
module is fine six weeks later with a new angle — pass `--include-used`
and say so in `angle`.

## Refreshing the source

The local export is a snapshot. To refresh: re-export the Archives from
Notion (HTML, include subpages) into the same folder and run
`npm run herald:index`. The Notion connector may be used to *read* a
single page when the export is stale (`notion-fetch`, `notion-search`).
It may never be used to write. See `references/pipeline.md`.
