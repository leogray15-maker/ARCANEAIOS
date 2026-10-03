# Missions

The network works on its own, inside the standing rules, for nothing.

A mission is a small graph of steps: read the brain, search the web, reason,
write a draft, propose an order. The worker on Leo's machine runs it against
a local model (Ollama), records every step as an agent run, and stops at
anything above a draft to ask. Leo queues missions in the MISSIONS room
(`#missions`, from THE CONTROL ROOM, or `m` on the floor), answers what they
stop at, and reads what they found.

## The shape

```
packages/config/src/missions.js     what a mission is: templates, actions, the risk ladder, the plan check
supabase/migrations/0013_missions.sql   one table, `missions`; agent_runs.mission_id
packages/database/src/state.js      the registry entry: what the operator may set, the snapshot, the schedule
packages/database/src/cron.js       five-field cron, no dependency
packages/runtime/src/model.js       the model: Ollama (free) or Anthropic, one shape for every caller
packages/runtime/src/tools.js       what each action does: the brain, the Archives, the web, HERALD, proposals
packages/runtime/src/missions.js    the runner: recover, schedule, resume, claim, advance
packages/runtime/src/worker.js      the loop, shared by tools/worker.mjs and the dev API
apps/facility/src/render/missions.js   the room
tools/lib/state-mirror.mjs          mirrorMissions: the log and the research packets into the brain
```

Nothing here is a second system. A mission's steps go through the
existing workflow engine (`packages/database/src/workflow.js`). Each
permission is decided by the existing grades and `resolvePermission`. Each
step is a row in `agent_runs`, so it shows in the Records, the budgets and
the Bridge's agent status. Every change is a `system_events` row on the
hash chain. An approval is a proposed order, answered like any other.

## The risk ladder

| Level | Name | Capability | Unattended? |
| --- | --- | --- | --- |
| L0 | Read | data | yes |
| L1 | Analyse | analyse (search and read the web, reason) | yes |
| L2 | Draft | write (a draft, a proposal) | yes |
| L3 | Change | change (pricing, stock, the site) | only behind an approval |
| L4 | Outward | publish, contact | only behind an approval |
| L5 | Spend | spend | never |

`AUTONOMY_CEILING` is 2, and the validator refuses any other value: the
ceiling is the standing rules, not a setting. A template with a step above
L2 and no approval upstream fails `npm run check`. The runner checks the
same rule again before every step. It also checks the acting agent's grade
and whether that agent carries the tool, so a plan cannot carry a step
past it.

No action above L2 exists yet. When one is added (posting an approved
draft, say), it goes in `ACTIONS` with its level and an executor, and every
template that uses it must put an approval in front of it.

## Templates

| Template | Agent | Steps | Ends in |
| --- | --- | --- | --- |
| `research` | CIPHER (ORACLE reads the Archives) | plan → recall, archives → search → read → synthesise → propose | a research packet: summary, findings each with its source and confidence, gaps; up to three proposed orders |
| `content` | HERALD | pick → draft → critique → (weak?) → revise | drafts in BEACON, through the lint gate, waiting as `draft`; the critic's scores |
| `review` | ARCANE (VECTOR reads the week) | week → judge → propose | what worked, what failed, **lessons**; up to three proposed orders |

Templates are data. The plan is snapshotted onto the mission when it is
queued, so editing a template never changes a mission in flight.

Step kinds:

- **action:** one of `ACTIONS`, with its arguments.
- **think:** a prompt and a JSON schema.
- **condition:** a test on an earlier result. False skips everything downstream.
- **approval:** pauses the mission as a proposed order.

Arguments and prompts refer to earlier results as `$input.question` or
`$plan.queries`. These references are resolved, never evaluated.

## Memory

- **Episodic:** `agent_runs` (one per step, carrying `mission_id`) and `system_events`. The weekly review reads the week from these.
- **Semantic:** the brain. `memory.search` reads it from disk; `vault:sync` writes every finished research packet into `05-Knowledge/Research/<id>.md`, so the next mission finds it.
- **Procedural:** the skills, HERALD's references, and the **lessons** from the most recent weekly review. Every thinking step is given those lessons.
- **The graph:** `npm run vault:graph`, over the same notes. The research packets link their sources, so they join it.

## Running it

Free, on the Mac:

```
brew install ollama && ollama serve        # or the app from ollama.com
ollama pull qwen3:14b                      # 16GB of memory; qwen3:8b on 8GB
# .env
ARCANE_PROVIDER=ollama
ARCANE_MODEL=qwen3:14b
npm run dev                                # the floor, the API and the worker in one
```

Against Supabase with the floor on Vercel, run only the worker:

```
npm run worker                             # ticks every 30s; --once for launchd or cron
npm run mission -- research "What do UK suppliers charge for GHK-Cu this month?"
npm run mission -- content --lane mindset
npm run mission -- review --every "0 18 * * 0"
```

Missions queued on the floor (on Vercel) wait in the table until a worker
picks them up. MISSIONS says when one has waited more than two minutes. Two
workers on one database are safe: a claim is a conditional update, and the
loser simply finds nothing.

The web costs nothing as well. Searches go to DuckDuckGo's plain HTML
page, or to your own SearXNG when `SEARXNG_URL` is set, and pages are read
with `fetch`. A URL a model chose never reaches the machine's own network:
`publicUrl` refuses localhost, private ranges and bare hostnames.

## What a tick does

1. **Recover.** A running mission with no heartbeat for 20 minutes is failed, saying why. Its finished steps stay on the row.
2. **Schedule.** A standing mission that has fallen due queues a copy of itself. The clock moves first, so a crash queues one copy late, never two.
3. **Resume.** A paused mission whose approval order has been answered either carries on (approved; the order is marked done) or stops there (killed; everything downstream is skipped).
4. **Claim.** The next queued mission, by priority and age, is claimed atomically and advanced as far as it can go.

A mission stops after 24 steps whatever its graph says. A thinking step
honours the agent's `runs_daily` budget. A model that answers in the wrong
shape is told what it missed and asked again, up to three times. A step
that fails fails the mission, which keeps everything done before it and can
be run again from the room.

## Limits, said plainly

- Vercel cannot reach a model on the Mac, so missions run only while the worker is running.
- A 14B local model is weaker than Claude at long synthesis and strict shapes. The schema check and the retries catch the shape; the substance is what the review is for. `ARCANE_PROVIDER=anthropic` uses Claude for the same missions, at a cost per token.
- Event watchers (a mission queued by a system event rather than a clock) are not built. The `source` column and the schedule step are where they would go.
