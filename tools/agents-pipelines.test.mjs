#!/usr/bin/env node
// @ts-check
/**
 * The four agents, each run end to end with Notion and the models faked.
 *
 *   node tools/agents-pipelines.test.mjs
 *
 * LIBRARY SUMMARISER summarises what changed and skips what did not;
 * SCRIPTORIUM DRAFTER lands gate-passing drafts as `draft` for BEACON;
 * THE COUNCIL seats the free seats, leaves paid ones out with the reason,
 * and stores the judge's verdict; TREND SCOUT is refused, with what it needs.
 */
import { memoryDb } from '../packages/database/src/memory.js';
import { runAgent } from '../packages/agents/src/index.js';
import { agentsTable } from '../packages/database/src/ai.js';
import { mockDrafts } from '../packages/content-engine/src/mock.js';
import { CraftInput, craftedDef, craftedId, allDefs, PERSONAS } from '../packages/agents/src/index.js';

let failures = 0, n = 0;
/** @param {string} name @param {() => Promise<void> | void} fn */
const ok = async (name, fn) => { n++; try { await fn(); console.log(`✓ ${name}`); } catch (e) { console.log(`✗ ${name} — ${e instanceof Error ? e.stack : String(e)}`); failures++; } };
/** @param {unknown} got @param {unknown} want @param {string} what */
const eq = (got, want, what) => { if (got !== want) throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };
/** @param {unknown} c @param {string} what */
const truthy = (c, what) => { if (!c) throw new Error(what); };

/** @typedef {import('../packages/database/src/ai.js').Db} Db */
/** @typedef {{ [k: string]: unknown, id?: string, content?: string, data?: Record<string, unknown> & { drafts?: string[], withheld?: unknown, drafted_at?: unknown } }} Row */
/** @typedef {Db & { tables: Record<string, Array<Row>> }} TestDb */
const freshDb = () => /** @type {TestDb} */ (/** @type {unknown} */ (memoryDb({ agents: [], agent_runs: [], outputs: [], model_usage: [], system_events: [], content_drafts: [], content_revisions: [], archive_modules: [], settings: [] })));
/** @param {Db} db @param {string} id */
const enable = async (db, id) => { await agentsTable.ensure(db, [{ id, schedule: '', config: {} }]); await agentsTable.set(db, id, { enabled: true }); };
const ENV = { OPENROUTER_API_KEY: 'sk-or-test', GEMINI_API_KEY: 'g-test', NOTION_TOKEN: 'secret-notion' };
const fast = { sleep: async () => {} };

const PARAGRAPH = 'Most people wait for permission that never comes. The ones who move first write the rules everyone else follows. Discipline is not a mood you wait for, it is a decision you make before the mood arrives. You do not rise to the level of your goals. You fall to the level of your systems, and your systems are what you do on the days you do not feel like it. Comfort is a slow tax you pay every day. The bill arrives all at once, years later, and it is always larger than you expected.';
const PAGES = [
  { id: '11111111111111111111111111111111', title: 'Permission', edited: '2026-09-20T10:00:00.000Z' },
  { id: '22222222222222222222222222222222', title: 'Systems', edited: '2026-09-21T10:00:00.000Z' },
];
const page = (/** @type {typeof PAGES[number]} */ p) => ({ object: 'page', id: p.id, last_edited_time: p.edited, url: `https://notion.so/${p.id}`, properties: { Name: { type: 'title', title: [{ plain_text: p.title }] } } });

/** @param {string} content */
const completion = (content, model = 'served/x') => ({ model, choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 40 } });

/**
 * @param {(body: { model: string, messages: Array<{ role: string, content: string }> }) => object | null} answer
 */
function fakeFetch(answer) {
  /** @type {string[]} */
  const seen = [];
  /** @type {typeof globalThis.fetch} */
  const f = async (url, init) => {
    const u = String(url); seen.push(`${init?.method || 'GET'} ${u}`);
    if (u.endsWith('/v1/search')) return Response.json({ results: PAGES.map(page), has_more: false });
    const pm = /\/v1\/pages\/([0-9a-f]{32})$/.exec(u);
    if (pm) return Response.json(page(/** @type {typeof PAGES[number]} */ (PAGES.find((p) => p.id === pm[1]))));
    if (/\/v1\/blocks\/[0-9a-f]{32}\/children/.test(u)) return Response.json({ results: [{ id: 'b1', type: 'paragraph', has_children: false, paragraph: { rich_text: [{ plain_text: PARAGRAPH }] } }], has_more: false });
    const body = JSON.parse(String(init?.body || '{}'));
    seen.push(`model ${body.model}`);
    const a = answer(body);
    return a ? Response.json(a) : new Response('{"error":{"message":"no"}}', { status: 503 });
  };
  return { f, seen };
}

const summaryJson = (/** @type {string} */ extra = '') => JSON.stringify({ title: 'Permission', summary: `Waiting for permission is the trap: the people who move first set the rules. ${extra}`.trim(), key_points: ['Move before you feel ready.', 'Systems beat goals.'], tags: ['discipline'], lane: 'mindset', sensitive: false });

await ok('LIBRARY SUMMARISER: every page summarised on the first run, pending, with source and edit time', async () => {
  const db = freshDb(); await enable(db, 'library-summariser');
  const { f } = fakeFetch(() => completion(summaryJson()));
  const rep = await runAgent('library-summariser', {}, { db, env: ENV, fetch: f, ...fast });
  eq(rep.status, 'ok', `status (${rep.error})`); eq(rep.outputs.length, 2, 'two summaries');
  const o = db.tables.outputs;
  eq(o[0].type, 'summary', 'type'); eq(o[0].room, 'archives', 'room'); eq(o[0].status, 'pending', 'pending');
  truthy(PAGES.some((p) => p.id === o[0].source_ref && p.edited === o[0].source_hash), 'source and edit time kept');
  eq(db.tables.agent_runs[0].agent, 'ORACLE', 'recorded under ORACLE');
});
await ok('LIBRARY SUMMARISER: a second run skips unchanged pages without reading them', async () => {
  const db = freshDb(); await enable(db, 'library-summariser');
  const first = fakeFetch(() => completion(summaryJson()));
  await runAgent('library-summariser', {}, { db, env: ENV, fetch: first.f, ...fast });
  const second = fakeFetch(() => completion(summaryJson()));
  const rep = await runAgent('library-summariser', {}, { db, env: ENV, fetch: second.f, ...fast });
  eq(rep.status, 'ok', 'ok'); eq(rep.outputs.length, 0, 'nothing new'); truthy(/2 unchanged/.test(rep.summary), rep.summary);
  truthy(!second.seen.some((s) => s.includes('/v1/pages/') || s.includes('/children')), 'no page was read'); truthy(!second.seen.some((s) => s.includes('openrouter') || s.includes('googleapis')), 'no model was called');
});
await ok('LIBRARY SUMMARISER: a summary that restates a dose is withheld, not stored', async () => {
  const db = freshDb(); await enable(db, 'library-summariser');
  const { f } = fakeFetch(() => completion(summaryJson('Take 5mg before bed.')));
  const rep = await runAgent('library-summariser', {}, { db, env: ENV, fetch: f, ...fast });
  eq(rep.status, 'ok', 'ok'); truthy(db.tables.outputs.every((o) => /^Withheld/.test(String(o.content)) && o.data?.withheld && !/5mg/.test(String(o.content))), 'withheld');
});

await ok('SCRIPTORIUM DRAFTER: gate-passing drafts land as draft for BEACON; the summary is marked drafted', async () => {
  const db = freshDb(); await enable(db, 'scriptorium-drafter');
  db.tables.outputs.push({ id: 'OUT-20260924-001', run_id: 'LIB-R-1', agent: 'library-summariser', type: 'summary', room: 'archives', title: 'Permission', content: 'Waiting for permission is the trap.', data: { key_points: ['Move first.'], lane: 'mindset', url: 'https://notion.so/x' }, source_ref: PAGES[0].id, source_hash: PAGES[0].edited, status: 'pending', model: '', created_at: new Date().toISOString() });
  const set = mockDrafts({ id: PAGES[0].id, title: 'Permission', subject: 'Mindset', lane: 'mindset', body: `${PARAGRAPH}\n\n${PARAGRAPH}` }, ['short', 'thread']);
  const { f } = fakeFetch(() => completion(JSON.stringify({ angle: set.angle, drafts: set.drafts.map((/** @type {Record<string, unknown>} */ d) => ({ format: d.format, platform: d.platform, title: d.title, hook: d.hook, cta: d.cta, tags: d.tags, body: d.body })) }), 'nex-agi/nex-n2.5-pro:free'));
  const rep = await runAgent('scriptorium-drafter', {}, { db, env: ENV, fetch: f, ...fast });
  eq(rep.status, 'ok', `status (${rep.error})`);
  const drafts = db.tables.content_drafts;
  truthy(drafts.length >= 1, `drafts landed (${rep.summary})`);
  truthy(drafts.every((d) => d.status === 'draft' && d.agent === 'SCRIBE' && /^HER-\d{8}-\d{3}$/.test(String(d.id)) && d.compliance === 'pass'), 'as draft, by SCRIBE, gate passed');
  eq(drafts[0].model, 'nex-agi/nex-n2.5-pro:free', 'the model that wrote it is recorded');
  truthy(db.tables.outputs[0].data?.drafted_at && db.tables.outputs[0].data?.drafts?.length === drafts.length, 'summary marked drafted');
  const again = await runAgent('scriptorium-drafter', {}, { db, env: ENV, fetch: f, ...fast });
  truthy(/nothing to draft/.test(again.summary), 'a drafted summary is not drafted twice');
});
await ok('SCRIPTORIUM DRAFTER: a draft naming a compound is refused by the gate twice and never lands', async () => {
  const db = freshDb(); await enable(db, 'scriptorium-drafter');
  db.tables.outputs.push({ id: 'OUT-20260924-001', run_id: 'x', agent: 'library-summariser', type: 'summary', room: 'archives', title: 'x', content: 'x', data: { lane: 'mindset' }, source_ref: 'p', source_hash: 'h', status: 'pending', model: '', created_at: new Date().toISOString() });
  const bad = { angle: 'x to y', drafts: [{ format: 'short', platform: 'X', title: 'Bad', hook: 'BPC-157 changed everything.', cta: 'none', tags: [], body: `BPC-157 changed everything.\n\n${PARAGRAPH.slice(0, 300)}` }] };
  const { f } = fakeFetch(() => completion(JSON.stringify(bad)));
  const rep = await runAgent('scriptorium-drafter', {}, { db, env: ENV, fetch: f, ...fast });
  eq(rep.status, 'ok', 'the run completes'); eq(db.tables.content_drafts.length, 0, 'nothing landed'); truthy(/refused by the gate/.test(rep.summary), rep.summary);
});
await ok('SCRIPTORIUM DRAFTER: summaries in a sensitive lane are left alone', async () => {
  const db = freshDb(); await enable(db, 'scriptorium-drafter');
  db.tables.outputs.push({ id: 'OUT-20260924-001', run_id: 'x', agent: 'library-summariser', type: 'summary', room: 'archives', title: 'Gut', content: 'x', data: { lane: 'health' }, source_ref: 'p', source_hash: 'h', status: 'pending', model: '', created_at: new Date().toISOString() });
  const { f, seen } = fakeFetch(() => completion('{}'));
  const rep = await runAgent('scriptorium-drafter', {}, { db, env: ENV, fetch: f, ...fast });
  truthy(/nothing to draft/.test(rep.summary), rep.summary); eq(seen.length, 0, 'no model called');
});

await ok('THE COUNCIL: free seats answer in parallel, paid seats sit out with the reason, the judge\'s verdict is stored', async () => {
  const db = freshDb(); await enable(db, 'council');
  const verdict = { call: 'DELAY', headline: 'Not before the list is warm.', agreed: ['The offer is right.'], disagreed: [{ point: 'Timing', positions: [{ seat: 'NVIDIA', stance: 'now' }, { seat: 'Google', stance: 'next month' }] }], reasoning: 'The seats agree on the offer and split on timing; the slower case is stronger.', conditions: ['200 on the list'], confidence: 'medium' };
  const { f, seen } = fakeFetch((b) => {
    const judge = b.messages.some((m) => /You are the judge/.test(m.content || ''));
    return judge ? completion(JSON.stringify(verdict), `judge/${b.model}`) : completion(`My position, from ${b.model}: wait a month.`, b.model);
  });
  const rep = await runAgent('council', { input: { question: 'Should I launch the Archives price rise this week?' } }, { db, env: ENV, fetch: f, ...fast });
  eq(rep.status, 'ok', `status (${rep.error})`);
  const data = /** @type {{ answers: Array<{ seat: string, free: boolean }>, absent: Array<{ seat: string, reason: string }>, verdict: { call: string }, judge: { model: string } }} */ (rep.data);
  truthy(data.answers.length >= 4, `several seats (${data.answers.map((a) => a.seat).join(', ')})`);
  truthy(data.answers.every((a) => a.free), 'only free models answered');
  truthy(['Anthropic', 'OpenAI', 'xAI', 'DeepSeek', 'Nous Research'].every((s) => data.absent.some((a) => a.seat === s && /ALLOW_PAID_MODELS/.test(a.reason))), 'paid seats sit out and say why');
  eq(data.verdict.call, 'DELAY', 'verdict'); truthy(!data.answers.some((a) => /** @type {{ model?: string }} */ (a).model === data.judge.model), 'the judge did not sit');
  eq(db.tables.outputs[0].type, 'verdict', 'stored as a verdict'); eq(db.tables.outputs[0].room, 'council', 'in THE COUNCIL');
  const requested = seen.filter((s) => s.startsWith('model ')).map((s) => s.slice(6));
  truthy(requested.length > 0 && !requested.some((m) => /^(anthropic|x-ai|openai|deepseek|moonshotai|nousresearch)\//.test(m)), `no paid model requested (${requested.join(', ')})`);
});
await ok('THE COUNCIL: an empty question is refused before a run', async () => {
  const db = freshDb(); await enable(db, 'council');
  const rep = await runAgent('council', { input: { question: '  ' } }, { db, env: ENV, fetch: fakeFetch(() => null).f, ...fast });
  eq(rep.status, 'refused', 'refused'); eq(db.tables.agent_runs.length, 0, 'no run');
});
await ok('THE COUNCIL: with fewer than two seats able to sit, the run fails and says why', async () => {
  const db = freshDb(); await enable(db, 'council');
  const rep = await runAgent('council', { input: { question: 'Is this a good week to launch?' } }, { db, env: { NOTION_TOKEN: 'x' }, fetch: fakeFetch(() => null).f, ...fast });
  eq(rep.status, 'failed', 'failed'); truthy(/needs two/.test(rep.error), rep.error);
});

await ok('TREND SCOUT: stubbed — refused with what it needs, never runs', async () => {
  const db = freshDb(); await enable(db, 'trend-scout');
  const rep = await runAgent('trend-scout', {}, { db, env: ENV, fetch: fakeFetch(() => completion('x')).f, ...fast });
  eq(rep.status, 'refused', 'refused'); truthy(/XAI_API_KEY/.test(rep.error), rep.error); eq(db.tables.agent_runs.length, 0, 'no run');
});

await ok('CRAFTED: a persona, a room and a task make an agent that is bounded, owned by the room, and runs', async () => {
  const db = freshDb();
  const craft = CraftInput.parse({ name: 'X Radar', persona: 'x-twitter-intelligence-analyst', room: 'beacon', tier: 'grunt', task: 'List three conversations in my lanes worth a post this week.' });
  const id = craftedId(craft.name); eq(id, 'crafted-x-radar', 'id');
  db.tables.agents.push({ id, enabled: true, schedule: '', config: craft, custom: true, last_status: '', lock_run_id: null, lock_until: null });
  const def = craftedDef({ id, schedule: '', config: craft });
  truthy(def && def.owner === 'herald' && def.tools.includes('outputs.save') && /you never act/.test(def.instructions) && def.instructions.includes(String(PERSONAS.find((p) => p.id === 'x-twitter-intelligence-analyst')?.text.slice(0, 60))), 'bounded, owned by BEACON\'s agent, persona included');
  const defs = await allDefs(db); truthy(defs.some((d) => d.id === id) && defs.some((d) => d.id === 'council'), 'listed with the code agents');
  const { f } = fakeFetch(() => completion('1. The discipline debate. 2. Quiet quitting. 3. Solo founders.'));
  const rep = await runAgent(id, {}, { db, env: ENV, fetch: f, defs, ...fast });
  eq(rep.status, 'ok', `ran (${rep.error})`); eq(db.tables.outputs[0].type, 'note', 'saved as a note'); eq(db.tables.outputs[0].room, 'beacon', 'in BEACON');
  eq(db.tables.agent_runs[0].agent, 'HERALD', 'recorded under the room\'s agent');
});
await ok('CRAFTED: an unknown persona, room or tool is refused; a broken row is skipped, not fatal', async () => {
  for (const bad of [{ persona: 'nurse' }, { room: 'moon' }, { tools: ['shell.exec'] }, { name: 'x' }, { task: 'short' }]) {
    truthy(!CraftInput.safeParse({ name: 'Radar', persona: 'growth-hacker', room: 'warroom', tier: 'thinker', task: 'Find me three growth experiments.', ...bad }).success, `refused ${JSON.stringify(bad)}`);
  }
  eq(craftedDef({ id: 'crafted-old', schedule: '', config: { name: 'Old', persona: 'gone' } }), null, 'a row that no longer validates is null');
  truthy(!PERSONAS.some((p) => /health|nurse|payable|medical/i.test(p.id)), 'no persona that would bend a standing rule');
});

console.log(failures ? `\n✗ agents-pipelines: ${failures} of ${n} failed` : `\n✓ agents-pipelines — Library, Scriptorium, Council, Trend Scout, crafted (${n} checks)`);
process.exit(failures ? 1 : 0);
