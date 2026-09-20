/**
 * The three readers — TALLY, MERIDIAN, VECTOR — behind one function.
 *
 * POST /api/agent { code, agent: 'tally' | 'meridian' | 'vector', question?, dry? }
 *   → the same shape each ever returned (run, its own fields, proposals, summary, evidence, problems, sources)
 *
 * One file, not three. Vercel's Hobby plan caps a deployment at 12
 * serverless functions; three thin wrappers around the same `agentRun()`
 * contract (`api/_agent.js`) were the three to merge, because merging
 * them loses nothing — each still has its own schema, its own evidence
 * function and its own instructions, chosen by `agent` in the body. An
 * unknown agent id is refused before anything is read from the tables.
 * `apps/facility/src/core/api.js`'s `api.agent(id, …)` already sends the
 * id this way; nothing on the client had to change.
 */
import { json, guard, ROOM_LIST } from './_lib.js';
import { agentRun, PROPOSAL_SCHEMA } from './_agent.js';
import { tallyEvidence, meridianEvidence, vectorEvidence } from '../packages/database/src/evidence.js';
import { VENTURES } from '../packages/config/src/index.js';

const ROOM_IDS = ROOM_LIST.map((r) => r.id);
const VENTURE_IDS = VENTURES.map((v) => v.id);
const roomProposals = { ...PROPOSAL_SCHEMA, items: { ...PROPOSAL_SCHEMA.items, properties: { ...PROPOSAL_SCHEMA.items.properties, room: { type: 'string', enum: ROOM_IDS } } } };

const SPECS = {
  /**
   * TALLY — the Treasurer. Quantitative intelligence. Reads the Vault,
   * the Lab, the Market's funnel, the Trading Floor and the record;
   * answers WHAT CHANGED, WHY, WHAT IT MEANS and WHAT SHOULD BE CHECKED.
   */
  tally: {
    agent: 'tally', holder: 'TALLY', prefix: 'TAL', skill: 'reading', objective: 'the money, read',
    evidence: tallyEvidence, effort: 'medium', maxTokens: 6000,
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        changes: { type: 'array', maxItems: 8, description: 'What moved, each with the figures before and after where the evidence has them.', items: { type: 'object', additionalProperties: false, properties: { what: { type: 'string' }, detail: { type: 'string', description: 'The figures, and the cause if the record shows one — otherwise say the cause is not in the record.' }, source: { type: 'string', description: 'Which table or event this came from.' } }, required: ['what', 'detail', 'source'] } },
        meaning: { type: 'string', description: 'What the numbers mean for the ventures, in plain sentences. Where they mean nothing yet because the data is thin, say that.' },
        checks: { type: 'array', maxItems: 6, description: 'What the operator should verify, and why — a figure that looks wrong, a gap, a number that cannot be explained from the record.', items: { type: 'object', additionalProperties: false, properties: { what: { type: 'string' }, why: { type: 'string' }, room: { type: 'string', enum: ROOM_IDS } }, required: ['what', 'why', 'room'] } },
        proposals: roomProposals,
        summary: { type: 'string', description: 'TALLY reporting to Leo in five lines or fewer.' },
      },
      required: ['changes', 'meaning', 'checks', 'proposals', 'summary'],
    },
    instructions: [
      'You are TALLY, Treasurer of THE ARCANE, reading the books for Leo. You are handed the month\'s figures, what shipped and what it made, the stock and its margins, the journal, and the money events of the last fortnight.',
      'Answer four things, in order: what changed, why (only where the record shows a cause), what it means, and what should be checked. Typed revenue and realised profit answer different questions — never add them or treat one as the other.',
      'You are exact. A figure you cite is in the evidence. A change you name has a before and an after. A cause you give is an event in the record; otherwise say the record does not show why.',
      'A check is something Leo can verify in a room in a minute. A proposal is rarer: only when a figure warrants an action, and then the smallest one.',
    ].join('\n'),
  },
  /**
   * MERIDIAN — the Quartermaster. Operational intelligence. Reads the
   * chain — lots, stock, cover, the dispatch queue, what shipped and what
   * it cost — and names where it binds. Proposes reorders as orders in
   * THE LAB; never moves a vial itself.
   */
  meridian: {
    agent: 'meridian', holder: 'MERIDIAN', prefix: 'MER', skill: 'chain', objective: 'the chain, read',
    evidence: meridianEvidence, effort: 'medium', maxTokens: 6000,
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        bottlenecks: { type: 'array', maxItems: 6, description: 'Where the chain binds: a lot running out, a line with no COA on sale, a dispatch sitting, a line that cannot be costed.', items: { type: 'object', additionalProperties: false, properties: { where: { type: 'string', enum: ['supplier', 'lot', 'cost', 'product', 'dispatch', 'sale', 'cash'] }, what: { type: 'string' }, evidence: { type: 'string', description: 'The figure in the evidence that shows it.' }, effect: { type: 'string', description: 'What it stops, downstream.' } }, required: ['where', 'what', 'evidence', 'effect'] } },
        reorder: { type: 'array', maxItems: 8, description: 'Lines to reorder, with the cover figure that says so. Empty when nothing needs ordering.', items: { type: 'object', additionalProperties: false, properties: { product_id: { type: 'string' }, why: { type: 'string' }, vials: { type: 'integer', description: 'A sensible quantity given the rate, or 0 if the rate is unknown.' } }, required: ['product_id', 'why', 'vials'] } },
        proposals: roomProposals,
        summary: { type: 'string', description: 'MERIDIAN reporting to Leo in five lines or fewer.' },
      },
      required: ['bottlenecks', 'reorder', 'proposals', 'summary'],
    },
    instructions: [
      'You are MERIDIAN, Quartermaster of THE ARCANE, reading the operational chain for Arcane Peptides: supplier → lot → unit cost → product → dispatch → sale → cash.',
      'Find where it binds. A lot with days of cover left, a live line without a published COA, a dispatch that has sat in the queue, a line shipped with no lot so nothing was drawn down and nothing can be costed. Say what each one stops downstream.',
      'Cover is vials on hand over the last thirty days\' rate; where there is no rate, say the rate is unknown rather than guessing. A reorder names the product id from the evidence and the figure that warrants it.',
      'You are handed no clinical information and you give none: a product is a line with a cost, a price, a count and a certificate.',
    ].join('\n'),
  },
  /**
   * VECTOR — the Strategist. Strategic intelligence. Reads the whole
   * picture and returns where the empire stands and what, if anything,
   * should be put to the Council.
   */
  vector: {
    agent: 'vector', holder: 'VECTOR', prefix: 'VEC', skill: 'position', objective: 'the position, read',
    evidence: vectorEvidence, effort: 'high', maxTokens: 8000,
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        position: { type: 'string', description: 'Where the ventures stand against the ranking and the money, in a paragraph. Where the ranking is unset, say what the numbers would rank.' },
        risks: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false, properties: { what: { type: 'string' }, venture: { type: 'string', enum: [...VENTURE_IDS, 'all'] }, evidence: { type: 'string', description: 'The figure or fact in the evidence that shows it.' } }, required: ['what', 'venture', 'evidence'] } },
        opportunities: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false, properties: { what: { type: 'string' }, venture: { type: 'string', enum: [...VENTURE_IDS, 'all'] }, evidence: { type: 'string' } }, required: ['what', 'venture', 'evidence'] } },
        council: { type: ['object', 'null'], additionalProperties: false, description: 'One decision worth putting to the nine seats, or null. Only when the evidence shows a real fork — allocation, a venture to starve or push, a price, a build.', properties: { question: { type: 'string', description: 'The decision in one line, as a question.' }, case: { type: 'string', description: 'The case for putting it, citing the evidence. Four sentences at most.' } }, required: ['question', 'case'] },
        proposals: roomProposals,
        summary: { type: 'string', description: 'VECTOR reporting to Leo in five lines or fewer.' },
      },
      required: ['position', 'risks', 'opportunities', 'council', 'proposals', 'summary'],
    },
    instructions: [
      'You are VECTOR, Strategist of THE ARCANE, reading the position for Leo across four ventures: the ranking and allocation he set, the money by venture, the moves, what is blocked and stale, the Council\'s verdicts and their outcomes, the signals, and what other agents have proposed.',
      'Reason across capital, constraint and performance. Apply the decision principles in order: revenue before vanity; systems over hustle; no permission needed; the compounding test; the contrarian filter. Respect the ranking he set unless the numbers argue against it — then say so with the figure.',
      'A risk or an opportunity names a venture and the evidence. A Council question is rare: only where the evidence shows a real fork, and then the question in one line and the case in four sentences. Do not put to the Council what a single order would settle.',
    ].join('\n'),
    // The Council question rides with the proposals so the operator can approve it like any other.
    proposals: (out) => [...(out.proposals || []), ...(out.council?.question ? [{ room: 'council', text: `Convene the Council: ${out.council.question}`, priority: 'P1', why: out.council.case }] : [])],
  },
};

export default guard(['POST'], (req, res, auth) => {
  const id = String(req.body?.agent || '');
  const spec = SPECS[id];
  if (!spec) return json(res, 400, { error: `agent must be one of ${Object.keys(SPECS).join(', ')}` });
  return agentRun(req, res, auth, spec);
});
