#!/usr/bin/env node
// @ts-check
/**
 * The model router, with every provider faked.
 *
 *   node tools/ai.test.mjs
 *
 * No network and no keys: `fetch` is a script of answers, `sleep` is
 * instant. What is proved is the part that protects the money and the
 * floor — which model is tried, in what order, what is skipped and why,
 * and that a paid model is never reached with the gate shut or the
 * budget spent.
 */
import { z } from 'zod';
import { runModel, AiError, extractJson, MODELS, TIERS, NAMED, COUNCIL_PANEL, resolveChain, pingProviders } from '../packages/ai/src/index.js';

let failures = 0, n = 0;
/** @param {string} name @param {() => Promise<void> | void} fn */
const ok = async (name, fn) => {
  n++;
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { console.log(`✗ ${name} — ${e instanceof Error ? e.message : String(e)}`); failures++; }
};
/** @param {unknown} got @param {unknown} want @param {string} what */
const eq = (got, want, what) => { if (got !== want) throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };
/** @param {unknown} cond @param {string} what */
const truthy = (cond, what) => { if (!cond) throw new Error(what); };

/** A chat-completions body. @param {string} content @param {Record<string, unknown>} [extra] */
const answer = (content, extra = {}) => ({ status: 200, body: { model: 'served/model', choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 50 }, ...extra } });

/**
 * A fake fetch that answers by model id. Each entry is a list of replies
 * used in order; `'timeout'` hangs until aborted.
 * @param {Record<string, Array<{ status: number, body: unknown } | 'timeout'>>} script
 */
function fakeFetch(script) {
  /** @type {Array<{ url: string, model: string, body: Record<string, unknown>, headers: Record<string, string> }>} */
  const calls = [];
  /** @type {typeof globalThis.fetch} */
  const f = async (url, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    calls.push({ url: String(url), model: body.model, body, headers: /** @type {Record<string, string>} */ (init?.headers || {}) });
    const queue = script[body.model] || [];
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (!next) return new Response(JSON.stringify({ error: { message: 'no such model' } }), { status: 404 });
    if (next === 'timeout') {
      return new Promise((_, reject) => { init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))); });
    }
    return new Response(JSON.stringify(next.body), { status: next.status });
  };
  return { f, calls };
}

const ENV_FREE = { OPENROUTER_API_KEY: 'sk-or-test', GEMINI_API_KEY: 'g-test' };
const ENV_PAID = { ...ENV_FREE, ALLOW_PAID_MODELS: 'true', MONTHLY_BUDGET_GBP: '10' };
const base = { sleep: async () => {}, random: () => 0.5, limits: { timeoutMs: 30 } };
const msgs = [{ role: /** @type {const} */ ('user'), content: 'hello' }];

await ok('config: every tier, named model and council seat names a model that exists', () => {
  for (const [t, keys] of Object.entries(TIERS)) for (const k of keys) truthy(MODELS[k], `tier ${t} names unknown ${k}`);
  for (const [nm, v] of Object.entries(NAMED)) for (const k of v.chain) truthy(MODELS[k], `named ${nm} names unknown ${k}`);
  for (const s of COUNCIL_PANEL) for (const k of s.chain) truthy(MODELS[k], `council ${s.seat} names unknown ${k}`);
});
await ok('config: the grunt tier is free models only', () => {
  for (const k of TIERS.grunt) truthy(MODELS[k].free, `${k} in grunt is paid`);
});
await ok('config: in every tier, no free model comes after a paid one', () => {
  for (const [t, keys] of Object.entries(TIERS)) {
    const firstPaid = keys.findIndex((k) => !MODELS[k].free);
    if (firstPaid >= 0) truthy(keys.slice(firstPaid).every((k) => !MODELS[k].free), `${t}: a free model after a paid one`);
  }
});

await ok('success: the first model answers, with provider, tokens, cost and latency', async () => {
  const { f, calls } = fakeFetch({ 'gemini-3.5-flash-lite': [answer('a summary')] });
  const r = await runModel({ tier: 'grunt', messages: msgs, purpose: 'test' }, { ...base, env: ENV_FREE, fetch: f });
  eq(r.text, 'a summary', 'text'); eq(r.model, 'gemini-flash-lite', 'model'); eq(r.provider, 'gemini', 'provider');
  eq(r.usage.in, 100, 'tokens in'); eq(r.costUsd, 0, 'free costs nothing'); eq(calls.length, 1, 'one call');
  truthy(calls[0].url.startsWith('https://generativelanguage.googleapis.com/v1beta/openai/'), `gemini endpoint (${calls[0].url})`);
  eq(calls[0].headers.Authorization, 'Bearer g-test', 'the gemini key is sent to gemini');
});

await ok('fallback on 429: rate-limited twice, the next model answers', async () => {
  const { f, calls } = fakeFetch({ 'gemini-3.5-flash-lite': [{ status: 429, body: { error: { message: 'slow down' } } }], 'nvidia/nemotron-3-super-120b-a12b:free': [answer('from nemotron')] });
  const r = await runModel({ tier: 'grunt', messages: msgs }, { ...base, env: ENV_FREE, fetch: f });
  eq(r.model, 'nemotron-super-free', 'fell back'); eq(calls.filter((c) => c.model === 'gemini-3.5-flash-lite').length, 2, 'the 429 model was retried once');
  eq(r.attempts.filter((a) => a.outcome === 'failed').length, 2, 'two failures recorded'); truthy(r.attempts[0].status === 429, 'status kept');
});

await ok('fallback on 5xx and on a network failure', async () => {
  /** @type {typeof globalThis.fetch} */
  const f = async (url, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    if (body.model === 'gemini-3.5-flash-lite') return new Response('{"error":{"message":"boom"}}', { status: 503 });
    if (body.model === 'nvidia/nemotron-3-super-120b-a12b:free') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(answer('third time').body), { status: 200 });
  };
  const r = await runModel({ tier: 'grunt', messages: msgs }, { ...base, env: ENV_FREE, fetch: f });
  eq(r.model, 'nex-mini-free', 'third model answered');
});

await ok('fallback on timeout: a hung model is abandoned and the next answers', async () => {
  const { f } = fakeFetch({ 'gemini-3.5-flash-lite': ['timeout'], 'nvidia/nemotron-3-super-120b-a12b:free': [answer('in time')] });
  const r = await runModel({ tier: 'grunt', messages: msgs }, { ...base, env: ENV_FREE, fetch: f });
  eq(r.text, 'in time', 'answer'); truthy(r.attempts.some((a) => /timed out/.test(a.reason)), 'the timeout is named');
});

await ok('paid block: with ALLOW_PAID_MODELS off, a paid model is never requested', async () => {
  const { f, calls } = fakeFetch({ 'anthropic/claude-sonnet-5': [answer('should not happen')] });
  let err = null;
  try { await runModel({ chain: ['claude-sonnet'], messages: msgs }, { ...base, env: { ...ENV_FREE, MONTHLY_BUDGET_GBP: '100' }, fetch: f, monthSpendGbp: async () => 0 }); } catch (e) { err = e; }
  truthy(err instanceof AiError, 'refused'); eq(calls.length, 0, 'no request made');
  truthy(/ALLOW_PAID_MODELS/.test(err instanceof AiError ? err.message : ''), 'says why');
});
await ok('paid block: "TRUE", "1" and "yes" do not open the gate — only "true"', async () => {
  for (const v of ['TRUE', '1', 'yes', ' true']) {
    const { f, calls } = fakeFetch({ 'anthropic/claude-sonnet-5': [answer('x')] });
    try { await runModel({ chain: ['claude-sonnet'], messages: msgs }, { ...base, env: { ...ENV_PAID, ALLOW_PAID_MODELS: v }, fetch: f, monthSpendGbp: async () => 0 }); } catch {}
    eq(calls.length, 0, `ALLOW_PAID_MODELS=${JSON.stringify(v)}`);
  }
});
await ok('paid block: the writer tier with paid off uses only free models', async () => {
  const { f, calls } = fakeFetch({});
  try { await runModel({ tier: 'writer', messages: msgs }, { ...base, env: ENV_FREE, fetch: f }); } catch {}
  truthy(calls.length > 0 && calls.every((c) => !['deepseek/deepseek-v4.1-flash', 'anthropic/claude-sonnet-5'].includes(c.model)), 'no paid request');
});

await ok('budget block: spend at the limit stops a paid call before the request', async () => {
  const { f, calls } = fakeFetch({ 'anthropic/claude-sonnet-5': [answer('x')] });
  let err = null;
  try { await runModel({ chain: ['claude-sonnet'], messages: msgs }, { ...base, env: ENV_PAID, fetch: f, monthSpendGbp: async () => 9.99 }); } catch (e) { err = e; }
  truthy(err instanceof AiError && /monthly budget/.test(err.message), `refused on budget (${err instanceof Error ? err.message : ''})`); eq(calls.length, 0, 'no request made');
});
await ok('budget block: no MONTHLY_BUDGET_GBP, or no spend ledger, means no paid call (fails closed)', async () => {
  const { f, calls } = fakeFetch({ 'anthropic/claude-sonnet-5': [answer('x')] });
  try { await runModel({ chain: ['claude-sonnet'], messages: msgs }, { ...base, env: { ...ENV_PAID, MONTHLY_BUDGET_GBP: '' }, fetch: f, monthSpendGbp: async () => 0 }); } catch {}
  try { await runModel({ chain: ['claude-sonnet'], messages: msgs }, { ...base, env: ENV_PAID, fetch: f }); } catch {}
  try { await runModel({ chain: ['claude-sonnet'], messages: msgs }, { ...base, env: ENV_PAID, fetch: f, monthSpendGbp: async () => { throw new Error('db down'); } }); } catch {}
  eq(calls.length, 0, 'no request in any of the three');
});
await ok('budget: under the limit a paid call goes, and its cost is the provider-reported one', async () => {
  const { f, calls } = fakeFetch({ 'anthropic/claude-sonnet-5': [answer('paid answer', { usage: { prompt_tokens: 1000, completion_tokens: 500, cost: 0.007 } })] });
  /** @type {import('../packages/ai/src/router.js').UsageRecord[]} */
  const logged = [];
  const r = await runModel({ chain: ['claude-sonnet'], messages: msgs, purpose: 'council' }, { ...base, env: ENV_PAID, fetch: f, monthSpendGbp: async () => 1, onUsage: (u) => { logged.push(u); }, fxGbpPerUsd: 0.8 });
  eq(r.costUsd, 0.007, 'reported cost used'); eq(Math.round(r.costGbp * 1e6), 5600, 'converted to GBP');
  eq(calls[0].body.usage && /** @type {{ include?: boolean }} */ (calls[0].body.usage).include, true, 'OpenRouter asked to report cost');
  eq(logged.length, 1, 'usage logged'); eq(logged[0].purpose, 'council', 'purpose logged'); eq(logged[0].ok, true, 'ok logged');
});
await ok('maxCostGbp: a single paid call estimated over the cap is skipped', async () => {
  const { f, calls } = fakeFetch({ 'anthropic/claude-opus-5.5': [answer('x')] });
  try { await runModel({ chain: ['claude-opus'], messages: msgs, maxTokens: 100_000, maxCostGbp: 0.01 }, { ...base, env: ENV_PAID, fetch: f, monthSpendGbp: async () => 0 }); } catch {}
  eq(calls.length, 0, 'skipped on the cap');
});

const Verdict = z.object({ verdict: z.enum(['GO', 'NO']), reasons: z.array(z.string()).min(1) });
await ok('invalid JSON retry: a bad answer is sent back once, and the corrected one is accepted', async () => {
  const { f, calls } = fakeFetch({ 'gemini-3.5-flash-lite': [answer('Sure! Here is my verdict: GO'), answer('```json\n{"verdict":"GO","reasons":["cheap"]}\n```')] });
  const r = await runModel({ tier: 'grunt', messages: msgs, schema: Verdict }, { ...base, env: ENV_FREE, fetch: f });
  eq(/** @type {{ verdict: string }} */ (r.data).verdict, 'GO', 'parsed'); eq(calls.length, 2, 'retried on the same model');
  const second = /** @type {Array<{ role: string, content: string }>} */ (calls[1].body.messages);
  truthy(/not usable/.test(second[second.length - 1].content), 'the retry says what was wrong');
  truthy(calls[0].body.response_format, 'a schema-capable model gets response_format');
});
await ok('invalid JSON twice: the router moves to the next model', async () => {
  const { f } = fakeFetch({ 'gemini-3.5-flash-lite': [answer('{"verdict":"MAYBE","reasons":[]}')], 'nvidia/nemotron-3-super-120b-a12b:free': [answer('{"verdict":"NO","reasons":["risk"]}')] });
  const r = await runModel({ tier: 'grunt', messages: msgs, schema: Verdict }, { ...base, env: ENV_FREE, fetch: f });
  eq(r.model, 'nemotron-super-free', 'fell back'); eq(/** @type {{ verdict: string }} */ (r.data).verdict, 'NO', 'valid answer kept');
});
await ok('malformed 200: a body that is not a completion is a fallback, not a crash', async () => {
  const { f } = fakeFetch({ 'gemini-3.5-flash-lite': [{ status: 200, body: { nothing: 'here' } }], 'nvidia/nemotron-3-super-120b-a12b:free': [answer('fine')] });
  const r = await runModel({ tier: 'grunt', messages: msgs }, { ...base, env: ENV_FREE, fetch: f });
  eq(r.text, 'fine', 'answered by the next model');
});

await ok('a rejected key retires the provider for the rest of the call', async () => {
  const { f, calls } = fakeFetch({ 'nvidia/nemotron-3-super-120b-a12b:free': [{ status: 401, body: { error: { message: 'bad key' } } }], 'nex-agi/nex-n2.5-mini:free': [answer('x')] });
  let err = null;
  try { await runModel({ tier: 'grunt', messages: msgs }, { ...base, env: { OPENROUTER_API_KEY: 'sk-or-bad' }, fetch: f }); } catch (e) { err = e; }
  truthy(err instanceof AiError, 'all failed'); eq(calls.length, 1, 'one OpenRouter call, then the provider is skipped');
});
await ok('a provider with no key is skipped without a request', async () => {
  const { f, calls } = fakeFetch({ 'nvidia/nemotron-3-super-120b-a12b:free': [answer('no gemini key needed')] });
  const r = await runModel({ tier: 'grunt', messages: msgs }, { ...base, env: { OPENROUTER_API_KEY: 'k' }, fetch: f });
  eq(r.model, 'nemotron-super-free', 'first OpenRouter model'); truthy(r.attempts[0].outcome === 'skipped' && /GEMINI_API_KEY/.test(r.attempts[0].reason), 'the skip names the missing key');
  truthy(calls.every((c) => !c.url.includes('googleapis')), 'no request to gemini');
});
await ok('GEMINI_BILLING=paid puts Gemini behind the paid gate', async () => {
  const { f, calls } = fakeFetch({ 'nvidia/nemotron-3-super-120b-a12b:free': [answer('x')] });
  await runModel({ tier: 'grunt', messages: msgs }, { ...base, env: { ...ENV_FREE, GEMINI_BILLING: 'paid' }, fetch: f });
  truthy(calls.every((c) => !c.url.includes('googleapis')), 'gemini not called with paid off');
});
await ok('an error body never carries the key back out', async () => {
  const { f } = fakeFetch({ 'gemini-3.5-flash-lite': [{ status: 400, body: { error: { message: 'bad request for sk-or-v1-abcdefghijkl' } } }], 'nvidia/nemotron-3-super-120b-a12b:free': [answer('ok')] });
  const r = await runModel({ tier: 'grunt', messages: msgs }, { ...base, env: ENV_FREE, fetch: f });
  truthy(r.attempts.some((a) => /\[redacted\]/.test(a.reason)) && r.attempts.every((a) => !/sk-or-v1-abcdefghijkl/.test(a.reason)), 'the key-shaped string is redacted');
});
await ok('an unknown model key is a config error, not a silent skip', () => {
  let err = null; try { resolveChain({ chain: ['not-a-model'] }); } catch (e) { err = e; }
  truthy(err instanceof AiError && /unknown model key/.test(err.message), 'thrown');
});
await ok('extractJson: bare, fenced and embedded', () => {
  eq(extractJson('{"a":1}').ok, true, 'bare'); eq(extractJson('```json\n{"a":1}\n```').ok, true, 'fenced');
  eq(extractJson('Here you go: {"a":1} hope that helps').ok, true, 'embedded'); eq(extractJson('no json').ok, false, 'none');
});

await ok('health: each provider is ok, missing or failing, and a key never comes back out', async () => {
  const KEYS = { OPENROUTER_API_KEY: 'sk-or-v1-secretsecretsecret', GEMINI_API_KEY: 'AIzaSecretSecretSecretSecret12' };
  /** @type {string[]} */ const asked = [];
  /** @type {typeof globalThis.fetch} */
  const f = async (url, init) => {
    asked.push(`${init?.method || 'GET'} ${url}`);
    if (String(url).includes('openrouter')) return new Response(JSON.stringify({ error: { message: 'Invalid key sk-or-v1-secretsecretsecret' } }), { status: 401 });
    return new Response('{"models":[]}', { status: 200 });
  };
  const h = await pingProviders(KEYS, f);
  const by = Object.fromEntries(h.map((x) => [x.provider, x]));
  eq(by.openrouter.state, 'failing', 'openrouter failing'); eq(by.gemini.state, 'ok', 'gemini ok'); eq(by.groq.state, 'missing', 'groq missing');
  truthy(!JSON.stringify(h).includes('secretsecret'), 'no key in the report');
  truthy(asked.some((a) => a.startsWith('POST https://openrouter.ai/api/v1/chat/completions')) && asked.some((a) => a.includes('generativelanguage.googleapis.com/v1beta/models')), 'the cheap checks were used');
  eq(asked.length, 2, 'providers without a key are not called');
});

console.log(failures ? `\n✗ ai: ${failures} of ${n} failed` : `\n✓ ai — router, fallbacks, paid gate, budget, JSON (${n} checks)`);
process.exit(failures ? 1 : 0);
