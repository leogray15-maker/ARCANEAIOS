/**
 * The floor-state fold and VIGIL's signals, checked headlessly: two devices
 * with overlapping state fold into one without losing either's decisions,
 * and the signals that should fire on that state do.
 */
import { mergeRows } from './lib/state.mjs';
import { signals } from '../apps/facility/src/core/vigil.js';
import { exampleTrades } from '../apps/facility/src/core/journal.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const t = Date.parse('2026-09-17T21:00:00');
const base = { v: 3, updated: t - 1000, orders: { forge: [{ id: 'o1', t: 'A', p: 0, done: false, ts: t - 3 * 86400000 }] }, ledger: {}, goals: {}, budget: { cash: 0, fixed: {}, split: { tax: 25, ops: 35, growth: 25, reserve: 15 } }, stock: [{ id: 's1', code: 'GHK-Cu', size: '50mg', vials: 4, coa: 'none' }], drafts: { d1: { status: 'approved', ts: t - 10 } }, lists: { watch: [{ id: 'w1', text: 'x', ts: t }] }, protocol: { '2026-09-17': {} }, counsel: [{ who: 'leo', text: 'q', ts: t - 5 }], decisions: [{ id: 'DEC-1', ts: t - 100, outcome: '' }], journal: { trades: exampleTrades().map((x, i) => ({ ...x, id: `T-${i}`, updated: t })), setups: [], checkins: [] }, log: [] };
const other = { ...structuredClone(base), updated: t, orders: { forge: [{ id: 'o1', t: 'A', p: 0, done: true, ts: t }], bridge: [{ id: 'o2', t: 'B', p: 2, done: false, ts: t }] }, drafts: { d1: { status: 'posted', ts: t }, d2: { status: 'killed', ts: t } }, lists: { ideas: [{ id: 'i1', text: 'y', ts: t }] }, decisions: [{ id: 'DEC-1', ts: t - 100, outcome: 'right', reviewed: t }], counsel: [{ who: 'arcane', text: 'a', ts: t - 4 }], journal: { trades: [], setups: [], checkins: [] } };
const s = mergeRows([{ id: 'a', updated: new Date(t - 1000).toISOString(), body: base }, { id: 'b', updated: new Date(t).toISOString(), body: other }]);
ok(s.devices === 2, 'two devices counted');
ok(s.orders.forge[0].done === true, 'newer done flag wins (by ts)');
ok(s.orders.bridge?.length === 1, 'order only on the second device survives');
ok(s.drafts.d1.status === 'posted' && s.drafts.d2.status === 'killed', 'draft marks union, newest wins');
ok(s.lists.watch?.length === 1 && s.lists.ideas?.length === 1, 'lists from both devices');
ok(s.decisions[0].outcome === 'right', 'decision outcome from the reviewing device');
ok(s.journal.trades.length === exampleTrades().length, 'trades survive a device that has none');
ok(s.counsel.length === 2 && s.counsel[0].who === 'leo', 'counsel turns interleave by time');

const brain = { brief: { date: '2026-09-10' }, drafts: [{ id: 'd1', status: 'draft' }, { id: 'd2', status: 'draft' }, { id: 'd3', status: 'draft' }] };
const sig = signals(s, brain, t);
const has = (re) => sig.some((x) => re.test(x.text));
ok(has(/brief is 7 days old/), 'stale brief');
ok(has(/Low stock: GHK-Cu/), 'low stock');
ok(has(/without a published COA/), 'COA breach');
ok(has(/rule breaks in the last five/), 'journal rule breaks');
ok(has(/Nothing ticked on the protocol/), 'protocol after 20:00');
ok(!has(/P0 open/), 'a done P0 is not stale');
ok(!has(/split adds/), 'a 100 split is quiet');
ok(sig.every((x) => x.room && x.clear), 'every signal names a room and what clears it');

if (fails.length) { console.error(`✗ state/vigil: ${fails.length} failed\n  ` + fails.join('\n  ')); process.exit(1); }
console.log(`✓ state/vigil — fold of 2 devices and ${sig.length} signals behave (${sig.length + 8} checks)`);
