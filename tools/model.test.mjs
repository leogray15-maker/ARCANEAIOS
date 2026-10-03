/**
 * The model provider, asserted: which provider the environment picks, and
 * that the local one answers in the shape every caller already reads — a
 * schema it was given is kept, a malformed answer is retried with the
 * reason, a missing server is a sentence, web search is refused rather
 * than faked. A stand-in for Ollama's HTTP endpoint; no network, no model.
 */
import { providerName, modelName, modelClient, ollamaClient, conforms } from '../packages/runtime/src/model.js';
import { memoryDb } from '../packages/database/src/memory.js';
import { state } from '../packages/database/src/state.js';
import { agentRun } from '../api/_agent.js';
import { tallyEvidence } from '../packages/database/src/evidence.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };

/* ---- which provider ---- */
ok(providerName({}) === '', 'nothing set: no provider');
ok(providerName({ ANTHROPIC_API_KEY: 'k' }) === 'anthropic', 'a key alone: Anthropic');
ok(providerName({ OLLAMA_URL: 'http://x' }) === 'ollama', 'an Ollama URL alone: Ollama');
ok(providerName({ ANTHROPIC_API_KEY: 'k', ARCANE_PROVIDER: 'ollama' }) === 'ollama', 'ARCANE_PROVIDER wins over a key');
ok(modelName({ ARCANE_PROVIDER: 'ollama', ARCANE_MODEL: 'claude-opus-5' }) === 'qwen3:14b', 'a Claude name is never sent to Ollama');
ok(modelName({ ARCANE_PROVIDER: 'ollama', ARCANE_MODEL: 'llama3.1:8b' }) === 'llama3.1:8b', 'a local name is kept');
ok(modelName({ ANTHROPIC_API_KEY: 'k' }) === 'claude-opus-5', 'Claude by default on Anthropic');
ok(modelClient({}) === null, 'no provider: no client');
ok(modelClient({ ARCANE_PROVIDER: 'ollama' })?.provider === 'ollama', 'Ollama needs no key');

/* ---- the schema check ---- */
const schema = { type: 'object', required: ['summary', 'proposals'], properties: { summary: { type: 'string' }, proposals: { type: 'array', maxItems: 2, items: { type: 'object', required: ['room'], properties: { room: { type: 'string', enum: ['lab', 'vault'] } } } } } };
ok(conforms(schema, { summary: 'x', proposals: [] }) === '', 'a conforming answer passes');
ok(/missing "proposals"/.test(conforms(schema, { summary: 'x' })), 'a missing field is named');
ok(/one of lab, vault/.test(conforms(schema, { summary: 'x', proposals: [{ room: 'moon' }] })), 'an enum is held');
ok(/more than 2/.test(conforms(schema, { summary: 'x', proposals: [{ room: 'lab' }, { room: 'lab' }, { room: 'lab' }] })), 'maxItems is held');
ok(conforms({ type: ['object', 'null'] }, null) === '', 'a nullable type admits null');

/* ---- a stand-in Ollama ---- */
function fakeOllama(replies) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url, body });
    const next = replies.shift();
    if (next instanceof Error) throw next;
    if (next?.status) return { ok: false, status: next.status, text: async () => next.text || '' };
    return { ok: true, status: 200, text: async () => JSON.stringify({ message: { role: 'assistant', content: typeof next === 'string' ? next : JSON.stringify(next) }, done_reason: 'stop', prompt_eval_count: 100, eval_count: 20 }) };
  };
  return { seen, fetchImpl };
}

const req = { model: 'claude-opus-5', max_tokens: 1000, system: [{ type: 'text', text: 'You are TALLY.' }], messages: [{ role: 'user', content: 'how are we?' }], output_config: { format: { type: 'json_schema', schema } } };

let f = fakeOllama([{ summary: 'fine', proposals: [] }]);
let r = await ollamaClient({ fetchImpl: f.fetchImpl, model: 'qwen3:14b' }).messages.create(req);
ok(r.stop_reason === 'end_turn' && JSON.parse(r.content[0].text).summary === 'fine', 'a conforming answer comes back in the Anthropic shape');
ok(r.usage.input_tokens === 100 && r.usage.output_tokens === 20, 'usage is carried');
ok(f.seen[0].url.endsWith('/api/chat') && f.seen[0].body.model === 'qwen3:14b', 'the local model is asked, not the Claude name');
ok(JSON.stringify(f.seen[0].body.format) === JSON.stringify(schema), 'the schema constrains the output');
ok(f.seen[0].body.messages[0].role === 'system' && f.seen[0].body.messages[0].content.includes('TALLY'), 'the system blocks become the system message');
ok(f.seen[0].body.stream === false, 'one answer, not a stream');

f = fakeOllama(['not json', { summary: 'x' }, { summary: 'fine', proposals: [] }]);
r = await ollamaClient({ fetchImpl: f.fetchImpl }).messages.create(req);
ok(JSON.parse(r.content[0].text).summary === 'fine' && f.seen.length === 3, 'a malformed answer is retried until it conforms');
ok(/missing "proposals"/.test(f.seen[2].body.messages.at(-1).content), 'and the model is told what it missed');
ok(r.usage.input_tokens === 300, 'and every attempt is counted');

f = fakeOllama(['no', 'no', 'no']);
let err = null; try { await ollamaClient({ fetchImpl: f.fetchImpl }).messages.create(req); } catch (e) { err = e; }
ok(err && err.status === 502 && /required shape/.test(err.message), 'three bad answers fail with a sentence');

f = fakeOllama([new Error('ECONNREFUSED')]);
err = null; try { await ollamaClient({ fetchImpl: f.fetchImpl }).messages.create(req); } catch (e) { err = e; }
ok(err && err.status === 503 && /ollama serve/.test(err.message), 'a stopped server says how to start it');

f = fakeOllama([{ status: 404, text: '{"error":"model \\"qwen3:14b\\" not found, try pulling it first"}' }]);
err = null; try { await ollamaClient({ fetchImpl: f.fetchImpl }).messages.create(req); } catch (e) { err = e; }
ok(err && /ollama pull qwen3:14b/.test(err.message), 'a missing model says how to pull it');

f = fakeOllama([]);
err = null; try { await ollamaClient({ fetchImpl: f.fetchImpl }).messages.create({ ...req, tools: [{ type: 'web_search_20260209', name: 'web_search' }] }); } catch (e) { err = e; }
ok(err && err.status === 501 && f.seen.length === 0, 'web search is refused, not faked, and nothing is sent');

f = fakeOllama(['plain words']);
r = await ollamaClient({ fetchImpl: f.fetchImpl }).messages.create({ messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] });
ok(r.content[0].text === 'plain words' && f.seen[0].body.format === undefined, 'without a schema it is plain text');

/* ---- an agent runs end to end on the local model ---- */
process.env.ARCANE_OPERATOR_KEY = 'an-operator-key-long-enough';
const now = new Date('2026-09-20T11:00:00');
const db = memoryDb();
await state.insert(db, 'ledger_months', { id: '2026-09:peptides', month: '2026-09', venture: 'peptides', revenue_gbp: 1805 }, { now });
const ev = await tallyEvidence(db, { now });
ok(ev.brief.includes('£1,805'), 'the reading is in the brief');
const answer = { summary: 'Revenue £1,805 this month.', findings: [], proposals: [{ room: 'vault', text: 'Type the cash figure', priority: 'P2', why: 'runway is unknown' }] };
f = fakeOllama([answer]);
const res = { code: 0, body: null, status(c) { this.code = c; return this; }, setHeader() { return this; }, send(b) { this.body = JSON.parse(b); } };
await agentRun({ body: { question: 'how are we?' }, query: {} }, res, { device: 't' }, {
  agent: 'tally', holder: 'TALLY', prefix: 'TAL', skill: 'tally-reading', objective: 'read the money',
  evidence: tallyEvidence, instructions: 'Read the money.', schema: { type: 'object', required: ['summary', 'proposals'], properties: { summary: { type: 'string' }, proposals: { type: 'array' } } },
}, { d: db, c: ollamaClient({ fetchImpl: f.fetchImpl }), now });
ok(res.code === 200 && res.body?.status === 'ok', `TALLY reads on the local model (${res.code} ${JSON.stringify(res.body).slice(0, 200)})`);
ok(f.seen[0].body.messages.at(-1).content.includes('£1,805'), 'the local model was handed the evidence');
const orders = await state.list(db, 'orders');
ok(orders.some((o) => o.state === 'proposed' && o.text === 'Type the cash figure'), 'and its proposal is written down, not acted on');

if (fails.length) { console.error(`✗ model: ${fails.length} failed\n  - ${fails.join('\n  - ')}`); process.exit(1); }
console.log('✓ model: provider choice, the local client in the Anthropic shape, schema retries, honest failures, an agent end to end');
