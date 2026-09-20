/**
 * Resilience: the error taxonomy, bounded exponential retry, loop
 * detection, bounded checkpoints. No real time is spent — `sleep` is
 * injected and just records what it was asked to wait.
 */
import { classify, withRetry, fingerprint, loopGuard, pushCheckpoint, latestCheckpoint } from '../packages/database/src/resilience.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
let n = 0;

/* ---- classification ---- */
ok(classify(429).kind === 'RETRYABLE', 'a rate limit is retryable'); n++;
ok(classify(503, 'the model is overloaded').kind === 'RETRYABLE', 'an overload is retryable'); n++;
ok(classify(0, 'ECONNRESET').kind === 'RETRYABLE', 'a network blip is retryable'); n++;
ok(classify(402, 'credit balance is too low').kind === 'ESCALATE', 'no credits escalates to a human'); n++;
ok(classify(401).kind === 'ESCALATE', 'a bad key escalates'); n++;
ok(classify(400).kind === 'FATAL', 'a bad request is fatal — retrying it does not help'); n++;
ok(classify(999, 'something odd').kind === 'ESCALATE', 'an unrecognised failure escalates rather than assumed safe to retry'); n++;
ok(typeof classify(429).suggestion === 'string' && classify(429).suggestion.length > 0, 'every classification carries a suggestion'); n++;

/* ---- bounded exponential retry ---- */
const delays = [];
const sleep = async (ms) => { delays.push(ms); };
let calls = 0;
const okAfterTwo = async () => { calls++; if (calls < 3) { const e = new Error('rate limited'); e.status = 429; throw e; } return 'done'; };
const r = await withRetry(okAfterTwo, { maxAttempts: 5, baseMs: 100, sleep });
ok(r === 'done' && calls === 3, `retries until it succeeds (${calls} calls)`); n++;
ok(delays.join(',') === '100,200', `backoff doubles each time (${delays.join(',')})`); n++;

calls = 0;
const alwaysFails = async () => { calls++; const e = new Error('still overloaded'); e.status = 503; throw e; };
let threw = null;
try { await withRetry(alwaysFails, { maxAttempts: 3, baseMs: 10, sleep }); } catch (e) { threw = e; }
ok(threw && calls === 3, `stops at maxAttempts (${calls} calls)`); n++;
ok(threw.kind === 'RETRYABLE', 'the final error still carries its classification'); n++;

calls = 0;
const fatal = async () => { calls++; const e = new Error('bad request'); e.status = 400; throw e; };
threw = null;
try { await withRetry(fatal, { maxAttempts: 5, baseMs: 10, sleep }); } catch (e) { threw = e; }
ok(threw && calls === 1, `a FATAL error is never retried (${calls} call)`); n++;

const capDelays = [];
calls = 0;
const neverSucceeds = async () => { calls++; const e = new Error('x'); e.status = 429; throw e; };
try { await withRetry(neverSucceeds, { maxAttempts: 6, baseMs: 1000, maxDelayMs: 3000, sleep: async (ms) => { capDelays.push(ms); } }); } catch {}
ok(Math.max(...capDelays) <= 3000, `backoff never exceeds maxDelayMs (${capDelays.join(',')})`); n++;

/* ---- loop guard ---- */
const f1 = fingerprint('web_search', { q: 'example.com pricing' });
const f2 = fingerprint('web_search', { q: 'example.com pricing' });
ok(f1 === f2, 'the same call fingerprints the same way'); n++;
ok(fingerprint('web_search', { q: 'a' }) !== fingerprint('web_search', { q: 'b' }), 'different arguments fingerprint differently'); n++;
ok(loopGuard([]).looped === false, 'an empty history has not looped'); n++;
ok(loopGuard(['a', 'b', 'c']).looped === false, 'no repetition is not a loop'); n++;
const repeated = loopGuard(['a', 'x', 'a', 'y', 'a'], { threshold: 3 });
ok(repeated.looped && repeated.pattern === 'repeat', `three repeats of the same step trips the guard (${JSON.stringify(repeated)})`); n++;
const pingpong = loopGuard(['a', 'b', 'a', 'b', 'a', 'b'], { cycles: 3, threshold: 99 });
ok(pingpong.looped && pingpong.pattern === 'ping-pong', `an A-B-A-B pattern trips the guard (${JSON.stringify(pingpong)})`); n++;
ok(loopGuard(['a', 'b', 'c', 'd', 'e', 'f'], { threshold: 3, cycles: 3 }).looped === false, 'six distinct steps is not a loop'); n++;

/* ---- checkpoints ---- */
let cps = [];
for (let i = 0; i < 8; i++) cps = pushCheckpoint(cps, { step: i }, { max: 5 });
ok(cps.length === 5, `bounded to the max (${cps.length})`); n++;
ok(cps[cps.length - 1].step === 7 && cps[0].step === 3, 'the newest five, oldest first'); n++;
ok(latestCheckpoint(cps).step === 7, 'latestCheckpoint reads the last one'); n++;
ok(latestCheckpoint([]) === null, 'no checkpoints is null, not a crash'); n++;

if (fails.length) { console.error(`✗ resilience: ${fails.length} failed`); for (const f of fails) console.error('  · ' + f); process.exit(1); }
console.log(`✓ resilience — the error taxonomy, bounded exponential retry, loop detection (repeat and ping-pong), bounded checkpoints (${n} checks)`);
