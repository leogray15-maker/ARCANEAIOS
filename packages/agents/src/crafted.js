// @ts-check
/**
 * Agents crafted in THE AGENT GARAGE: a persona from the library, a room,
 * a tier, a standing task and a choice of tools, saved as a row in
 * `agents` (custom = true) and run by the same runner as the agents
 * defined in code — same lock, step limit, budget, record.
 *
 * What a crafted agent can do is bounded here, not by its persona: the
 * tools are the read-only ones plus outputs.save, every output waits for
 * review, and its instructions end with the line that turns any "post",
 * "send" or "spend" in the persona into a draft for Leo.
 */
import { z } from 'zod';
import { PERSONAS } from './personas.generated.js';
import { TOOL_NAMES } from './tools.js';
import { AGENT_DEFS } from './registry.js';
import { ROOMS, ROOM_BY_ID } from '../../config/src/index.js';

/** @typedef {import('./registry.js').AgentDef} AgentDef */

const ROOM_IDS = /** @type {[string, ...string[]]} */ (ROOMS.map((/** @type {{ id: string }} */ r) => r.id));
const PERSONA_IDS = /** @type {[string, ...string[]]} */ (PERSONAS.map((p) => p.id));

export const CraftInput = z.object({
  name: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9 '&-]+$/, 'letters, numbers, spaces, apostrophes and dashes only'),
  persona: z.enum(PERSONA_IDS),
  room: z.enum(ROOM_IDS),
  tier: z.enum(['grunt', 'writer', 'thinker']),
  task: z.string().trim().min(10).max(1_000),
  instructions: z.string().trim().max(2_000).default(''),
  tools: z.array(z.enum(/** @type {[string, ...string[]]} */ (TOOL_NAMES))).max(TOOL_NAMES.length).default(['outputs.save']),
});
/** @typedef {z.infer<typeof CraftInput>} Craft */

/** A stable id from the name: crafted-<slug>. @param {string} name */
export const craftedId = (name) => `crafted-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`;

const BOUNDS = 'Inside THE ARCANE you analyse, draft and recommend; you never act. Where the persona above describes posting, publishing, sending, contacting, buying, spending or changing anything, write the draft or the recommendation for Leo instead. Whatever you answer is saved for Leo to review. Never make a medical, dosing or treatment claim, and never promise a financial return.';

/**
 * The runnable definition for a crafted row. Returns null for a row whose
 * config no longer validates (a persona removed from the library, say), so
 * one bad row cannot take the Garage down.
 * @param {{ id: string, schedule: string, config: Record<string, unknown> }} row
 * @returns {AgentDef | null}
 */
export function craftedDef(row) {
  const c = CraftInput.safeParse(row.config);
  if (!c.success) return null;
  const persona = PERSONAS.find((p) => p.id === c.data.persona);
  if (!persona) return null;
  const tools = [...new Set([...c.data.tools, 'outputs.save'])];
  return {
    id: row.id, name: c.data.name.toUpperCase(), room: c.data.room, owner: ROOM_BY_ID[c.data.room]?.agent || 'forge',
    description: `${persona.name}, crafted in THE AGENT GARAGE. ${persona.description}`.slice(0, 400),
    tier: c.data.tier, schedule: row.schedule, budgetGbpPerRun: 0.05, maxSteps: 6, maxDurationMs: 150_000,
    instructions: `${persona.text}\n\n${c.data.instructions ? `Leo's instructions for this agent:\n${c.data.instructions}\n\n` : ''}${BOUNDS}`,
    tools, outputType: 'note', runPrefix: 'CRF-R', persona: persona.id, defaultTask: c.data.task,
  };
}

/**
 * Every runnable agent: the ones in code, then the crafted rows.
 * @param {import('../../database/src/ai.js').Db} db
 * @returns {Promise<AgentDef[]>}
 */
export async function allDefs(db) {
  /** @type {Array<{ id: string, schedule: string, config: Record<string, unknown> }>} */
  let rows = [];
  try { rows = /** @type {typeof rows} */ (await db.get('agents', { select: 'id,schedule,config', custom: 'eq.true', order: 'id.asc' })); } catch { /* 0013 not applied yet: the code agents still work */ }
  const crafted = rows.map(craftedDef).filter(/** @returns {d is AgentDef} */ (d) => d !== null);
  return [...AGENT_DEFS, ...crafted.filter((d) => !AGENT_DEFS.some((a) => a.id === d.id))];
}
