/**
 * MERIDIAN — the Quartermaster. Operational intelligence.
 *
 * POST /api/meridian { code, question?, dry? }
 *   → { run, bottlenecks, reorder, proposals, summary, evidence, problems, sources }
 *
 * Reads the chain — lots, stock, cover, the dispatch queue, what shipped
 * and what it cost — and names where it binds. Proposes reorders and
 * fixes as orders in THE LAB; never moves a vial itself.
 */
import { guard, ROOM_LIST } from './_lib.js';
import { agentRun, PROPOSAL_SCHEMA } from './_agent.js';
import { meridianEvidence } from '../packages/database/src/evidence.js';

const ROOM_IDS = ROOM_LIST.map((r) => r.id);
const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    bottlenecks: { type: 'array', maxItems: 6, description: 'Where the chain binds: a lot running out, a line with no COA on sale, a dispatch sitting, a line that cannot be costed.', items: { type: 'object', additionalProperties: false, properties: { where: { type: 'string', enum: ['supplier', 'lot', 'cost', 'product', 'dispatch', 'sale', 'cash'] }, what: { type: 'string' }, evidence: { type: 'string', description: 'The figure in the evidence that shows it.' }, effect: { type: 'string', description: 'What it stops, downstream.' } }, required: ['where', 'what', 'evidence', 'effect'] } },
    reorder: { type: 'array', maxItems: 8, description: 'Lines to reorder, with the cover figure that says so. Empty when nothing needs ordering.', items: { type: 'object', additionalProperties: false, properties: { product_id: { type: 'string' }, why: { type: 'string' }, vials: { type: 'integer', description: 'A sensible quantity given the rate, or 0 if the rate is unknown.' } }, required: ['product_id', 'why', 'vials'] } },
    proposals: { ...PROPOSAL_SCHEMA, items: { ...PROPOSAL_SCHEMA.items, properties: { ...PROPOSAL_SCHEMA.items.properties, room: { type: 'string', enum: ROOM_IDS } } } },
    summary: { type: 'string', description: 'MERIDIAN reporting to Leo in five lines or fewer.' },
  },
  required: ['bottlenecks', 'reorder', 'proposals', 'summary'],
};

export default guard(['POST'], (req, res, auth) => agentRun(req, res, auth, {
  agent: 'meridian', holder: 'MERIDIAN', prefix: 'MER', skill: 'chain', objective: 'the chain, read',
  evidence: meridianEvidence, schema, effort: 'medium', maxTokens: 6000,
  instructions: [
    'You are MERIDIAN, Quartermaster of THE ARCANE, reading the operational chain for Arcane Peptides: supplier → lot → unit cost → product → dispatch → sale → cash.',
    'Find where it binds. A lot with days of cover left, a live line without a published COA, a dispatch that has sat in the queue, a line shipped with no lot so nothing was drawn down and nothing can be costed. Say what each one stops downstream.',
    'Cover is vials on hand over the last thirty days\' rate; where there is no rate, say the rate is unknown rather than guessing. A reorder names the product id from the evidence and the figure that warrants it.',
    'You are handed no clinical information and you give none: a product is a line with a cost, a price, a count and a certificate.',
  ].join('\n'),
}));
