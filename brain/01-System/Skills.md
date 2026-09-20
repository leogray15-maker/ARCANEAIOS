---
type: system-card
created: 2026-09-21 00:12
updated: 2026-09-21 00:12
status: active
agent: FOUNDRY
generated: true
card: skills
tags: [system, skills]
---

# Skills

A skill is a packaged procedure an agent runs. It lives in `.claude/skills/<id>/SKILL.md` and is registered in `packages/config/src/skills.js`. A skill can never out-rank its agent.

## HERALD — Content Creator

`/herald` · agent [[HERALD]] · room [[BEACON]] · status **production**

Turns Arcane Archives modules into post-ready drafts (short, medium, thread, email, teaser) and lands them in 02-Content/Drafts with complete frontmatter. Zero medical or dosing claims. Logs every run.

- **Reads:** `archives`, `notion`, `database`, `02-Content`, `03-Memory`, `05-Knowledge/Archives-Map.md`, `05-Knowledge/Archives-Sources.md`
- **Writes:** `02-Content/Drafts`, `02-Content/Sources`, `02-Content/Content-Log.md`, `04-Records/Trace`, `04-Records/Daily-Log`, `database:content_drafts`, `database:agent_runs`
- **Formats:** short, medium, thread, email, teaser

## TALLY — The Reading

`POST /api/tally` · agent [[TALLY]] · room [[THE VAULT]] · status **production**

Reads the Vault, the Lab, the funnel, the Trading Floor and the record; answers what changed, why, what it means and what to check. Every figure cited is one it was handed. Proposals land as proposed orders.

- **Reads:** `database`, `03-Memory`
- **Writes:** `database:agent_runs`, `database:orders (proposed only)`


## MERIDIAN — The Chain

`POST /api/meridian` · agent [[MERIDIAN]] · room [[THE LAB]] · status **production**

Reads lots, stock, cover, the dispatch queue and what shipped; names where the chain binds and what to reorder. Never moves a vial.

- **Reads:** `database`, `03-Memory`
- **Writes:** `database:agent_runs`, `database:orders (proposed only)`


## VECTOR — The Position

`POST /api/vector` · agent [[VECTOR]] · room [[THE WAR ROOM]] · status **production**

Reads the ranking, the money, the moves, what is blocked, the verdicts and the signals; returns where the ventures stand and what, if anything, to put to the Council — as a proposal the operator convenes or not.

- **Reads:** `database`, `03-Memory`
- **Writes:** `database:agent_runs`, `database:orders (proposed only)`

