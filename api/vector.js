/**
 * VECTOR — the Strategist. Strategic intelligence.
 *
 * POST /api/vector { code, question?, dry? }
 *   → { run, position, risks, opportunities, council, proposals, summary, evidence, problems, sources }
 *
 * Reads the whole picture — the venture ranking, the money, the moves,
 * what is blocked, the verdicts and their outcomes, the signals — and
 * returns where the empire stands and what, if anything, should be put
 * to the Council. A Council question becomes a proposed order in THE
 * COUNCIL; the operator convenes it or not.
 */
import { guard, ROOM_LIST } from './_lib.js';
import { agentRun, PROPOSAL_SCHEMA } from './_agent.js';
import { vectorEvidence } from '../packages/database/src/evidence.js';
import { VENTURES } from '../packages/config/src/index.js';

const ROOM_IDS = ROOM_LIST.map((r) => r.id);
const VENTURE_IDS = VENTURES.map((v) => v.id);
const item = { type: 'object', additionalProperties: false, properties: { what: { type: 'string' }, venture: { type: 'string', enum: [...VENTURE_IDS, 'all'] }, evidence: { type: 'string', description: 'The figure or fact in the evidence that shows it.' } }, required: ['what', 'venture', 'evidence'] };
const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    position: { type: 'string', description: 'Where the ventures stand against the ranking and the money, in a paragraph. Where the ranking is unset, say what the numbers would rank.' },
    risks: { type: 'array', maxItems: 5, items: item },
    opportunities: { type: 'array', maxItems: 5, items: item },
    council: { type: ['object', 'null'], additionalProperties: false, description: 'One decision worth putting to the nine seats, or null. Only when the evidence shows a real fork — allocation, a venture to starve or push, a price, a build.', properties: { question: { type: 'string', description: 'The decision in one line, as a question.' }, case: { type: 'string', description: 'The case for putting it, citing the evidence. Four sentences at most.' } }, required: ['question', 'case'] },
    proposals: { ...PROPOSAL_SCHEMA, items: { ...PROPOSAL_SCHEMA.items, properties: { ...PROPOSAL_SCHEMA.items.properties, room: { type: 'string', enum: ROOM_IDS } } } },
    summary: { type: 'string', description: 'VECTOR reporting to Leo in five lines or fewer.' },
  },
  required: ['position', 'risks', 'opportunities', 'council', 'proposals', 'summary'],
};

export default guard(['POST'], (req, res, auth) => agentRun(req, res, auth, {
  agent: 'vector', holder: 'VECTOR', prefix: 'VEC', skill: 'position', objective: 'the position, read',
  evidence: vectorEvidence, schema, effort: 'high', maxTokens: 8000,
  instructions: [
    'You are VECTOR, Strategist of THE ARCANE, reading the position for Leo across four ventures: the ranking and allocation he set, the money by venture, the moves, what is blocked and stale, the Council\'s verdicts and their outcomes, the signals, and what other agents have proposed.',
    'Reason across capital, constraint and performance. Apply the decision principles in order: revenue before vanity; systems over hustle; no permission needed; the compounding test; the contrarian filter. Respect the ranking he set unless the numbers argue against it — then say so with the figure.',
    'A risk or an opportunity names a venture and the evidence. A Council question is rare: only where the evidence shows a real fork, and then the question in one line and the case in four sentences. Do not put to the Council what a single order would settle.',
  ].join('\n'),
  // The Council question rides with the proposals so the operator can approve it like any other.
  proposals: (out) => [...(out.proposals || []), ...(out.council?.question ? [{ room: 'council', text: `Convene the Council: ${out.council.question}`, priority: 'P1', why: out.council.case }] : [])],
}));
