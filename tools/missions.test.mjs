/**
 * Missions, asserted end to end on the in-memory database with a stand-in
 * model and a stand-in web: the registry refuses what it should, a
 * research mission runs every step and ends in a packet with sources and
 * proposals that wait for Leo, a content mission writes through HERALD's
 * gate, critiques and rewrites, a review writes lessons the next mission
 * reads, an approval pauses a mission until Leo answers, a dead worker is
 * recovered, a schedule queues on time, and nothing above draft runs
 * without an approval. No network, no model, no money.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { memoryDb } from '../packages/database/src/memory.js';
import { state } from '../packages/database/src/state.js';
import { parseCron, nextRun } from '../packages/database/src/cron.js';
import { tick, advance, permit, renderPrompt, resolveArgs, missionView } from '../packages/runtime/src/missions.js';
import { EXECUTORS, publicUrl, parseDuckDuckGo, pageText } from '../packages/runtime/src/tools.js';
import { ACTIONS, AGENT_BY_ID, MISSION_TEMPLATE_BY_ID, planProblems } from '../packages/config/src/index.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const throws = async (fn, re, m) => { try { await fn(); fails.push(`${m} (did not throw)`); } catch (e) { if (!re.test(e.message)) fails.push(`${m}: ${e.message}`); } };

/* ---- cron ---- */
const at = (s) => new Date(s);
ok(nextRun('0 9 * * *', at('2026-10-03T08:30:00')).getHours() === 9, 'daily at nine, later today');
ok(nextRun('0 9 * * *', at('2026-10-03T09:00:00')).getDate() === 4, 'strictly after: nine o\'clock itself goes to tomorrow');
ok(nextRun('*/15 * * * *', at('2026-10-03T10:07:00')).getMinutes() === 15, 'every fifteen minutes');
ok(nextRun('0 18 * * 0', at('2026-10-03T12:00:00')).getDay() === 0, 'Sundays at six');
ok(nextRun('30 7 1 * *', at('2026-10-03T12:00:00')).getMonth() === 10, 'the first of next month');
await throws(() => parseCron('0 9 * *'), /five fields/, 'four fields are refused');
await throws(() => parseCron('61 * * * *'), /outside/, 'a minute past 59 is refused');
await throws(() => nextRun('0 0 30 2 *', at('2026-01-01T00:00:00')), /never falls due/, 'February 30th never comes');

/* ---- references ---- */
const scope = { input: { question: 'q?' }, plan: { queries: ['a', 'b'] }, critique: { average: 6 } };
ok(JSON.stringify(resolveArgs({ queries: '$plan.queries', per: 4, q: '$input.question' }, scope)) === '{"queries":["a","b"],"per":4,"q":"q?"}', 'a whole-string reference is the value itself');
ok(renderPrompt('Ask $input.question, cost $5, score $critique.average', scope) === 'Ask q?, cost $5, score 6', 'prompts fill references and leave other dollars alone');

/* ---- the web, safely ---- */
ok(publicUrl('https://example.com/a') === 'https://example.com/a', 'a public page is allowed');
for (const bad of ['http://localhost:11434/api/chat', 'http://127.0.0.1/', 'http://192.168.1.1/admin', 'http://10.0.0.5/', 'http://172.20.0.1/', 'file:///etc/passwd', 'http://router/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data']) ok(publicUrl(bad) === null, `the worker's own network is never fetched: ${bad}`);
const ddg = `<div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fprices&amp;rut=x">Peptide <b>prices</b></a><a class="result__snippet" href="#">BPC-157 at &pound;40</a></div>
<div class="result"><a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Advert</a></div>
<div class="result"><a class="result__a" href="https://other.org/b">Other</a></div>`;
const parsed = parseDuckDuckGo(ddg);
ok(parsed.length === 2 && parsed[0].url === 'https://example.com/prices' && parsed[0].title === 'Peptide prices', `DuckDuckGo results are read, adverts dropped (${JSON.stringify(parsed)})`);
ok(parsed[0].snippet.includes('BPC-157') && parsed[1].snippet === '', 'each snippet belongs to its own result');
ok(pageText('<html><title>T</title><script>evil()</script><p>One.</p><p>Two.</p></html>').text === 'One.\nTwo.', 'a page is read as text, scripts gone');

/* ---- every action has an executor ---- */
for (const a of ACTIONS) ok(EXECUTORS[a.id], `action ${a.id} has an executor`);

/* ---- the autonomy ceiling ---- */
const intel = AGENT_BY_ID.intel;
const ungated = [{ id: 'a', kind: 'action', action: 'web.search', after: [] }, { id: 'b', kind: 'action', action: 'publish.post', after: ['a'] }];
ok(planProblems(ungated).some((p) => /unknown action/.test(p)), 'an action that does not exist is refused');
// A pretend outward action, to prove the gate rule rather than wait for one to exist.
ACTIONS.push({ id: 'test.outward', tool: null, cap: 'publish', minGrade: 'approval', level: 4 });
const { ACTION_BY_ID } = await import('../packages/config/src/missions.js');
ACTION_BY_ID['test.outward'] = ACTIONS.at(-1);
const outward = [{ id: 'draft', kind: 'think', prompt: 'x', schema: { type: 'object' }, after: [] }, { id: 'post', kind: 'action', action: 'test.outward', after: ['draft'] }];
ok(planProblems(outward).some((p) => /above the autonomy ceiling/.test(p)), 'an outward step with no approval upstream is refused by the plan check');
const gated = [outward[0], { id: 'ok', kind: 'approval', after: ['draft'] }, { id: 'post', kind: 'action', action: 'test.outward', after: ['ok'] }];
ok(!planProblems(gated).some((p) => /autonomy/.test(p)), 'the same step behind an approval is allowed by the plan');
await throws(async () => permit(outward[1], AGENT_BY_ID.arcane, outward, {}), /above what may run unattended/, 'and refused at run time without an approval, whatever the plan says');
ok(permit(gated[2], AGENT_BY_ID.arcane, gated, { draft: {}, ok: true }).level === 4, 'approved, a commander who holds approval may take it');
await throws(async () => permit(gated[2], intel, gated, { draft: {}, ok: true }), /holds "deny" on publish/, 'approved or not, an agent without the grade may not');
await throws(async () => permit({ id: 'x', kind: 'action', action: 'archives.search' }, intel, [], {}), /does not use the archives tool/, 'CIPHER may not read the Archives itself — that is ORACLE\'s tool');
ACTIONS.pop(); delete ACTION_BY_ID['test.outward'];

/* ---- the registry ---- */
const now = new Date('2026-10-03T10:00:00');
const db = memoryDb();
await throws(() => state.insert(db, 'missions', { template: 'research', input: {} }, { now }), /needs question/, 'a research mission needs a question');
await throws(() => state.insert(db, 'missions', { template: 'nope' }, { now }), /unknown mission template/, 'an unknown template is refused');
await throws(() => state.insert(db, 'missions', { template: 'review', state: 'running' }, { now }), /must be one of|queued, or standing/, 'a mission cannot be made running by hand');
await throws(() => state.insert(db, 'missions', { template: 'review', schedule: 'every day' }, { now }), /five fields/, 'a bad schedule is refused with how to write one');
const standing = await state.insert(db, 'missions', { template: 'review', schedule: '0 18 * * 0' }, { now });
ok(standing.state === 'standing' && new Date(standing.next_run_at).getDay() === 0, 'a scheduled mission stands, due next Sunday');
const m1 = await state.insert(db, 'missions', { template: 'research', input: { question: 'What do UK suppliers charge for GHK-Cu?' } }, { now });
ok(m1.state === 'queued' && m1.agent === 'intel' && m1.room === 'intel' && m1.plan.length === MISSION_TEMPLATE_BY_ID.research.steps.length, 'queued with the template\'s agent, room and plan snapshotted');
ok(m1.title.includes('GHK-Cu'), 'titled from its question');
await throws(() => state.update(db, 'missions', m1.id, { state: 'standing' }, { now }), /needs a schedule/, 'a queued mission cannot be made to stand without a schedule');
await throws(() => state.update(db, 'missions', m1.id, { input: { question: 'other' } }, { now }), /keeps its input/, 'a mission keeps its input');
await throws(() => state.remove(db, 'missions', m1.id), /never deleted/, 'missions are never deleted');

/* ---- a stand-in model and web ---- */
const asked = [];
const model = { messages: { create: async (req) => {
  const prompt = req.messages[0].content; const system = req.system[0].text;
  asked.push({ prompt, system, schema: req.output_config.format.schema });
  const say = (o) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(o) }], usage: { input_tokens: 50, output_tokens: 10 } });
  if (/Plan the research/.test(prompt)) return say({ queries: ['GHK-Cu price UK', 'GHK-Cu supplier'], angle: 'price' });
  if (/Write the research packet/.test(prompt)) return say({ question: 'q', summary: 'Suppliers charge about £40.', findings: [{ claim: 'GHK-Cu 50mg is £40 at Example', source: 'https://example.com/prices', confidence: 'medium' }], gaps: ['no second source'], proposals: [{ room: 'apothecary', text: 'Check our GHK-Cu price against £40', priority: 'P2', why: 'one supplier lists £40' }] });
  if (/You are the critic/.test(prompt)) { const ids = [...prompt.matchAll(/"id": "(HER-[^"]+)"/g)].map((x) => x[1]); return say({ scores: ids.map((id) => ({ id, score: 5, weakness: 'flat hook' })), average: 5, weakest: ids[0] || '', advice: 'Lead with the cost of waiting.' }); }
  if (/Judge it/.test(prompt)) return say({ worked: ['research ran'], failed: [], lessons: ['Name the supplier in every price claim.'], proposals: [] });
  return say({});
} } };
const pages = { 'https://example.com/prices': '<html><title>Prices</title><p>GHK-Cu 50mg £40.</p></html>', 'https://other.org/b': '<html><p>Nothing useful.</p></html>' };
const fetched = [];
const fetchImpl = async (url, init = {}) => {
  fetched.push(url);
  if (String(url).startsWith('https://html.duckduckgo.com')) return { ok: true, status: 200, text: async () => ddg };
  if (pages[url]) return { ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => pages[url] };
  return { ok: false, status: 404, headers: { get: () => 'text/html' }, text: async () => '' };
};
const brain = fs.mkdtempSync(path.join(os.tmpdir(), 'arcane-brain-'));
fs.mkdirSync(path.join(brain, '05-Knowledge'), { recursive: true });
fs.writeFileSync(path.join(brain, '05-Knowledge', 'GHK-Cu pricing.md'), '---\ntype: note\n---\nLast quarter we sold GHK-Cu at £39.95 and the supplier kit cost $50.\n');
fs.writeFileSync(path.join(brain, '05-Knowledge', 'Unrelated.md'), 'Nothing about it here.\n');
let clock = new Date(now.getTime());
const ctx = { client: model, model: 'stand-in', worker: 'test-worker', brain, env: {}, fetchImpl, now: () => new Date(clock.getTime()), sleep: async () => {}, max: 1 };

/* ---- research, end to end ---- */
let r = await tick(db, ctx);
ok(r.ran.length === 1 && r.ran[0].id === m1.id && r.ran[0].state === 'done', `the research mission ran to the end (${JSON.stringify(r.ran)})`);
let m = await db.get('missions', { select: '*', id: `eq.${m1.id}` }, { single: true });
ok(m.output.summary === 'Suppliers charge about £40.' && m.output.findings[0].source === 'https://example.com/prices', 'the packet is the mission\'s output, with its source');
ok(Object.keys(m.progress.done).length === 7 && !m.progress.failed, 'every step is done');
ok(m.progress.done.recall.notes[0]?.title === 'GHK-Cu pricing', 'the brain was searched and the right note found first');
ok(m.progress.done.read.pages.some((p) => p.url === 'https://example.com/prices' && p.text.includes('£40')), 'the pages the search found were read');
ok(fetched.every((u) => publicUrl(u) || String(u).startsWith('https://html.duckduckgo.com')), 'nothing private was fetched');
const synth = asked.find((a) => /Write the research packet/.test(a.prompt));
ok(synth.prompt.includes('£39.95') && synth.prompt.includes('GHK-Cu 50mg £40'), 'the synthesis was handed the brain and the web');
ok(synth.system.includes('CIPHER') && synth.system.includes('No agent spends money'), 'and spoke as CIPHER, under the standing rules');
let orders = await state.list(db, 'orders');
const prop = orders.find((o) => o.text === 'Check our GHK-Cu price against £40');
ok(prop && prop.state === 'proposed' && prop.agent === 'intel', 'its proposal waits for Leo as a proposed order');
let runRows = await db.get('agent_runs', { select: '*', mission_id: `eq.${m1.id}` });
ok(runRows.length === 7 && runRows.every((x) => x.status === 'ok'), `every step is a traced run on the mission (${runRows.length})`);
ok(runRows.some((x) => x.agent === 'ORACLE') && runRows.some((x) => x.agent === 'CIPHER'), 'ORACLE read the Archives; CIPHER did the rest');
let ev = await db.get('system_events', { select: 'kind', subject_id: `eq.${m1.id}` });
ok(ev.some((e) => e.kind === 'mission.started') && ev.some((e) => e.kind === 'mission.done'), 'started and done are events');
const view = missionView(m);
ok(view.finished && view.settled === view.total && view.steps.every((s) => s.status === 'done') && view.steps.find((s) => s.id === 'propose').level === 2, 'the room\'s view of it: finished, every step done, levels shown');

/* ---- a re-queue starts again ---- */
const again = await state.update(db, 'missions', m1.id, { state: 'queued' }, { now });
ok(again.state === 'queued' && Object.keys(again.progress).length === 0 && again.steps_run === 0, 're-queued, it starts from nothing');
await state.update(db, 'missions', m1.id, { state: 'cancelled' }, { now });

/* ---- content: HERALD writes, the critic scores, a weak set is rewritten ---- */
const sentence = (i) => `Line ${i} says one plain thing about the work, and then it stops before it starts to explain itself to you.`;
const body = Array.from({ length: 80 }, (_, i) => sentence(i + 1)).join(' ');
db.tables.archive_modules = [{ id: 'mindset--discipline--abc', title: 'Discipline', subject: 'Mindset Mastery', lane: 'mindset', kind: 'module', words: 1400, gate: 'allowed', sensitive: false, excerpt: 'discipline', notion_id: 'abc', source_path: 'Discipline abc.md', body }];
const m2 = await state.insert(db, 'missions', { template: 'content', input: { lane: 'mindset' } }, { now });
r = await tick(db, { ...ctx, mock: true });
m = await db.get('missions', { select: '*', id: `eq.${m2.id}` }, { single: true });
ok(m.state === 'done', `the content mission finished (${m.state} ${m.error})`);
ok(m.progress.done.pick.id === 'mindset--discipline--abc', 'it picked the one module there is');
const drafts = await db.get('content_drafts', { select: '*' });
ok(drafts.length > 0 && drafts.every((d) => d.status === 'draft'), 'every draft waits as a draft — nothing publishes');
ok(m.progress.done.critique.average === 5 && 'revise' in m.progress.done, 'a weak set (5 of 10) was rewritten');
ok(drafts.some((d) => d.parent_id === m.progress.done.critique.weakest), 'the rewrite is a child of the weakest draft');
const m3 = await state.insert(db, 'missions', { template: 'content', input: { lane: 'mindset' } }, { now });
await tick(db, { ...ctx, mock: true });
m = await db.get('missions', { select: '*', id: `eq.${m3.id}` }, { single: true });
ok(m.state === 'failed' && /nothing left to write from/.test(m.error), 'a module already drafted is not written again; the mission says why it stopped');

/* ---- review: lessons the next mission reads ---- */
const m4 = await state.insert(db, 'missions', { template: 'review', input: { days: 7 } }, { now });
await tick(db, ctx);
m = await db.get('missions', { select: '*', id: `eq.${m4.id}` }, { single: true });
ok(m.state === 'done' && m.output.lessons[0] === 'Name the supplier in every price claim.', 'the review wrote its lessons');
const judge = asked.find((a) => /Judge it/.test(a.prompt));
ok(/Missions: \d+/.test(judge.prompt) && /CIPHER \d+ ok/.test(judge.prompt), 'the review read the week from the tables');
asked.length = 0;
const m5 = await state.insert(db, 'missions', { template: 'research', input: { question: 'Is anyone selling GHK-Cu under £30?' } }, { now });
await tick(db, ctx);
ok(asked.length && asked.every((a) => a.system.includes('Name the supplier in every price claim.')), 'every later mission reads the lessons');

/* ---- an approval pauses until Leo answers ---- */
const m6 = await state.insert(db, 'missions', { template: 'review' }, { now });
const withGate = [
  { id: 'week', kind: 'action', action: 'database.read', agent: 'vector', after: [], args: { source: 'week' } },
  { id: 'gate', kind: 'approval', after: ['week'], describe: 'carry on with the review of the week' },
  { id: 'judge', ...MISSION_TEMPLATE_BY_ID.review.steps[1], after: ['gate'] },
];
await db.patch('missions', { id: `eq.${m6.id}` }, { plan: withGate });
await tick(db, ctx);
m = await db.get('missions', { select: '*', id: `eq.${m6.id}` }, { single: true });
const gateOrder = (await state.list(db, 'orders')).find((o) => o.id === m.pending_order);
ok(m.state === 'paused' && gateOrder?.state === 'proposed' && /carry on with the review/.test(gateOrder.text), 'it paused with a proposed order on the board');
await tick(db, ctx);
m = await db.get('missions', { select: '*', id: `eq.${m6.id}` }, { single: true });
ok(m.state === 'paused', 'and stays paused while the order is unanswered');
await state.update(db, 'orders', gateOrder.id, { state: 'open' }, { now });
await tick(db, ctx);
m = await db.get('missions', { select: '*', id: `eq.${m6.id}` }, { single: true });
ok(m.state === 'done' && 'judge' in m.progress.done, `approved, it carried on to the end (${m.state} ${m.error})`);
ok((await state.list(db, 'orders')).find((o) => o.id === gateOrder.id).state === 'done', 'and the approval order is done');
const m7 = await state.insert(db, 'missions', { template: 'review' }, { now });
await db.patch('missions', { id: `eq.${m7.id}` }, { plan: withGate });
await tick(db, ctx);
m = await db.get('missions', { select: '*', id: `eq.${m7.id}` }, { single: true });
await state.update(db, 'orders', m.pending_order, { state: 'killed' }, { now });
await tick(db, ctx);
m = await db.get('missions', { select: '*', id: `eq.${m7.id}` }, { single: true });
ok(m.state === 'done' && m.progress.skipped.includes('judge') && !('judge' in m.progress.done && m.progress.done.judge), 'killed, it stops there: nothing after the gate runs');

/* ---- a worker that died mid-mission ---- */
const m8 = await state.insert(db, 'missions', { template: 'review' }, { now });
await db.patch('missions', { id: `eq.${m8.id}` }, { state: 'running', claimed_by: 'gone', heartbeat_at: new Date(clock.getTime() - 60 * 60_000).toISOString() });
r = await tick(db, ctx);
m = await db.get('missions', { select: '*', id: `eq.${m8.id}` }, { single: true });
ok(r.recovered.includes(m8.id) && m.state === 'failed' && /stopped mid-step/.test(m.error), 'a mission whose worker went quiet is failed, saying why');

/* ---- a standing mission queues on time ---- */
clock = new Date('2026-10-04T18:00:30');   // Sunday, just past six
r = await tick(db, { ...ctx, max: 0 });
ok(r.scheduled.length === 1, 'the Sunday review was queued at six');
const child = await db.get('missions', { select: '*', id: `eq.${r.scheduled[0]}` }, { single: true });
ok(child.parent_id === standing.id && child.source === 'schedule' && child.state === 'queued', 'as a child of the standing mission');
const s2 = await db.get('missions', { select: '*', id: `eq.${standing.id}` }, { single: true });
ok(new Date(s2.next_run_at) > clock && new Date(s2.next_run_at).getDate() === 11, 'and the standing mission is next due a week later');
r = await tick(db, { ...ctx, max: 0 });
ok(r.scheduled.length === 0, 'it is not queued twice');

/* ---- no model: a mission says so instead of pretending ---- */
const m9 = await state.insert(db, 'missions', { template: 'review' }, { now });
await tick(db, { ...ctx, client: null });
m = await db.get('missions', { select: '*', id: `eq.${m9.id}` }, { single: true });
ok(m.state === 'failed' && /no model is wired/.test(m.error) && 'week' in m.progress.done, 'without a model the reading still happens and the thinking step says why it cannot');

/* ---- budgets hold ---- */
await state.insert(db, 'agent_budgets', { agent: 'arcane', runs_daily: 0 }, { now });
await db.patch('agent_budgets', { agent: 'eq.arcane' }, { runs_daily: 1 });
const m10 = await state.insert(db, 'missions', { template: 'review' }, { now });
await db.post('agent_runs', { id: 'ARC-X-1', agent: 'ARCANE', status: 'ok', started_at: new Date(clock.getTime() - 60_000).toISOString() });
await tick(db, ctx);
m = await db.get('missions', { select: '*', id: `eq.${m10.id}` }, { single: true });
ok(m.state === 'failed' && /today's 1 runs/.test(m.error), `an agent over its daily runs stops (${m.error})`);

/* ---- the brain keeps what was found ---- */
const { mirrorMissions } = await import('./lib/state-mirror.mjs');
const mirrored = await mirrorMissions(db, brain, clock);
const packet = fs.readFileSync(path.join(brain, '05-Knowledge', 'Research', `${m5.id}.md`), 'utf8');
ok(mirrored.packets >= 1 && /generated: true/.test(packet) && packet.includes('[source](https://example.com/prices)'), 'each research packet is a generated note in the brain, sources linked');
const log = fs.readFileSync(path.join(brain, '04-Records', 'Missions.md'), 'utf8');
ok(log.includes('## Standing') && log.includes(`[[${m5.id}]]`), 'the log lists the standing schedule and links the packets');
const found = await EXECUTORS['memory.search'].run({ q: 'GHK-Cu suppliers under £30' }, { brain });
ok(found.notes.some((n) => n.path.startsWith('05-Knowledge/Research')), 'and the next mission\'s brain search finds them');

fs.rmSync(brain, { recursive: true, force: true });
if (fails.length) { console.error(`✗ missions: ${fails.length} failed\n  - ${fails.join('\n  - ')}`); process.exit(1); }
console.log('✓ missions: cron, references, a safe web, the autonomy ceiling, the registry, research → packet → proposals, content → critique → rewrite, review → lessons, approvals, recovery, schedules, budgets');
