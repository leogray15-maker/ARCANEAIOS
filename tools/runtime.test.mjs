/**
 * The runtime layer, end to end on the in-memory database: the audit
 * chain writes itself as events are added, a heartbeat keeps a run alive,
 * a stale run is reaped atomically, and the derived agent status —
 * working, stalled, budget_exceeded, gamification — reads all of it back
 * correctly. No network, no model.
 */
import { memoryDb } from '../packages/database/src/memory.js';
import { runs, events, nextId } from '../packages/database/src/content.js';
import { state } from '../packages/database/src/state.js';
import { verifyAuditChain } from '../packages/database/src/audit.js';
import { agentStatus, rosterStatus, budgetUsage, streakOf, levelOf, achievementsOf } from '../apps/facility/src/core/agents.js';
import { AGENT_BY_ID, STALE_RUN_MS } from '../packages/config/src/index.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
let n = 0;
const db = memoryDb();
const now = new Date('2026-09-20T12:00:00Z');

/* ---- events.add() chains itself as it writes ---- */
await state.insert(db, 'orders', { room: 'forge', text: 'first' }, { now });
await state.insert(db, 'orders', { room: 'forge', text: 'second' }, { now });
await state.insert(db, 'orders', { room: 'forge', text: 'third' }, { now });
const log = await events.all(db);
ok(log.length >= 3, `every write left an event (${log.length})`); n++;
const verdict = verifyAuditChain(log);
ok(verdict.ok && verdict.checked === log.length, `the whole log chains and verifies (${JSON.stringify(verdict)})`); n++;

// Tamper with one row's summary, in place — the database twin does not
// stop this (nothing does, at the row level; that is exactly the problem
// the chain exists to catch after the fact).
const target = db.tables.system_events[1];
target.summary = 'rewritten after the fact';
const caught = verifyAuditChain(await events.all(db));
ok(!caught.ok && caught.brokenAt === target.id, `a rewritten summary is caught at its own row (${caught.brokenAt})`); n++;

/* ---- heartbeat and reap ---- */
const runId = await nextId(db, 'agent_runs', 'TAL-R', now);
await runs.start(db, { id: runId, agent: 'TALLY', skill: 'tally-reading', objective: 'the reading', model: 'claude-opus-5' });
let row = (await runs.list(db, { limit: 5 })).find((r) => r.id === runId);
ok(row.status === 'running' && row.heartbeat_at, 'a started run carries an initial heartbeat'); n++;

await runs.heartbeat(db, runId, 'three of seven sources read');
row = (await runs.list(db, { limit: 5 })).find((r) => r.id === runId);
ok(row.current_activity === 'three of seven sources read', 'a heartbeat updates the current activity'); n++;

// Nothing is stale yet.
let reaped = await runs.reap(db, { staleMs: STALE_RUN_MS, now });
ok(reaped.length === 0, 'a fresh heartbeat is not reaped'); n++;

// Age it past the window by hand (a real clock would do this; the test
// moves time instead). `runs.list()` returns copies — the live row is
// mutated directly, the same as a stale row ages in the real database.
db.tables.agent_runs.find((r) => r.id === runId).heartbeat_at = new Date(now.getTime() - STALE_RUN_MS - 60_000).toISOString();
reaped = await runs.reap(db, { staleMs: STALE_RUN_MS, now });
ok(reaped.length === 1 && reaped[0].id === runId, `a stale run is reaped (${JSON.stringify(reaped.map((r) => r.id))})`); n++;
row = (await runs.list(db, { limit: 5 })).find((r) => r.id === runId);
ok(row.status === 'failed' && /stalled/.test(row.error), 'the reaped run is marked failed, with the reason'); n++;
const reapEvent = (await events.all(db)).find((e) => e.kind === 'agent.stalled');
ok(!!reapEvent, 'the reap itself is recorded in the audit log'); n++;

// A second reap call, immediately after, finds nothing to do — the
// conditional PATCH (status=eq.running) means a racing second caller can
// never also "recover" the same run: it has already moved past 'running'.
reaped = await runs.reap(db, { staleMs: STALE_RUN_MS, now });
ok(reaped.length === 0, 'reaping the same run twice recovers it only once'); n++;

/* ---- agentStatus derives working / stalled / budget_exceeded ---- */
const tally = AGENT_BY_ID.tally;
const r2 = await nextId(db, 'agent_runs', 'TAL-R', now);
await runs.start(db, { id: r2, agent: 'TALLY', skill: 'tally-reading', objective: 'a fresh reading' });
let s = agentStatus(tally, { runs: await runs.list(db, { limit: 20 }), orders: [], now: now.getTime() });
ok(s.status === 'working', `a fresh heartbeat means working (${s.status})`); n++;

const staleRuns = (await runs.list(db, { limit: 20 })).map((r) => (r.id === r2 ? { ...r, heartbeat_at: new Date(now.getTime() - STALE_RUN_MS - 1000).toISOString() } : r));
s = agentStatus(tally, { runs: staleRuns, orders: [], now: now.getTime() });
ok(s.status === 'stalled' && s.stalled?.id === r2, `a heartbeat past the window means stalled, not working (${s.status})`); n++;

await runs.finish(db, r2, { status: 'ok', usage: { in: 500, out: 200 } });
const budget = { agent: 'tally', tokens_daily: 600, tokens_monthly: null, runs_daily: null, active: true };
s = agentStatus(tally, { runs: await runs.list(db, { limit: 20 }), orders: [], budgets: [budget], now: now.getTime() });
ok(s.status === 'budget_exceeded', `usage at or over the daily token ceiling is budget_exceeded (used ${s.usage.tokensToday} of ${budget.tokens_daily})`); n++;
ok(budgetUsage([], null, now).exceeded === false, 'no budget set means nothing to exceed'); n++;

const inactive = { ...budget, active: false };
s = agentStatus(tally, { runs: await runs.list(db, { limit: 20 }), orders: [], budgets: [inactive], now: now.getTime() });
ok(s.status !== 'budget_exceeded', 'an inactive budget does not gate the agent'); n++;

/* ---- gamification: real numbers, not invented points ---- */
ok(levelOf(0) === 1 && levelOf(1) === 2 && levelOf(4) === 3 && levelOf(9) === 4 && levelOf(100) === 11, `level is a square-root curve over completed runs (${[0, 1, 4, 9, 100].map(levelOf).join(',')})`); n++;
ok(levelOf(10000) === 30, 'level is capped'); n++;

const dayRuns = (days) => days.map((d, i) => ({ agent: 'TALLY', status: 'ok', started_at: `${d}T09:00:00Z`, id: `r${i}` }));
ok(streakOf(dayRuns(['2026-09-18', '2026-09-19', '2026-09-20']), now) === 3, 'three consecutive days including today is a streak of 3'); n++;
ok(streakOf(dayRuns(['2026-09-17', '2026-09-19', '2026-09-20']), now) === 2, 'a gap in the middle breaks the streak at the gap'); n++;
ok(streakOf(dayRuns(['2026-09-19']), now) === 1, 'yesterday only, with nothing today, still counts as a live streak of 1'); n++;
ok(streakOf([], now) === 0, 'no runs is a streak of 0'); n++;

const ach = achievementsOf({ okRuns: 10, streak: 7, approvals: { approved: 5, rejected: 0, rate: 100 }, last20: Array.from({ length: 20 }, () => ({ status: 'ok' })) });
ok(ach.find((a) => a.id === 'runs_10').met && !ach.find((a) => a.id === 'runs_50').met, 'achievements report exactly the thresholds actually crossed'); n++;
ok(ach.find((a) => a.id === 'streak_7').met && ach.find((a) => a.id === 'clean_20').met && ach.find((a) => a.id === 'trusted').met, 'the streak, clean-run and trust achievements all read from the real record'); n++;
const achNone = achievementsOf({ okRuns: 0, streak: 0, approvals: { approved: 0, rejected: 0, rate: null }, last20: [] });
ok(achNone.every((a) => !a.met), 'nothing is met from nothing'); n++;

/* ---- the roster counts every agent exactly once ---- */
const roster = rosterStatus({ runs: await runs.list(db, { limit: 20 }), orders: [], budgets: [budget], now: now.getTime() });
ok(roster.agents.length === 19, 'nineteen agents, always'); n++;
ok(Object.values(roster.counts).reduce((a, b) => a + b, 0) === 19, 'every agent lands in exactly one status bucket'); n++;
ok(roster.counts.budget_exceeded >= 1, 'the roster counts the budget-exceeded agent'); n++;

if (fails.length) { console.error(`✗ runtime: ${fails.length} failed`); for (const f of fails) console.error('  · ' + f); process.exit(1); }
console.log(`✓ runtime — the audit chain writes itself and catches tampering, heartbeat and atomic reap recover a stalled run, agent status derives working/stalled/budget_exceeded, gamification reads real numbers (${n} checks)`);
