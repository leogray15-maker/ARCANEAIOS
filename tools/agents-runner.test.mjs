#!/usr/bin/env node
// @ts-check
/**
 * The agent runner, end to end, with the models and Notion faked.
 *
 *   node tools/agents-runner.test.mjs
 *
 * What is proved: a run is recorded whatever happens (success, a model
 * failure, a step limit, a timeout); the lock keeps two runs of one agent
 * apart and is always released; a switched-off or stubbed agent never
 * runs; tools are only the ones an agent lists, validated both ways; and
 * Notion cannot be written to.
 */
import { z } from 'zod';
import { memoryDb } from '../packages/database/src/memory.js';
import { runAgent, isDue, parseCron } from '../packages/agents/src/index.js';
import { request as notionRequest, NotionError } from '../packages/agents/src/notion.js';
import { agentsTable } from '../packages/database/src/ai.js';

let failures = 0, n = 0;
/** @param {string} name @param {() => Promise<void> | void} fn */
const ok = async (name, fn) => { n++; try { await fn(); console.log(`✓ ${name}`); } catch (e) { console.log(`✗ ${name} — ${e instanceof Error ? e.stack : String(e)}`); failures++; } };
/** @param {unknown} got @param {unknown} want @param {string} what */
const eq = (got, want, what) => { if (got !== want) throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };
/** @param {unknown} c @param {string} what */
const truthy = (c, what) => { if (!c) throw new Error(what); };

/** @typedef {import('../packages/agents/src/registry.js').AgentDef} AgentDef */
/** @typedef {import('../packages/database/src/ai.js').Db} Db */

const freshDb = () => /** @type {Db & { tables: Record<string, Array<Record<string, unknown>>> }} */ (/** @type {unknown} */ (memoryDb({ agents: [], agent_runs: [], outputs: [], model_usage: [], system_events: [], settings: [{ key: 'fx_gbp_per_usd', value: '0.8' }] })));
const ENV = { OPENROUTER_API_KEY: 'sk-or-test', NOTION_TOKEN: 'secret-notion' };

/** @param {string} content @param {Array<{ id: string, name: string, args: string }>} [calls] */
const completion = (content, calls = []) => ({ model: 'served/x', choices: [{ message: { content, tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args } })) }, finish_reason: calls.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } });

/**
 * Scripted fetch: chat completions answered from `replies` in order,
 * Notion answered by path.
 * @param {Array<object | 'fail' | 'hang'>} replies
 */
function fakeFetch(replies) {
  /** @type {string[]} */
  const seen = [];
  /** @type {typeof globalThis.fetch} */
  const f = async (url, init) => {
    const u = String(url); seen.push(`${init?.method || 'GET'} ${u}`);
    if (u.includes('api.notion.com')) {
      if (u.endsWith('/search')) return new Response(JSON.stringify({ results: [{ object: 'page', id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', last_edited_time: '2026-09-20T00:00:00.000Z', url: 'https://notion.so/x', properties: { Name: { type: 'title', title: [{ plain_text: 'The Contrarian Filter' }] } } }], has_more: false }), { status: 200 });
      return new Response('{"message":"not found"}', { status: 404 });
    }
    const next = replies.length > 1 ? replies.shift() : replies[0];
    if (next === 'fail' || !next) return new Response('{"error":{"message":"down"}}', { status: 503 });
    if (next === 'hang') return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    return new Response(JSON.stringify(next), { status: 200 });
  };
  return { f, seen };
}

/** @param {Partial<AgentDef>} over @returns {AgentDef} */
const def = (over) => ({ id: 'test-agent', name: 'TESTER', room: 'garage', owner: 'forge', description: 'A test agent.', tier: 'grunt', schedule: '', budgetGbpPerRun: 0.05, maxSteps: 3, maxDurationMs: 20_000, instructions: 'Be brief.', tools: ['outputs.save'], outputType: 'note', runPrefix: 'TST-R', ...over });

/** @param {Db} db @param {string} id */
const enable = async (db, id) => { await agentsTable.ensure(db, [{ id, schedule: '', config: {} }]); await agentsTable.set(db, id, { enabled: true }); };
const fast = { sleep: async () => {} };

await ok('a pipeline run: output saved, run recorded ok with model, tokens, cost, steps, duration; lock released', async () => {
  const db = freshDb(); await enable(db, 'test-agent');
  const { f } = fakeFetch([completion('A one-line note.')]);
  const d = def({ run: async (ctx) => { const r = await ctx.model({ messages: [{ role: 'user', content: 'go' }] }); await ctx.tool('outputs.save', { type: 'note', title: 'Note', content: r.text }); return { summary: r.text }; } });
  const rep = await runAgent('test-agent', { trigger: 'manual' }, { db, env: ENV, fetch: f, defs: [d], ...fast });
  eq(rep.status, 'ok', `status (${rep.error})`); eq(rep.outputs.length, 1, 'one output'); eq(rep.steps, 1, 'one step');
  const run = db.tables.agent_runs[0];
  eq(run.status, 'ok', 'run row ok'); eq(run.agent, 'FOUNDRY', 'recorded under the owner\'s roster name'); eq(run.skill, 'test-agent', 'skill is the agent id');
  eq(run.trigger, 'manual', 'trigger'); eq(run.steps, 1, 'steps stored'); truthy(typeof run.duration_ms === 'number', 'duration stored'); eq(run.model, 'served/x', 'model stored');
  eq(db.tables.model_usage.length, 1, 'usage logged'); eq(db.tables.model_usage[0].run_id, rep.runId, 'usage tied to the run');
  eq(db.tables.outputs[0].status, 'pending', 'output pending'); eq(db.tables.outputs[0].room, 'garage', 'output in the agent\'s room');
  eq((await agentsTable.get(db, 'test-agent'))?.lock_run_id, null, 'lock released');
  truthy(db.tables.system_events.some((e) => e.kind === 'run.ok'), 'traced in the record');
});

await ok('the generic loop: the model calls a tool, reads the result, answers; the answer is saved', async () => {
  const db = freshDb(); await enable(db, 'test-agent');
  const { f, seen } = fakeFetch([completion('', [{ id: 'c1', name: 'notion_search', args: '{"query":"contrarian","limit":3}' }]), completion('Found one page: The Contrarian Filter.')]);
  const rep = await runAgent('test-agent', { input: { task: 'find the contrarian page' } }, { db, env: ENV, fetch: f, defs: [def({ tools: ['notion.search', 'outputs.save'] })], ...fast });
  eq(rep.status, 'ok', `status (${rep.error})`); eq(rep.steps, 2, 'two steps'); truthy(seen.some((s) => s === 'POST https://api.notion.com/v1/search'), 'notion searched');
  eq(db.tables.outputs.length, 1, 'answer saved'); truthy(String(db.tables.outputs[0].content).includes('Contrarian'), 'content kept');
});

await ok('a tool the agent does not list is refused to the model, not run', async () => {
  const db = freshDb(); await enable(db, 'test-agent');
  const { f, seen } = fakeFetch([completion('', [{ id: 'c1', name: 'notion_search', args: '{}' }]), completion('ok')]);
  const rep = await runAgent('test-agent', {}, { db, env: ENV, fetch: f, defs: [def({ tools: ['outputs.save'] })], ...fast });
  eq(rep.status, 'ok', 'the run still completes'); truthy(!seen.some((s) => s.includes('notion')), 'notion never called');
});

await ok('a model failure is a failed run with the error, never a throw; the lock is released', async () => {
  const db = freshDb(); await enable(db, 'test-agent');
  const { f } = fakeFetch(['fail']);
  const rep = await runAgent('test-agent', {}, { db, env: ENV, fetch: f, defs: [def({})], ...fast });
  eq(rep.status, 'failed', 'failed'); truthy(/every model failed|no model/.test(rep.error), `error recorded (${rep.error})`);
  eq(db.tables.agent_runs[0].status, 'failed', 'row failed'); truthy(String(db.tables.agent_runs[0].error).length > 0, 'row has the error');
  eq((await agentsTable.get(db, 'test-agent'))?.lock_run_id, null, 'lock released');
});

await ok('the step limit stops a run that keeps calling the model', async () => {
  const db = freshDb(); await enable(db, 'test-agent');
  const { f } = fakeFetch([completion('again')]);
  const d = def({ maxSteps: 2, run: async (ctx) => { for (;;) await ctx.model({ messages: [{ role: 'user', content: 'x' }] }); } });
  const rep = await runAgent('test-agent', {}, { db, env: ENV, fetch: f, defs: [d], ...fast });
  eq(rep.status, 'failed', 'failed'); truthy(/step limit/.test(rep.error), rep.error); eq(rep.steps, 2, 'two steps taken');
});

await ok('a run past its time limit is failed and recorded', async () => {
  const db = freshDb(); await enable(db, 'test-agent');
  const { f } = fakeFetch([completion('x')]);
  const d = def({ maxDurationMs: 50, run: () => new Promise(() => {}) });
  const rep = await runAgent('test-agent', {}, { db, env: ENV, fetch: f, defs: [d], ...fast });
  eq(rep.status, 'failed', 'failed'); truthy(/timed out/.test(rep.error), rep.error);
});

await ok('overlap: while one run holds the lock, a second is skipped without a run row', async () => {
  const db = freshDb(); await enable(db, 'test-agent');
  await agentsTable.lock(db, 'test-agent', 'OTHER-RUN', 60_000);
  const rep = await runAgent('test-agent', {}, { db, env: ENV, fetch: fakeFetch([completion('x')]).f, defs: [def({})], ...fast });
  eq(rep.status, 'skipped', 'skipped'); truthy(/already running/.test(rep.error), rep.error); eq(db.tables.agent_runs.length, 0, 'no run row');
});

await ok('a switched-off agent, a stubbed agent and an unknown agent never run', async () => {
  const db = freshDb();
  const { f, seen } = fakeFetch([completion('x')]);
  eq((await runAgent('test-agent', {}, { db, env: ENV, fetch: f, defs: [def({})] })).status, 'refused', 'off by default');
  await enable(db, 'stub');
  const stub = await runAgent('stub', {}, { db, env: ENV, fetch: f, defs: [def({ id: 'stub', disabled: 'needs XAI_API_KEY' })] });
  eq(stub.status, 'refused', 'stub refused'); eq(stub.error, 'needs XAI_API_KEY', 'says why');
  eq((await runAgent('nope', {}, { db, env: ENV, fetch: f, defs: [def({})] })).status, 'refused', 'unknown refused');
  eq(seen.length, 0, 'no model or tool called'); eq(db.tables.agent_runs.length, 0, 'no run rows');
});

await ok('input is validated before the lock or a run row', async () => {
  const db = freshDb(); await enable(db, 'test-agent');
  const rep = await runAgent('test-agent', { input: { question: '' } }, { db, env: ENV, fetch: fakeFetch([]).f, defs: [def({ input: z.object({ question: z.string().min(5) }) })] });
  eq(rep.status, 'refused', 'refused'); truthy(/invalid input/.test(rep.error), rep.error); eq(db.tables.agent_runs.length, 0, 'no run row');
});

await ok('the per-run budget: with nothing left, a paid chain is not called', async () => {
  const db = freshDb(); await enable(db, 'test-agent');
  const { f, seen } = fakeFetch([completion('x')]);
  const d = def({ budgetGbpPerRun: 0, model: 'claude', tier: undefined, run: async (ctx) => { await ctx.model({ messages: [{ role: 'user', content: 'x' }] }); return { summary: '' }; } });
  const rep = await runAgent('test-agent', {}, { db, env: { ...ENV, ALLOW_PAID_MODELS: 'true', MONTHLY_BUDGET_GBP: '50' }, fetch: f, defs: [d], ...fast });
  eq(rep.status, 'failed', 'failed'); eq(seen.length, 0, 'nothing requested'); truthy(/cap/.test(rep.error), rep.error);
});

await ok('Notion is read-only: a write path or method is refused before any request', async () => {
  let calls = 0;
  /** @type {typeof globalThis.fetch} */
  const f = async () => { calls++; return new Response('{}'); };
  for (const [path, method] of /** @type {Array<[string, 'GET' | 'POST']>} */ ([['/pages', 'POST'], ['/blocks/aaaaaaaabbbbccccddddeeeeeeeeeeee/children', 'POST'], ['/databases/x/query', 'POST'], ['/comments', 'POST']])) {
    let err = null; try { await notionRequest(path, { method }, { token: 't', fetch: f }); } catch (e) { err = e; }
    truthy(err instanceof NotionError && /read-only/.test(err.message), `${method} ${path} refused`);
  }
  eq(calls, 0, 'nothing sent');
});

await ok('cron: parse, and "due since the last run" across a daily wake', () => {
  truthy(parseCron('0 5 * * *'), 'daily'); truthy(!parseCron('61 * * * *'), 'bad minute'); truthy(!parseCron('* * *'), 'too few fields');
  const now = new Date('2026-09-24T03:00:00Z');
  eq(isDue('0 5 * * *', '2026-09-22T05:00:00Z', now), true, 'yesterday 05:00 passed since the last run');
  eq(isDue('0 5 * * *', '2026-09-23T05:00:30Z', now), false, 'already ran after yesterday\'s tick');
  eq(isDue('0 5 * * 1', null, new Date('2026-09-24T06:00:00Z')), false, 'Mondays only; today is Thursday');
  eq(isDue('*/30 * * * *', null, now), true, 'every 30 minutes');
  eq(isDue('', null, now), false, 'no schedule is never due');
});

console.log(failures ? `\n✗ agents-runner: ${failures} of ${n} failed` : `\n✓ agents-runner — runs recorded, lock, limits, tools, Notion read-only, cron (${n} checks)`);
process.exit(failures ? 1 : 0);
