/**
 * TALLY — the Treasurer. Quantitative intelligence.
 *
 * POST /api/tally { code, question?, dry? }
 *   → { run, changes, meaning, checks, proposals, summary, evidence, problems, sources }
 *
 * Reads the Vault, the Lab, the Market's funnel, the Trading Floor and the
 * record; answers WHAT CHANGED, WHY, WHAT IT MEANS and WHAT SHOULD BE
 * CHECKED. Every figure it cites is one it was handed. It proposes; it
 * does not act. `dry: true` returns the reading without the model.
 */
import { guard, ROOM_LIST } from './_lib.js';
import { agentRun, PROPOSAL_SCHEMA } from './_agent.js';
import { tallyEvidence } from '../packages/database/src/evidence.js';

const ROOM_IDS = ROOM_LIST.map((r) => r.id);
const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    changes: { type: 'array', maxItems: 8, description: 'What moved, each with the figures before and after where the evidence has them.', items: { type: 'object', additionalProperties: false, properties: { what: { type: 'string' }, detail: { type: 'string', description: 'The figures, and the cause if the record shows one — otherwise say the cause is not in the record.' }, source: { type: 'string', description: 'Which table or event this came from.' } }, required: ['what', 'detail', 'source'] } },
    meaning: { type: 'string', description: 'What the numbers mean for the ventures, in plain sentences. Where they mean nothing yet because the data is thin, say that.' },
    checks: { type: 'array', maxItems: 6, description: 'What the operator should verify, and why — a figure that looks wrong, a gap, a number that cannot be explained from the record.', items: { type: 'object', additionalProperties: false, properties: { what: { type: 'string' }, why: { type: 'string' }, room: { type: 'string', enum: ROOM_IDS } }, required: ['what', 'why', 'room'] } },
    proposals: { ...PROPOSAL_SCHEMA, items: { ...PROPOSAL_SCHEMA.items, properties: { ...PROPOSAL_SCHEMA.items.properties, room: { type: 'string', enum: ROOM_IDS } } } },
    summary: { type: 'string', description: 'TALLY reporting to Leo in five lines or fewer.' },
  },
  required: ['changes', 'meaning', 'checks', 'proposals', 'summary'],
};

export default guard(['POST'], (req, res, auth) => agentRun(req, res, auth, {
  agent: 'tally', holder: 'TALLY', prefix: 'TAL', skill: 'reading', objective: 'the money, read',
  evidence: tallyEvidence, schema, effort: 'medium', maxTokens: 6000,
  instructions: [
    'You are TALLY, Treasurer of THE ARCANE, reading the books for Leo. You are handed the month\'s figures, what shipped and what it made, the stock and its margins, the journal, and the money events of the last fortnight.',
    'Answer four things, in order: what changed, why (only where the record shows a cause), what it means, and what should be checked. Typed revenue and realised profit answer different questions — never add them or treat one as the other.',
    'You are exact. A figure you cite is in the evidence. A change you name has a before and an after. A cause you give is an event in the record; otherwise say the record does not show why.',
    'A check is something Leo can verify in a room in a minute. A proposal is rarer: only when a figure warrants an action, and then the smallest one.',
  ].join('\n'),
}));
