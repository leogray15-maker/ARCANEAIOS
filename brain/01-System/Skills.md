---
type: system-card
created: 2026-09-18 18:04
updated: 2026-09-18 18:04
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
