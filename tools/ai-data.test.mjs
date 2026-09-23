#!/usr/bin/env node
// @ts-check
/**
 * The AI layer's tables, against the in-memory twin.
 *
 *   node tools/ai-data.test.mjs
 *
 * The lock is the part that matters most: two runs of one agent must never
 * overlap, and a lock left by a crashed run must not block the agent for
 * ever. The budget reads only paid calls from this month.
 */
import { memoryDb } from '../packages/database/src/memory.js';
import { agentsTable, outputs, usage, monthStart } from '../packages/database/src/ai.js';

let failures = 0, n = 0;
/** @param {string} name @param {() => Promise<void> | void} fn */
const ok = async (name, fn) => { n++; try { await fn(); console.log(`✓ ${name}`); } catch (e) { console.log(`✗ ${name} — ${e instanceof Error ? e.message : String(e)}`); failures++; } };
/** @param {unknown} got @param {unknown} want @param {string} what */
const eq = (got, want, what) => { if (got !== want) throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };

const db = /** @type {import('../packages/database/src/ai.js').Db} */ (/** @type {unknown} */ (memoryDb({ agents: [], outputs: [], model_usage: [], system_events: [] })));
const defs = [{ id: 'library-summariser', schedule: '0 5 * * *', config: { name: 'Library Summariser' } }, { id: 'council', schedule: '', config: {} }];

await ok('ensure: rows are made disabled, with the default schedule', async () => {
  const rows = await agentsTable.ensure(db, defs);
  eq(rows.length, 2, 'two rows'); eq(rows[0].enabled, false, 'disabled'); eq(rows[0].schedule, '0 5 * * *', 'schedule');
});
await ok('ensure: what the operator set is kept on the next ensure', async () => {
  await agentsTable.set(db, 'library-summariser', { enabled: true, schedule: '0 6 * * *' });
  const [row] = await agentsTable.ensure(db, defs);
  eq(row.enabled, true, 'still enabled'); eq(row.schedule, '0 6 * * *', 'schedule kept');
});
await ok('lock: the first run takes it, a second concurrent run is refused', async () => {
  const [a, b] = await Promise.all([agentsTable.lock(db, 'library-summariser', 'R1', 60_000), agentsTable.lock(db, 'library-summariser', 'R2', 60_000)]);
  eq(a !== b, true, 'exactly one won'); eq((await agentsTable.get(db, 'library-summariser'))?.lock_run_id, a ? 'R1' : 'R2', 'the winner holds it');
});
await ok('lock: unlock by a run that does not hold it changes nothing', async () => {
  const holder = (await agentsTable.get(db, 'library-summariser'))?.lock_run_id || '';
  await agentsTable.unlock(db, 'library-summariser', 'NOT-ME', 'ok');
  eq((await agentsTable.get(db, 'library-summariser'))?.lock_run_id, holder, 'still held');
  await agentsTable.unlock(db, 'library-summariser', holder, 'ok');
  const row = await agentsTable.get(db, 'library-summariser');
  eq(row?.lock_run_id, null, 'released'); eq(row?.last_status, 'ok', 'last status recorded');
});
await ok('lock: a stale lock (past its expiry) can be taken', async () => {
  const past = new Date(Date.now() - 10 * 60_000);
  eq(await agentsTable.lock(db, 'council', 'OLD', 60_000, past), true, 'old run took it');
  eq(await agentsTable.lock(db, 'council', 'NEW', 60_000), true, 'the lock expired, a new run takes it');
});

await ok('outputs: save, list by room, latest for a source, review', async () => {
  const a = await outputs.save(db, { run_id: 'R1', agent: 'library-summariser', type: 'summary', room: 'archives', title: 'Mindset 1', content: 'short', source_ref: 'page-1', source_hash: 'h1' });
  await outputs.save(db, { run_id: 'R2', agent: 'library-summariser', type: 'summary', room: 'archives', title: 'Mindset 1', content: 'shorter', source_ref: 'page-1', source_hash: 'h2' });
  eq(/^OUT-\d{8}-001$/.test(a.id), true, `id minted (${a.id})`); eq(a.status, 'pending', 'pending by default');
  eq((await outputs.list(db, { room: 'archives' })).length, 2, 'listed');
  eq((await outputs.latestFor(db, 'library-summariser', 'page-1'))?.source_hash, 'h2', 'latest wins');
  const r = await outputs.review(db, a.id, 'approved', { content: 'edited' });
  eq(r?.status, 'approved', 'approved'); eq(r?.content, 'edited', 'edited'); eq(!!r?.reviewed_at, true, 'stamped');
});
await ok('outputs: an unknown type or status is refused', async () => {
  let threw = 0;
  try { await outputs.save(db, { run_id: '', agent: 'x', type: /** @type {import('../packages/database/src/ai.js').OutputType} */ (/** @type {unknown} */ ('essay')), room: 'x', content: '' }); } catch { threw++; }
  try { await outputs.review(db, 'OUT-x', /** @type {import('../packages/database/src/ai.js').OutputStatus} */ (/** @type {unknown} */ ('published'))); } catch { threw++; }
  eq(threw, 2, 'both refused');
});

await ok('usage: the month spend counts only paid calls from this month', async () => {
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 86_400_000).toISOString();
  await usage.record(db, { at: now.toISOString(), provider: 'openrouter', model: 'claude-sonnet', model_id: 'anthropic/claude-sonnet-5', free: false, ok: true, cost_gbp: 0.5 });
  await usage.record(db, { at: now.toISOString(), provider: 'openrouter', model: 'grok', model_id: 'x-ai/grok-4.7', free: false, ok: false, cost_gbp: 0.25 });
  await usage.record(db, { at: now.toISOString(), provider: 'gemini', model: 'gemini-flash', model_id: 'gemini-3.8-flash', free: true, ok: true, cost_gbp: 0 });
  await usage.record(db, { at: lastMonth, provider: 'openrouter', model: 'claude-sonnet', model_id: 'anthropic/claude-sonnet-5', free: false, ok: true, cost_gbp: 9 });
  eq(await usage.monthSpendGbp(db), 0.75, 'this month, paid only');
  const s = await usage.summary(db);
  eq(s.calls, 3, 'three calls this month'); eq(s.byModel['claude-sonnet'].gbp, 0.5, 'by model'); eq(s.failed, 1, 'one failed');
  eq(monthStart(new Date('2026-09-23T12:00:00Z')), '2026-09-01T00:00:00.000Z', 'month start');
});

console.log(failures ? `\n✗ ai-data: ${failures} of ${n} failed` : `\n✓ ai-data — agents, lock, outputs, usage (${n} checks)`);
process.exit(failures ? 1 : 0);
