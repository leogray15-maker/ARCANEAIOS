#!/usr/bin/env node
/**
 * The API's gate.
 *
 *   node tools/api.test.mjs
 *
 * `api/` is the only part of THE ARCANE that faces the public internet,
 * the only part that reaches the database, and the only part that spends
 * money when it runs. What matters here is what happens *before* any of
 * that: the method check, the operator key, the shape of the request, and
 * the refusal when a key is not configured. None of it needs a real key
 * to assert, and all of it is what a bad request hits first.
 *
 * The model call itself is never exercised — it costs money and needs a
 * key. What this proves is that nothing reaches it that should not.
 */
let failures = 0;
const ok = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { console.log(`✗ ${name} — ${e.message}`); failures++; }
};
const eq = (got, want, what) => { if (got !== want) throw new Error(`${what}: expected ${want}, got ${got}`); };

/** Stand in for Vercel's response object, recording what the handler sent. */
function res() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.send = (b) => { r.body = JSON.parse(b); return r; };
  return r;
}
const call = async (handler, req) => { const r = res(); await handler(req, r); return r; };

const KEY = 'an-operator-key-long-enough';
const CODE = 'sync-abcdefghijklmnopqrstuvwxyz';
const auth = (k) => ({ authorization: `Bearer ${k}` });

// No Anthropic key and no database: every endpoint must stop with a
// sentence rather than throw, and never reach the model.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.storage_SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.ARCANE_DB;

const counsel = (await import('../api/counsel.js')).default;
const council = (await import('../api/council.js')).default;
const intel = (await import('../api/intel.js')).default;
const herald = (await import('../api/herald.js')).default;
const stateApi = (await import('../api/state.js')).default;
const bridge = (await import('../api/bridge.js')).default;
const drafts = (await import('../api/drafts.js')).default;
const modules = (await import('../api/modules.js')).default;
const runsApi = (await import('../api/ai.js')).default;
const health = (await import('../api/health.js')).default;
const agentApi = (await import('../api/agent.js')).default;

const POST = [
  ['counsel', counsel, { question: 'what should I do today?' }],
  ['council', council, { question: 'should I raise the price?' }],
  ['intel', intel, { question: '' }],
  ['herald', herald, { module_id: 'x' }],
  ['tally', agentApi, { agent: 'tally' }],
  ['meridian', agentApi, { agent: 'meridian' }],
  ['vector', agentApi, { agent: 'vector' }],
  ['state', stateApi, { table: 'orders', row: { room: 'forge', text: 'x' } }],
];
const GET = [['bridge', bridge], ['drafts', drafts], ['modules', modules], ['runs', runsApi], ['health', health], ['state', stateApi]];

/* ---- with no operator key on the server, nothing opens ---- */
delete process.env.ARCANE_OPERATOR_KEY;
for (const [name, handler, body] of POST) {
  await ok(`${name}: refuses when the server has no operator key`, async () => {
    const r = await call(handler, { method: 'POST', headers: auth(KEY), query: {}, body: { code: CODE, ...body } });
    eq(r.code, 503, 'status');
    if (!/ARCANE_OPERATOR_KEY/.test(r.body.error)) throw new Error(`says why: ${r.body.error}`);
  });
}

/* ---- with a key on the server, the caller must carry it ---- */
process.env.ARCANE_OPERATOR_KEY = KEY;
for (const [name, handler, body] of POST) {
  await ok(`${name}: 401 without a key, 403 with the wrong one`, async () => {
    const none = await call(handler, { method: 'POST', headers: {}, query: {}, body: { code: CODE, ...body } });
    eq(none.code, 401, 'no key');
    const wrong = await call(handler, { method: 'POST', headers: auth('not-the-key-but-long'), query: {}, body: { code: CODE, ...body } });
    eq(wrong.code, 403, 'wrong key');
  });
}
for (const [name, handler] of GET) {
  await ok(`${name}: GET is gated too`, async () => {
    const none = await call(handler, { method: 'GET', headers: {}, query: {} });
    eq(none.code, 401, 'no key');
  });
}

/* ---- the method check ---- */
await ok('counsel: GET is refused', async () => {
  const r = await call(counsel, { method: 'GET', headers: auth(KEY), query: {}, body: {} });
  eq(r.code, 405, 'status');
});
await ok('bridge: POST is refused', async () => {
  const r = await call(bridge, { method: 'POST', headers: auth(KEY), query: {}, body: {} });
  eq(r.code, 405, 'status');
});

/* ---- past the gate: the shape of the request, before any model or table ---- */
await ok('counsel: an empty question is refused before the model', async () => {
  const r = await call(counsel, { method: 'POST', headers: auth(KEY), query: {}, body: { code: CODE, question: '  ' } });
  eq(r.code, 400, 'status');
});
await ok('council: an empty question is refused before the model', async () => {
  const r = await call(council, { method: 'POST', headers: auth(KEY), query: {}, body: { code: CODE, question: '' } });
  eq(r.code, 400, 'status');
});
await ok('herald: a missing module_id is refused before the model', async () => {
  const r = await call(herald, { method: 'POST', headers: auth(KEY), query: {}, body: { code: CODE } });
  eq(r.code, 400, 'status');
});
await ok('state: an unknown table is refused', async () => {
  const r = await call(stateApi, { method: 'POST', headers: auth(KEY), query: {}, body: { code: CODE, table: 'secrets', row: {} } });
  eq(r.code, 400, 'status');
  if (!/table must be one of/.test(r.body.error)) throw new Error(r.body.error);
});

/* ---- with no database, a gated call says so instead of throwing ---- */
await ok('bridge: no service key is a 503 that names the key', async () => {
  const r = await call(bridge, { method: 'GET', headers: auth(KEY), query: {} });
  eq(r.code, 503, 'status');
  if (!/SUPABASE_SERVICE_ROLE_KEY/.test(r.body.error)) throw new Error(r.body.error);
});
await ok('health: answers even with nothing configured, and never leaks a value', async () => {
  const r = await call(health, { method: 'GET', headers: auth(KEY), query: {} });
  eq(r.code, 200, 'status');
  const s = JSON.stringify(r.body);
  if (!/"anthropic":false/.test(s) || !/"service_key":false/.test(s)) throw new Error('reports what is missing');
  if (s.includes(KEY)) throw new Error('leaked the operator key');
  if (r.body.env.operator_key !== true) throw new Error('reports the operator key as set, without its value');
});

/* ---- the key is compared whole, not by prefix ---- */
await ok('a prefix of the key is not the key', async () => {
  const r = await call(counsel, { method: 'POST', headers: auth(KEY.slice(0, -1)), query: {}, body: { code: CODE, question: 'x' } });
  eq(r.code, 403, 'status');
});

console.log(failures ? `\n✗ api gate: ${failures} failed` : `\n✓ api gate: every endpoint refuses before it reaches the model or the database`);
await ok('ai: a bad body is refused with the reason, before the database', async () => {
  process.env.ARCANE_OPERATOR_KEY = KEY;
  const post = (body) => call(runsApi, { method: 'POST', headers: auth(KEY), query: {}, body: { code: CODE, ...body } });
  let r = await post({ action: 'run', id: 'not-an-agent' }); eq(r.code, 400, 'unknown agent');
  r = await post({ action: 'set', id: 'council', schedule: 'every tuesday' }); eq(r.code, 400, 'bad cron'); if (!/cron/.test(r.body.error)) throw new Error(r.body.error);
  r = await post({ action: 'review', id: 'OUT-1', status: 'published' }); eq(r.code, 400, 'bad review');
  r = await post({ action: 'delete', id: 'council' }); eq(r.code, 400, 'unknown action');
  r = await call(runsApi, { method: 'POST', headers: {}, query: {}, body: { action: 'run', id: 'council' } }); eq(r.code, 401, 'no key');
});
await ok('ai: /api/agents/<id>/run arrives as query action and id, and is validated the same way', async () => {
  const r = await call(runsApi, { method: 'POST', headers: auth(KEY), query: { action: 'run', id: 'nope' }, body: { code: CODE } });
  eq(r.code, 400, 'unknown agent via the rewrite');
});

const tick = (await import('../api/tick.js')).default;
const { cronAuthorized } = await import('../api/_auth.js');
await ok('tick: the x-vercel-cron header alone is not authority', async () => {
  const r = await call(tick, { method: 'GET', headers: { 'x-vercel-cron': '1' } });
  eq(r.code, 401, 'status');
});
await ok('tick: CRON_SECRET as a Bearer token is, and a wrong one is not', async () => {
  const env = { CRON_SECRET: 'a-cron-secret-long-enough', ARCANE_OPERATOR_KEY: KEY };
  eq(cronAuthorized({ headers: auth('a-cron-secret-long-enough') }, env), true, 'cron secret');
  eq(cronAuthorized({ headers: auth(KEY) }, env), true, 'operator key');
  eq(cronAuthorized({ headers: auth('a-cron-secret-long-enougX') }, env), false, 'wrong secret');
  eq(cronAuthorized({ headers: {} }, env), false, 'no header');
  eq(cronAuthorized({ headers: auth('short') }, { CRON_SECRET: 'short' }), false, 'a short secret is refused');
});

process.exit(failures ? 1 : 0);
