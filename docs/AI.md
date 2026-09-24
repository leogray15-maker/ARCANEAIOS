# The AI layer

Agents that run on several models, from inside THE ARCANE. Three packages,
one route, three rooms.

| Piece | Where | What it does |
| --- | --- | --- |
| The model router | `packages/ai/` | `runModel()` over OpenRouter, Gemini (direct), Groq, xAI, DeepSeek and Nous. Tiers, fallback chains, retries, the paid-model gate, the monthly budget. |
| The models | `packages/ai/src/models.js` | **The one file to edit to change models.** Every id, its price, its tier, its fallback order. |
| The agents | `packages/agents/` | The registry, the tools (Notion read-only, `outputs.save`), the runner, the persona library, crafted agents. |
| The tables | `supabase/migrations/0013_ai_layer.sql` | `agents` (switches, lock), `outputs` (what agents produce), `model_usage` (every call and its cost), columns on `agent_runs`. |
| The route | `api/ai.js` | Everything above, behind the operator key. `/api/agents/<id>/run` and `/api/runs` are rewrites to it; `/api/cron` is a rewrite to `api/tick.js`. |
| The rooms | `#garage`, `#council`, `#scriptorium` | THE AGENT GARAGE, THE COUNCIL, SCRIPTORIUM (`apps/facility/src/render/`). |

## The agents

| Agent | Room · owner | Models | Schedule | What it leaves |
| --- | --- | --- | --- | --- |
| Library Summariser | THE LIBRARY · ORACLE | grunt (free only) | 05:00 UTC | a summary per Notion page, skipping pages unchanged since the last run |
| Scriptorium Drafter | SCRIPTORIUM · SCRIBE | writer (free first) | 06:00 UTC | drafts in `content_drafts`, state `draft`, through HERALD's gate — decided in BEACON |
| The Council | THE COUNCIL · ARCANE | one seat per lab, judged by a thinker | on request | a verdict: every seat's answer, where they agreed and split, the call |
| Trend Scout | BEACON · HERALD | Grok | — | **stubbed** until a live X search is wired (`packages/agents/src/agents/trend.js` says what is needed) |
| Crafted agents | any room · that room's agent | the tier you pick | yours | notes, pending review |

Every agent starts **switched off**. Switch one on in THE AGENT GARAGE.
Nothing any agent makes is published: summaries, notes and verdicts wait as
`pending`; drafts wait in BEACON as `draft`.

## How to add an agent

**In code** (a pipeline, like the four above):

1. Write `packages/agents/src/agents/<name>.js` exporting an `AgentDef`
   (see the typedef in `packages/agents/src/registry.js`): `id`, `name`,
   `room` (an id from `packages/config/src/rooms.js`), `owner` (an agent id
   from `packages/config/src/agents.js` — its runs show under that name),
   `tier` or `model`, `schedule`, `budgetGbpPerRun`, `maxSteps`,
   `maxDurationMs` (under 300 000), `instructions`, `tools`, `outputType`,
   `runPrefix`, and a `run(ctx)` pipeline — or leave `run` out for the
   generic tool loop.
2. Add it to `AGENT_DEFS` in `registry.js`.
3. Add a test beside the others in `tools/agents-pipelines.test.mjs`, with
   the models and Notion faked. `npm test`, `npm run typecheck`, `npm run lint`.

Inside `run(ctx)`: `ctx.model({ messages, schema? })` is one step (tier,
budget and deadline applied), `ctx.tool(name, input)` calls a listed tool
with zod checks both ways, `ctx.heartbeat(text)` keeps the run alive on
the floor. Throwing is fine: the runner records the run as failed.

**Without code** — THE AGENT GARAGE → Craft an agent: a persona from the
library (26, from msitarzewski/agency-agents, MIT), a room, a tier, a
standing task, optionally the Notion tools. It is saved switched off.

To change the persona list: edit `PICKS` in `tools/personas-import.mjs`,
then `git clone --depth 1 https://github.com/msitarzewski/agency-agents.git /tmp/agency-agents`
and `npm run personas:import -- /tmp/agency-agents`. The output is a
generated file; never edit it by hand.

## How to change models

Edit `packages/ai/src/models.js`:

- a new model: add an `m(key, provider, id, { label, lab, free, price, context, tools, json })` line
  with the id and price **from the provider's catalogue**;
- a tier's order: edit `TIERS` — free models before paid ones (a test enforces it; the grunt tier must be free only);
- a named model for one agent: `NAMED`, then `model: '<name>'` on the agent;
- the Council's seats: `COUNCIL_PANEL`.

Then `npm run models:verify` (checks every OpenRouter id against the live
catalogue, and Gemini/Groq/xAI/DeepSeek/Nous ids when their keys are in
`.env`). The `models` workflow does the same on every push to
`packages/ai/` and weekly; add `GEMINI_API_KEY` as an Actions secret to
have it check the Gemini ids too. `npm run models:verify -- --list nousresearch/`
lists what OpenRouter carries under a prefix.

## How to enable paid models

Paid models are never called unless both are set on the server (Vercel →
Settings → Environment Variables, and `.env` locally):

```
ALLOW_PAID_MODELS=true        # exactly "true" — anything else is off
MONTHLY_BUDGET_GBP=5          # the ceiling for the calendar month (UTC)
```

Before every paid call the router reads this month's paid spend from
`model_usage`, adds the call's worst-case estimate, and refuses if it
would pass the budget. No budget, or a database it cannot read, means no
paid call. Each agent also has its own `budgetGbpPerRun`. Gemini through
AI Studio is treated as free (its free tier); set `GEMINI_BILLING=paid` if
billing is enabled on that project, and it moves behind the same gate.
Put a limit on the OpenRouter workspace too (Settings → Workspace budget)
as a second wall.

## How to check spend

- THE AGENT GARAGE: the bar shows this month's spend and calls; "Models this month" breaks it down by model; every run shows its cost.
- `GET /api/ai?view=usage` — this month by model and by agent.
- `GET /api/health` — keys present, paid gate, budget, spend; `?ping=1` also checks each provider (costs nothing: an authenticated model list, or one token to OpenRouter's free router).
- In Supabase: `select date_trunc('day', at) as day, sum(cost_gbp) from model_usage where not free group by 1 order by 1 desc;`

## Running agents

- From the floor: THE AGENT GARAGE → Run now; SCRIPTORIUM's two buttons; THE COUNCIL's question box.
- From the terminal: `npm run agent -- --list`, `npm run agent -- library-summariser`, `npm run agent -- council --question "…"` (`--enable` switches it on first).
- On a schedule: Vercel Cron wakes `/api/tick` daily at 03:00 UTC (the most the Hobby plan allows) and runs every switched-on agent whose schedule has had a tick since its last run. For the schedules to be kept to the hour, the `agents-cron` workflow wakes `/api/cron` hourly: set the Actions secret `CRON_SECRET` (the same value as in Vercel) and the Actions variable `ARCANE_URL` (`https://arcaneaios.vercel.app`).

Two runs of the same agent never overlap: a run takes the agent's lock in
`agents` with one conditional update, and a second run is refused (409)
until the first releases it or the lock expires. Every run is a row in
`agent_runs` (status, model, tokens, cost, steps, duration, error) and a
`run.ok` / `run.failed` event in the record, success or not.

## Security

Every `/api` route needs the operator key (`ARCANE_OPERATOR_KEY`, a Bearer
token, compared in constant time; the API refuses everything without it).
`/api/tick` and `/api/cron` accept `CRON_SECRET` instead — the header
Vercel Cron sends — and nothing else: an `x-vercel-cron` header on its own
is refused. The rooms show nothing without the key. Provider keys live only
in the server's environment; no key is `NEXT_PUBLIC_`/`VITE_`, and CI fails
if a service key reaches the bundle. Error messages from providers are
redacted of anything key-shaped before they are logged.

## DeepSeek Harness and Hermes Agent

Both are full agent applications (a local web UI and CLI; a TUI with a
Telegram/Discord gateway) that execute model-written commands on the
machine they run on. Neither can run inside a Vercel function, and neither
should be reachable from a public URL. What THE ARCANE takes from each:

- **DeepSeek**: the models — `deepseek/deepseek-v4-pro` and
  `deepseek/deepseek-v4.1-flash` through OpenRouter, and DeepSeek's own API
  when `DEEPSEEK_API_KEY` is set. To use the harness itself:
  `npx @deepseek-ai/dsh web` on the Mac, beside the floor.
- **Hermes**: `nousresearch/hermes-4-405b` through OpenRouter (a Council
  seat, and `model: 'hermes'` for any agent), and the Nous Portal API
  (`https://inference-api.nousresearch.com/v1`) when `NOUS_API_KEY` is set.
  Hermes Agent itself runs on the Mac or a VPS (`hermes-agent.nousresearch.com`).
