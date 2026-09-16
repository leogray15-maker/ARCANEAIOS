# Pipeline — one run, step by step

`SKILL.md` has the short version. This is the long one, for when a step
misbehaves or Leo asks for something unusual.

## 0. Preconditions

- The brain exists (`brain/CLAUDE.md`, or `ARCANE_BRAIN` points at it).
- The index exists (`data/archives/index.json`). If not: `npm run herald:index`.
  Takes about a second. If the export folder is missing, the script says
  where it looked and what to set.
- `npm run check` passes. If the config is invalid the network is invalid
  and nothing should run.

## 1. Read the brief

`brain/03-Memory/Brief.md`. Look at ORDERS for anything routed to BEACON
or HERALD — a standing order ("three shorts a day from the sales lane")
overrides a random pick. Look at DOCTRINE for this week's intent. If the
brief is more than a day old, say so in your report; still run.

## 2. Choose the source

`npm run herald:pick -- [--subject|--lane|--keyword] [--count N]`

Then read the full module: `npm run herald:pick -- --show <id>`. Read all
of it. The hook is usually already in there.

Rules of thumb:
- Leo names a subject → use it, even if sensitive (the gate still runs).
- Leo names a topic → `--keyword`.
- Leo says "run" with nothing else → one random open-lane module, five formats.
- A module under 250 words probably has a short and a teaser in it, not a set.

Never use the Notion connector's write tools. Read tools (`notion-fetch`,
`notion-search`) are allowed only to look at a page the export lacks, and
the draft's `source_url` must then carry the page URL.

## 3. Find the angle

One line. "Universal experience, hard reframe, costs nothing to give away."
What does the reader believe walking in, and what do they believe walking
out? If you cannot write that line, the module is not a source today.

## 4. Write

Read `references/voice.md` first, every time. Then write each format from
its template in `templates/`. The body is the post; the frontmatter is
the record. Fill every HERALD-owned field. Leave the *emit* fields as the
template has them.

Write into `.herald-staging/` at the repo root, one file per draft, named
anything — `emit.mjs` renames on landing. Keep the staging dir clean:
only this run's drafts.

## 5. Lint

`npm run herald:lint` (defaults to `.herald-staging`). Read every line of
output. Fix HARD failures by rewriting, never by trimming a word to dodge
a pattern. Consider every WARN — most are worth fixing; some (a health noun
in a mindset post) are fine and will travel with the draft as a note.

## 6. Emit

`npm run herald:emit -- --note "<one line about this run>"`

The batch lands whole or not at all. On success the output lists every
file and where it was logged. On refusal, nothing was written.

## 7. Report

Tell Leo, in his voice: the run id, what module, how many drafts, any
warnings worth a second look, and the exact path to the drafts. Do not
paste the drafts into chat unless asked — they are in the vault.

## Unusual runs

- **Refresh a used module.** `--include-used`, new `angle`, say so in `--note`.
- **A run for a launch.** Leo gives a subject and a CTA; use `cta: link`
  or `archives` across the set; emails get the CTA in the P.S. too.
- **Only shorts.** Write 3–5 shorts from *different* modules (one pick
  each). Emit as one run.
- **Something failed after landing.** The output says which step. The
  drafts are in `02-Content/Drafts/`; the Content-Log or Trace may be
  short a line. Add it by hand using the templates and note it in Trace.

## What the scripts refuse

| Refusal | Why |
| --- | --- |
| Any HARD compliance hit | The standing rule. |
| `status` other than `draft` | Only a human moves status. |
| More than 10 drafts in a run | HERALD's card: must ask first. Split it. |
| Missing or mismatched `hook` | The hook is the post. |
| Thread post over 280 chars, or unnumbered | It would not post. |
| Email without Subject/Preview | It would not send. |
| Writing anywhere but `02-Content/Drafts` | Not in the skill's `writes`. |
