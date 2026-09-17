#!/usr/bin/env node
/**
 * The reasoning endpoints' gate.
 *
 *   node tools/api.test.mjs
 *
 * These three functions are the only part of THE ARCANE that faces the
 * public internet, and the only part that spends money when it runs. What
 * matters here is what happens *before* the model is called: the method
 * check, the device check, the shape of the request, and the refusal when
 * no key is configured. None of that needs an API key to assert, and all
 * of it is what a bad request would hit first.
 *
 * The model call itself is not exercised — it costs real money and needs
 * a key. What this proves is that nothing reaches it that should not.
 */
import assert from 'node:assert';

let failures = 0;
const ok = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { console.log(`✗ ${name} — ${e.message}`); failures++; }
};

/** Stand in for Vercel's response object, recording what the handler sent. */
function res() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.send = (b) => { r.body = JSON.parse(b); return r; };
  return r;
}
const call = async (handler, req) => { const r = res(); await handler(req, r); return r; };

// No key: knownDevice allows a well-formed code through, and client()
// returns null, so every endpoint must stop at 503 rather than throw.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.storage_SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const GOOD = 'sync-abcdefghijklmnopqrstuvwxyz';
const BAD = 'sync-not-a-real-code';

const counsel = (await import('../api/counsel.js')).default;
const council = (await import('../api/council.js')).default;
const intel = (await import('../api/intel.js')).default;

const endpoints = [
  ['counsel', counsel, { question: 'what should I do today?' }],
  ['council', council, { question: 'should I raise the price?' }],
  ['intel', intel, { watchlist: [{ text: 'a competitor' }] }],
];

for (const [name, handler, payload] of endpoints) {
  await ok(`${name}: GET is refused`, async () => {
    const r = await call(handler, { method: 'GET', body: {} });
    assert.equal(r.code, 405);
  });

  await ok(`${name}: an unknown device is refused`, async () => {
    const r = await call(handler, { method: 'POST', body: { code: BAD, ...payload } });
    assert.equal(r.code, 403, `got ${r.code}: ${JSON.stringify(r.body)}`);
  });

  await ok(`${name}: a missing device is refused`, async () => {
    const r = await call(handler, { method: 'POST', body: { ...payload } });
    assert.equal(r.code, 403);
  });

  await ok(`${name}: no API key stops before the model`, async () => {
    const r = await call(handler, { method: 'POST', body: { code: GOOD, ...payload } });
    assert.equal(r.code, 503, `got ${r.code}: ${JSON.stringify(r.body)}`);
    assert.match(r.body.error, /ANTHROPIC_API_KEY/);
  });

  await ok(`${name}: a body with no JSON at all is refused`, async () => {
    const r = await call(handler, { method: 'POST' });
    assert.ok(r.code >= 400, `got ${r.code}`);
  });
}

// Endpoint-specific request shape, checked before the device gate where it
// costs nothing, and after it where the check would leak what exists.
await ok('counsel: an empty question is refused', async () => {
  const r = await call(counsel, { method: 'POST', body: { code: GOOD, question: '   ' } });
  assert.equal(r.code, 400);
});

await ok('council: an empty question is refused', async () => {
  const r = await call(council, { method: 'POST', body: { code: GOOD, question: '' } });
  assert.equal(r.code, 400);
});

await ok('intel: an empty watchlist with no question is refused', async () => {
  const r = await call(intel, { method: 'POST', body: { code: GOOD, watchlist: [] } });
  assert.equal(r.code, 400, `got ${r.code}: ${JSON.stringify(r.body)}`);
  assert.match(r.body.error, /watchlist/);
});

await ok('intel: a question alone is enough to run', async () => {
  const r = await call(intel, { method: 'POST', body: { code: GOOD, watchlist: [], question: 'what is a competitor charging?' } });
  assert.equal(r.code, 503);   // reached the model call and stopped for the key
});

// The watchlist is the operator's list, so it must survive being handed in
// as either plain strings or the store's own {id,text} items.
await ok('intel: the watchlist takes strings or store items', async () => {
  for (const watchlist of [['a competitor'], [{ id: 'x', text: 'a competitor' }]]) {
    const r = await call(intel, { method: 'POST', body: { code: GOOD, watchlist } });
    assert.equal(r.code, 503, `${JSON.stringify(watchlist)} → ${r.code}`);
  }
});

await ok('intel: a watchlist of blanks counts as empty', async () => {
  const r = await call(intel, { method: 'POST', body: { code: GOOD, watchlist: ['', '   ', { text: '' }] } });
  assert.equal(r.code, 400);
});

console.log(failures ? `\n✗ api: ${failures} failed` : `\n✓ api: the gate holds on all three endpoints`);
process.exit(failures ? 1 : 0);
