// @ts-check
/**
 * THE ARCANE's runnable agents. One entry per agent: who it is, which
 * room it works in, which roster member answers for it, which models it
 * may use, when it runs, what it may spend, how many steps it may take,
 * what it is told, which tools it may touch and what it produces.
 *
 * `owner` ties each one to an agent in packages/config/src/agents.js, so
 * its runs show on the floor under that agent's name and its grades
 * bound what it may do: nothing here publishes, spends money or writes to
 * Notion, because no owner is graded to.
 *
 * Adding an agent is adding an entry here (see docs/AI.md). The operator's
 * switches — on or off, the schedule — live in the `agents` table and are
 * set in THE AGENT GARAGE; this file holds the defaults.
 */

/**
 * @typedef {import('./runner.js').RunContext} RunContext
 * @typedef {object} AgentDef
 * @property {string} id
 * @property {string} name
 * @property {string} room                 an id from packages/config/src/rooms.js
 * @property {string} owner                an id from packages/config/src/agents.js
 * @property {string} description
 * @property {import('../../ai/src/models.js').Tier} [tier]
 * @property {string} [model]              a key in MODELS or NAMED; takes precedence over tier
 * @property {import('../../ai/src/models.js').Tier} [fallbackTier]
 * @property {string} schedule             default cron (UTC); '' means manual only
 * @property {number} budgetGbpPerRun      the most one run may spend on paid models
 * @property {number} maxSteps             model calls per run
 * @property {number} maxDurationMs        must stay under the function's maxDuration (300s)
 * @property {string} instructions
 * @property {string[]} tools              names from tools.js
 * @property {import('../../database/src/ai.js').OutputType} outputType
 * @property {string} runPrefix            agent_runs ids are <prefix>-YYYYMMDD-NNN
 * @property {string} [persona]            the persona this was crafted from, if any
 * @property {string} [defaultTask]
 * @property {string} [disabled]           set to a reason to stub the agent; it then never runs
 * @property {import('zod').ZodType} [input]
 * @property {(ctx: RunContext) => Promise<{ summary: string, data?: Record<string, unknown> }>} [run]   a pipeline; without one, the generic tool loop runs
 */

import { librarySummariser } from './agents/library.js';
import { scriptoriumDrafter } from './agents/drafter.js';
import { council } from './agents/council.js';
import { trendScout } from './agents/trend.js';

/** @type {AgentDef[]} */
export const AGENT_DEFS = [librarySummariser, scriptoriumDrafter, council, trendScout];

/** @type {Record<string, AgentDef>} */
export const AGENT_DEF_BY_ID = Object.fromEntries(AGENT_DEFS.map((d) => [d.id, d]));

/** The definition without its functions or schemas, for the `agents.config` column and the floor. @param {AgentDef} d */
export function publicDef(d) {
  return {
    id: d.id, name: d.name, room: d.room, owner: d.owner, description: d.description,
    tier: d.tier || '', model: d.model || '', fallbackTier: d.fallbackTier || '',
    schedule: d.schedule, budgetGbpPerRun: d.budgetGbpPerRun, maxSteps: d.maxSteps, maxDurationMs: d.maxDurationMs,
    tools: d.tools, outputType: d.outputType, persona: d.persona || '', disabled: d.disabled || '',
    takesInput: !!d.input,
  };
}
