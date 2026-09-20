/**
 * VIGIL's signals: addressable, evidenced, and the same on both sides.
 *
 * The rules run in two places — the floor computes them from the store's
 * state, the server from the tables — and the whole point of one
 * implementation is that those two can never disagree. That is the
 * assertion this file exists for.
 */
import { signals, signalsFromTables } from '../apps/facility/src/core/vigil.js';
import { ROOM_BY_ID } from '../packages/config/src/index.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const now = Date.parse('2026-09-20T21:00:00');
const id = (list, i) => list.find((s) => s.id === i);

/* The same facts, in the two shapes the two callers hold them in. */
const tables = {
  orders: [
    { id: 'ORD-1', room: 'forge', text: 'A P0 that has sat', priority: 0, state: 'open', created_at: new Date(now - 5 * 86400000).toISOString(), source: 'floor', source_id: '' },
    { id: 'ORD-2', room: 'forge', text: 'A proposal', priority: 0, state: 'proposed', created_at: new Date(now - 5 * 86400000).toISOString(), source: 'agent', source_id: 'CIP-R-1', agent: 'intel' },
  ],
  products: [{ id: 'ghk-cu-50mg', name: 'GHK-Cu', size: '50mg', listed: true, active: true, sell_gbp: 39.95, kit_cost_usd: 50, kit_vials: 10 }],
  stock_lots: [{ id: 'LOT-1', product_id: 'ghk-cu-50mg', vials: 5, coa: 'pending' }],
  settings: [{ key: 'low_stock_vials', value: '12' }, { key: 'fx_gbp_per_usd', value: '0.746' }],
  ledger_months: [{ id: '2026-09:peptides', month: '2026-09', venture: 'peptides', revenue_gbp: 1805 }],
  cash_snapshots: [{ day: '2026-08-01', cash_gbp: 4000 }],
  pots: [{ id: 'tax', pct: 25, position: 0 }, { id: 'ops', pct: 30, position: 1 }],
  protocol_ticks: [],
  trades: [],
};
const state = {
  orders: { forge: [
    { id: 'ORD-1', t: 'A P0 that has sat', p: 0, done: false, ts: now - 5 * 86400000 },
    { id: 'ORD-2', t: 'A proposal', p: 0, done: false, proposed: true, ts: now - 5 * 86400000 },
  ] },
  products: tables.products, lots: tables.stock_lots, settings: tables.settings,
  ledger: tables.ledger_months, cash: tables.cash_snapshots, pots: tables.pots,
  protocolTicks: [], journal: { trades: [] }, drafts: {},
  draftCounts: { total: 5, waiting: 0, posted: 0 },
};

const fromFloor = signals(state, null, now);
// five drafts, none waiting for review, none posted — the same three numbers as above.
const fromServer = signalsFromTables(tables, { draftCounts: { approved: 5 }, now });

/* ---- the two sides agree ---- */
ok(fromFloor.length === fromServer.length, `the floor and the server see the same number of signals (${fromFloor.length} vs ${fromServer.length})`);
ok(fromFloor.map((s) => s.id).sort().join() === fromServer.map((s) => s.id).sort().join(), 'and the same signals, by id');
for (const a of fromFloor) { const b = id(fromServer, a.id); if (b) ok(a.text === b.text && a.severity === b.severity && a.room === b.room, `"${a.id}" reads the same on both sides`); }

/* ---- every signal can be pointed at, and explains itself ---- */
ok(fromFloor.every((s) => s.id && s.kind && s.severity && s.room && s.text && s.clear), 'every signal has an id, a kind, a severity, a room, what is true and what clears it');
ok(fromFloor.every((s) => ROOM_BY_ID[s.room]), 'every signal names a real room');
ok(fromFloor.every((s) => ['breach', 'warn', 'info'].includes(s.severity)), 'severities are the three the interface knows');
ok(new Set(fromFloor.map((s) => s.id)).size === fromFloor.length, 'ids are unique within a run');
ok(signals(state, null, now).map((s) => s.id).join() === fromFloor.map((s) => s.id).join(), 'ids are stable between runs on the same state — an order can point at one');

/* ---- the evidence is the actual numbers, not a restatement ---- */
const low = id(fromFloor, 'stock.low:ghk-cu-50mg');
ok(low && low.evidence.vials === 5 && low.evidence.product === 'ghk-cu-50mg', 'the low-stock signal carries the product and the count');
ok(low.proposal && low.proposal.room === 'apothecary' && low.proposal.priority === 1, 'and proposes the order that would answer it');
const coa = id(fromFloor, 'coa.missing');
ok(coa && coa.severity === 'breach' && coa.evidence.lines[0].id === 'ghk-cu-50mg', 'the COA breach names the line it is about');
const split = id(fromFloor, 'money.split');
ok(split && split.evidence.split === 55, 'the split signal carries the total it added to');
const cash = id(fromFloor, 'money.cash');
ok(cash && cash.evidence.day === '2026-08-01' && cash.since.startsWith('2026-08-01'), 'the cash signal says when it was last typed');
const stale = id(fromFloor, 'order.stale:ORD-1');
ok(stale && stale.evidence.order === 'ORD-1' && stale.evidence.days === 5, 'a stale P0 names the order and its age');
ok(!id(fromFloor, 'order.stale:ORD-2'), 'a proposal is never a stale P0 — it is not work');

/* ---- every proposal is a legal order ---- */
for (const s of fromFloor.filter((x) => x.proposal)) {
  ok(ROOM_BY_ID[s.proposal.room], `${s.id} proposes a real room`);
  ok(s.proposal.text && s.proposal.text.length < 200, `${s.id} proposes one line of work`);
  ok([0, 1, 2, 3].includes(s.proposal.priority), `${s.id} proposes a priority the registry accepts`);
}

/* ---- a question the reader cannot answer is not asked ---- */
ok(!fromServer.some((s) => s.kind === 'brief'), 'the server does not judge a vault it cannot see');
ok(signals({ ...state, draftCounts: null, drafts: {} }, { brief: { date: '2026-09-01' }, drafts: [] }, now).some((s) => s.id === 'brief.stale'), 'the floor does, when it has the export');

/* ---- the content rules read the same either way ---- */
const a = signals({ ...state, draftCounts: { total: 5, waiting: 0, posted: 0 } }, null, now).filter((s) => s.kind === 'content').map((s) => s.id).sort();
const bb = signals({ ...state, draftCounts: null, drafts: {} }, { drafts: [1, 2, 3, 4, 5].map((n) => ({ id: `d${n}`, status: 'approved' })) }, now).filter((s) => s.kind === 'content').map((s) => s.id).sort();
ok(a.join() === bb.join(), `counts and a draft list give the same content signals (${a.join()} vs ${bb.join()})`);

if (fails.length) { console.error(`✗ signals: ${fails.length} failed`); for (const f of fails) console.error('  · ' + f); process.exit(1); }
console.log(`✓ signals — addressable, evidenced, proposing legal work, and identical on the floor and the server (${fromFloor.length} signals, 24 checks)`);
