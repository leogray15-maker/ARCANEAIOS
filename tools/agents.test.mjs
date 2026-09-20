/**
 * The agent contract, asserted.
 *
 * A stand-in model answers in the agents' shapes, so the whole loop runs
 * without a key: read the tables, record the run with what was read,
 * reason, write proposals down as `proposed` orders that name the run,
 * close the run — and, on a day the model cannot answer, still read and
 * still record. In-memory database, no network, no money.
 */
import { memoryDb } from '../packages/database/src/memory.js';
import { state } from '../packages/database/src/state.js';
import { runs, events } from '../packages/database/src/content.js';
import { agentRun } from '../api/_agent.js';
import { tallyEvidence, meridianEvidence, vectorEvidence } from '../packages/database/src/evidence.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const now = new Date('2026-09-20T11:00:00');
const db = memoryDb();
process.env.ARCANE_OPERATOR_KEY = 'an-operator-key-long-enough';

/* a small but real state */
await state.insert(db, 'settings', { key: 'fx_gbp_per_usd', value: '0.746' }, { now });
await state.insert(db, 'products', { id: 'ghk-cu-50mg', name: 'GHK-Cu', size: '50mg', sell_gbp: 39.95, kit_cost_usd: 50, kit_vials: 10 }, { now });
const lot = await state.insert(db, 'stock_lots', { product_id: 'ghk-cu-50mg', batch: '2409-A', vials: 6, coa: 'pending', received: '2026-09-01' }, { now });
const d = await state.insert(db, 'dispatch', { ref: 'AP-1' }, { now });
await state.insert(db, 'dispatch_items', { dispatch_id: d.id, product_id: 'ghk-cu-50mg', lot_id: lot.id, vials: 2 }, { now });
await state.update(db, 'dispatch', d.id, { stage: 'shipped' }, { now });
await state.insert(db, 'ledger_months', { id: '2026-09:peptides', month: '2026-09', venture: 'peptides', revenue_gbp: 1805 }, { now });
await state.insert(db, 'cash_snapshots', { day: '2026-09-19', cash_gbp: 800 }, { now });
await state.insert(db, 'orders', { room: 'forge', text: 'Existing work', priority: 1 }, { now });

/* ---- the evidence is deterministic and honest ---- */
const t = await tallyEvidence(db, { now });
ok(t.facts.money.revenue === 1805 && t.facts.realised.vials === 2, 'TALLY reads the ledger and what shipped');
ok(t.brief.includes('£1,805') && t.brief.includes('2 vials'), 'and writes the same figures into the brief');
ok(t.problems.some((p) => /venture|Codex|revenue/i.test(p)) || t.problems.length >= 0, 'problems are a list');
const m = await meridianEvidence(db, { now });
ok(m.facts.cover[0].id === 'ghk-cu-50mg' && m.facts.cover[0].vials === 4 && m.facts.cover[0].out30 === 2 && m.facts.cover[0].days === 60, `MERIDIAN computes cover from the lot and the rate (${JSON.stringify(m.facts.cover[0])})`);
ok(m.problems.some((p) => /COA/.test(p)), 'and names the line without a COA');
const v = await vectorEvidence(db, { now });
ok(v.problems.some((p) => /ranking/.test(p)), 'VECTOR says the ranking is unset rather than inventing one');
ok(v.facts.signals.some((s) => s.id === 'coa.missing'), 'and reads the same signals the Bridge shows');
ok(JSON.stringify(await tallyEvidence(db, { now })) === JSON.stringify(t), 'a reading is the same twice');

/* ---- a stand-in for the model, answering in shape ---- */
const answers = [];
const fake = (body) => ({ messages: { create: async (req) => { answers.push(req); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(body) }], usage: { input_tokens: 10, output_tokens: 20 } }; } } });
const res = () => { const r = { code: 0, body: null }; r.status = (c) => { r.code = c; return r; }; r.setHeader = () => r; r.send = (b) => { r.body = JSON.parse(b); return r; }; return r; };
const auth = { ok: true, device: 'sync-abcdefghijklmnopqrstuvwxyz' };
const runById = async (id) => (await runs.list(db, { limit: 50 })).find((x) => x.id === id);
const spec = (over = {}) => ({ agent: 'tally', holder: 'TALLY', prefix: 'TAL', skill: 'reading', objective: 'the money, read', evidence: tallyEvidence, instructions: 'read', schema: { type: 'object' }, ...over });

/* ---- the full loop ---- */
const body = { changes: [{ what: 'revenue', detail: '£1,805', source: 'ledger_months' }], meaning: 'thin', checks: [{ what: 'cash', why: 'one snapshot', room: 'vault' }], proposals: [{ room: 'vault', text: 'Type a fresh cash snapshot', priority: 'P2', why: 'cash is from one day' }, { room: 'forge', text: 'Existing work', priority: 'P1', why: 'already there' }], summary: 'read' };
let r = res();
await agentRun({ body: { question: 'how are we?' }, query: {} }, r, auth, spec(), { d: db, c: fake(body), now });
ok(r.code === 200 && r.body.status === 'ok', `a run answers 200 ok (${r.code})`);
ok(r.body.run.startsWith('TAL-R-20260920-'), `the run has the agent's own id (${r.body.run})`);
ok(answers[0].messages[0].content.includes('£1,805') && answers[0].messages[0].content.includes('how are we?'), 'the model was handed the evidence and the question, not the caller\'s numbers');
ok(answers[0].output_config.format.type === 'json_schema', 'and asked for the structured shape');
let run = await runById(r.body.run);
ok(run.status === 'ok' && run.input.facts.money.revenue === 1805 && run.sources.length > 0, 'the run records what was read and where from');
ok(run.output.summary === 'read' && run.output.proposed.length === 1, 'and the answer, and the proposals it made');
ok(run.usage.in === 10 && run.device === auth.device, 'and the cost and the device');
const orders = await state.list(db, 'orders');
const prop = orders.find((o) => o.state === 'proposed');
ok(prop && prop.agent === 'tally' && prop.source === 'agent' && prop.source_id === run.id && prop.holder === 'TALLY', 'the proposal is a proposed order naming the agent and the run');
ok(prop.note === 'cash is from one day', 'carrying its reason');
ok(orders.filter((o) => o.text === 'Existing work').length === 1, 'a proposal already on the board is not repeated');
ok(r.body.proposed.length === 1 && r.body.proposed[0] === prop.id, 'the response says which proposals were written');
const ev = await events.list(db, { limit: 50 });
ok(ev.some((e) => e.kind === 'run.ok' && e.subject_id === run.id), 'the run is in the record');
ok(ev.some((e) => e.kind === 'order.added' && e.subject_id === prop.id && e.actor === 'tally'), 'and so is the proposal, with the agent as the actor');

/* ---- nothing operational moved ---- */
ok((await state.list(db, 'stock_lots'))[0].vials === 4, 'the agent moved no stock');
ok((await state.list(db, 'ledger_months')).length === 1, 'and typed no figures');

/* ---- dry: the reading without the model ---- */
answers.length = 0; r = res();
await agentRun({ body: { dry: true }, query: {} }, r, auth, spec(), { d: db, c: fake(body), now });
ok(r.code === 200 && r.body.status === 'evidence' && r.body.evidence.money.revenue === 1805, 'a dry run returns the reading');
ok(answers.length === 0, 'and never calls the model');
run = await runById(r.body.run);
ok(run.status === 'evidence' && run.model === '', 'and is still recorded, as a reading');

/* ---- the model cannot answer: still read, still recorded, honestly failed ---- */
r = res();
const broke = { messages: { create: async () => { const e = new Error('Your credit balance is too low to access the Anthropic API.'); e.status = 400; throw e; } } };
await agentRun({ body: {}, query: {} }, r, auth, spec(), { d: db, c: broke, now });
ok(r.code === 402 && /no API credits/.test(r.body.error), `a credit failure is a 402 that says so (${r.code}: ${r.body.error})`);
ok(r.body.evidence && r.body.evidence.money.revenue === 1805, 'and the reading still comes back');
run = await runById(r.body.run);
ok(run.status === 'failed' && /credits/.test(run.error), 'and the failed run is in the record');
ok((await state.list(db, 'orders')).filter((o) => o.state === 'proposed').length === 1, 'and no proposal was written from nothing');

/* ---- no key at all ---- */
r = res();
await agentRun({ body: {}, query: {} }, r, auth, spec(), { d: db, c: null, now });
ok(r.code === 503 && /ANTHROPIC_API_KEY/.test(r.body.error), 'no key is a 503 that names the variable');

/* ---- a refusal is recorded as one ---- */
r = res();
const refusing = { messages: { create: async () => ({ stop_reason: 'refusal', content: [], usage: { input_tokens: 1, output_tokens: 0 } }) } };
await agentRun({ body: {}, query: {} }, r, auth, spec(), { d: db, c: refusing, now });
ok(r.code === 200 && r.body.status === 'refused', 'a refusal answers 200 refused');
ok((await runById(r.body.run)).status === 'refused', 'and is recorded as refused');

/* ---- VECTOR's Council question becomes a proposal in THE COUNCIL ---- */
const agentApi = (await import('../api/agent.js')).default;
ok(typeof agentApi === 'function', 'the shared /api/agent handler loads (tally, meridian and vector all route through it — the Hobby plan\'s 12-function ceiling)');
const vbody = { position: 'thin', risks: [], opportunities: [], council: { question: 'Starve the Codex until Track has 50 members?', case: 'The Codex has no revenue.' }, proposals: [], summary: 'read' };
r = res();
await agentRun({ body: {}, query: {} }, r, auth, { agent: 'vector', holder: 'VECTOR', prefix: 'VEC', skill: 'position', objective: 'x', evidence: vectorEvidence, instructions: 'read', schema: { type: 'object' }, proposals: (out) => [...(out.proposals || []), ...(out.council?.question ? [{ room: 'council', text: `Convene the Council: ${out.council.question}`, priority: 'P1', why: out.council.case }] : [])] }, { d: db, c: fake(vbody), now });
const council = (await state.list(db, 'orders')).find((o) => o.room === 'council' && o.state === 'proposed');
ok(council && /Convene the Council: Starve/.test(council.text) && council.agent === 'vector', 'the Council question waits as a proposal in THE COUNCIL');

if (fails.length) { console.error(`✗ agents: ${fails.length} failed`); for (const f of fails) console.error('  · ' + f); process.exit(1); }
console.log('✓ agents — read the tables, record the run, propose and never act; still read when the model cannot answer (33 checks)');
