/**
 * The operating state, checked headlessly: the registry refuses what it
 * should and defaults what Postgres would; ids mint in the HERALD shape;
 * moves and outcomes stamp their times; the Bridge aggregate arranges the
 * same rows into today / waiting / active / ventures; and the vault
 * mirrors round-trip Orders.md by number. In-memory database, no network.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { memoryDb } from '../packages/database/src/memory.js';
import { state, TABLE_IDS } from '../packages/database/src/state.js';
import { aggregate } from '../packages/database/src/bridge.js';
import { importOrders, mirrorOrders, mirrorLists, mirrorFocus, readOrdersMd } from './lib/state-mirror.mjs';
import { REPO } from './lib/brain.mjs';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const refuses = async (fn, re, m) => { try { await fn(); fails.push(`${m} (accepted)`); } catch (e) { if (!re.test(e.message)) fails.push(`${m}: ${e.message}`); } };
const db = memoryDb();
const now = new Date('2026-09-18T12:00:00');

/* ---- the registry ---- */
ok(TABLE_IDS.length === 22, 'twenty-two tables');
await refuses(() => state.insert(db, 'orders', { text: 'no room' }), /room is required/, 'order without a room');
await refuses(() => state.insert(db, 'orders', { room: 'nowhere', text: 'x' }), /unknown room/, 'order in an unknown room');
await refuses(() => state.insert(db, 'orders', { room: 'forge', text: 'x', priority: 7 }), /0–3/, 'priority out of range');
await refuses(() => state.insert(db, 'orders', { room: 'forge', text: 'x', colour: 'red' }), /no settable column/, 'unknown column');
await refuses(() => state.insert(db, 'list_items', { list: 'shopping', text: 'x' }), /must be one of/, 'unknown list');
await refuses(() => state.insert(db, 'decisions', { question: 'x', verdict: 'MAYBE' }), /must be one of/, 'unknown verdict');
await refuses(() => state.insert(db, 'venture_focus', { venture: 'moonshot' }), /unknown venture/, 'unknown venture');
await refuses(() => state.insert(db, 'days', { day: 'tomorrow' }), /YYYY-MM-DD/, 'malformed day');
await refuses(() => state.update(db, 'orders', 'ORD-nope', { state: 'done' }), /no orders ORD-nope/, 'update of a missing order');

/* ---- orders ---- */
const o1 = await state.insert(db, 'orders', { room: 'forge', text: 'Run migration 0004', priority: 0 }, { now });
const o2 = await state.insert(db, 'orders', { room: 'beacon', text: 'Review drafts', priority: 1, actor: 'agent' }, { now });
const o3 = await state.insert(db, 'orders', { room: 'archives', text: 'archives:sync', priority: 2, venture: 'archives', due: '2026-09-17' }, { now });
ok(o1.id === 'ORD-20260918-001' && o2.id === 'ORD-20260918-002', `ids mint by day (${o1.id}, ${o2.id})`);
ok(o1.state === 'open' && o1.holder === 'Leo' && o1.actor === 'human' && o1.source === 'floor', 'defaults as the schema would give them');
const b = await state.update(db, 'orders', o2.id, { state: 'blocked', blocked_on: 'credits' }, { now });
ok(b.state === 'blocked' && b.blocked_on === 'credits' && b.done_at === null, 'blocked with a reason');
const d = await state.update(db, 'orders', o1.id, { state: 'done' }, { now });
ok(d.done_at === now.toISOString(), 'done stamps done_at');
const re = await state.update(db, 'orders', o1.id, { state: 'open' }, { now });
ok(re.done_at === null, 'reopen clears done_at');
await refuses(() => state.remove(db, 'orders', o1.id), /never deleted/, 'orders cannot be removed');

/* ---- lists, focus, goals, days, decisions, counsel ---- */
const m1 = await state.insert(db, 'list_items', { list: 'moves', text: 'Ship the Bridge', tag: 'now', venture: 'archives' }, { now });
const m2 = await state.insert(db, 'list_items', { list: 'moves', text: 'Then the Vault', tag: 'next', position: 1 }, { now });
const m1d = await state.update(db, 'list_items', m1.id, { done: true, outcome: 'shipped' }, { now });
ok(m1d.done === true && m1d.done_at === now.toISOString() && m1d.outcome === 'shipped', 'a done move keeps its outcome and time');
await state.remove(db, 'list_items', m2.id);
ok((await state.list(db, 'list_items')).length === 1, 'a list item can be removed');
await state.insert(db, 'venture_focus', { venture: 'archives', rank: 1, allocation: 'push', why: 'recurring' });
await state.insert(db, 'venture_focus', { venture: 'archives', rank: 1, allocation: 'push', why: 'recurring revenue' });
ok((await state.list(db, 'venture_focus')).length === 1 && (await state.list(db, 'venture_focus'))[0].why === 'recurring revenue', 'natural-key tables set, not duplicate');
await state.insert(db, 'goal_progress', { goal_id: 'g-members', value: 12 });
await state.insert(db, 'days', { day: '2026-09-18', focus: 'Bridge and War Room', energy: 7 });
await refuses(() => state.insert(db, 'days', { day: '2026-09-18', energy: 11 }), /1–10/, 'energy out of range');
const dec = await state.insert(db, 'decisions', { question: 'Launch?', verdict: 'BUILD', conditions: ['a page'] }, { now });
ok(dec.id === 'DEC-20260918-001' && dec.outcome === '' && dec.reviewed_at === null, 'a decision without an outcome');
const decd = await state.update(db, 'decisions', dec.id, { outcome: 'launched' }, { now });
ok(decd.reviewed_at === now.toISOString(), 'an outcome stamps reviewed_at');
await state.insert(db, 'counsel_turns', { who: 'leo', text: 'what first?' });
await state.insert(db, 'counsel_turns', { who: 'arcane', text: 'the migrations', proposal: { room: 'forge', text: 'run 0004', priority: 'P0', actor: 'human' } });
ok((await state.list(db, 'counsel_turns')).length === 2, 'counsel turns kept in order');
ok(db.tables.system_events.length >= 14 && db.tables.system_events.every((e) => e.kind && e.summary), 'every change left an event');

/* ---- the Bridge aggregate ---- */
const a = await aggregate(db, { now });
ok(a.day.focus === 'Bridge and War Room', 'the day carries its focus');
ok(a.today.orders.length === 1 && a.today.orders[0].id === o1.id, `P0/P1 not blocked in today (${a.today.orders.map((o) => o.id)})`);
ok(a.today.due.length === 1 && a.today.due[0].id === o3.id, 'an overdue order is due');
ok(a.waiting.blocked.length === 1 && a.waiting.blocked[0].id === o2.id, 'blocked orders wait');
ok(a.waiting.decisions.length === 0, 'a decision with an outcome is not waiting');
ok(a.active.open === 3 && a.active.rooms.length === 3 && a.active.rooms[0].open === 1, 'rooms with work');
const arch = a.ventures.find((v) => v.id === 'archives');
ok(arch.rank === 1 && arch.allocation === 'push' && arch.open === 2 && arch.blocked === 1 && arch.moves === 0, `venture line from focus and orders (BEACON is an Archives room) (${arch.open}, ${arch.blocked})`);
ok(a.ventures[0].id === 'archives', 'ventures sorted by rank');
ok(a.goals.length === 1 && Number(a.goals[0].value) === 12, 'goal progress');
ok(a.counsel.length === 2 && a.counsel[1].proposal?.room === 'forge', 'counsel with its proposal');

/* ---- the vault mirror, on a scratch copy of the brain ---- */
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'arcane-brain-'));
fs.cpSync(path.join(REPO, 'brain'), scratch, { recursive: true });
const db2 = memoryDb();
const made = await importOrders(db2, scratch);
const md = readOrdersMd(scratch);
ok(made.length === md.open.length + md.closed.length, `every Orders.md row imported (${made.length})`);
ok((await importOrders(db2, scratch)).length === 0, 'the import is idempotent');
const fresh = await state.insert(db2, 'orders', { room: 'forge', text: 'A new one from the floor', priority: 0 });
const five = (await state.list(db2, 'orders')).find((o) => o.brain_n === md.open[0].n);
await state.update(db2, 'orders', five.id, { state: 'done' });
ok((await mirrorOrders(db2, scratch, now)) === 'updated', 'Orders.md rewritten');
const after = readOrdersMd(scratch);
const newRow = after.open.find((r) => r.text === 'A new one from the floor');
ok(newRow && newRow.priority === 0 && newRow.n > 0, 'the floor\'s order landed with a number and its priority');
ok(after.closed.some((r) => r.n === md.open[0].n), 'the done row moved to Closed');
ok((await state.list(db2, 'orders')).find((o) => o.id === fresh.id).brain_n === newRow.n, 'the number went back to the database');
ok((await mirrorOrders(db2, scratch, now)) === 'unchanged', 'a second mirror changes nothing');
// A proposal is not on the board: no number, not in Orders.md, until it is approved.
const prop = await state.insert(db2, 'orders', { room: 'apothecary', text: 'Proposed, not yet approved', state: 'proposed', actor: 'agent', agent: 'intel', source: 'agent', source_id: 'CIP-R-1' });
ok((await mirrorOrders(db2, scratch, now)) === 'unchanged', 'a proposal does not change Orders.md');
ok((await state.list(db2, 'orders')).find((o) => o.id === prop.id).brain_n === null, 'and it is given no number');
await state.update(db2, 'orders', prop.id, { state: 'open' });
ok((await mirrorOrders(db2, scratch, now)) === 'updated', 'once approved it reaches the vault');
ok(readOrdersMd(scratch).open.some((r) => r.text === 'Proposed, not yet approved'), 'as a numbered row on the board');
await state.insert(db2, 'list_items', { list: 'moves', text: 'Ship it', tag: 'now' });
await state.insert(db2, 'venture_focus', { venture: 'archives', rank: 1, allocation: 'push', why: 'x' });
ok((await mirrorLists(db2, scratch, now)) !== 'kept' && (await mirrorFocus(db2, scratch, now)) !== 'kept', 'lists and focus written as generated files');
ok(/Ship it `now`/.test(fs.readFileSync(path.join(scratch, '05-Knowledge', 'Lists.md'), 'utf8')), 'the move is in Lists.md');
fs.rmSync(scratch, { recursive: true, force: true });

/* ---- THE LAB: the arithmetic, the registry, the aggregate ---- */
const { economics, stockOf, labSummary, settingsOf } = await import('../apps/facility/src/core/lab.js');
const s746 = settingsOf([{ key: 'fx_gbp_per_usd', value: '0.746' }, { key: 'landed_overhead_pct', value: '0' }, { key: 'low_stock_vials', value: '12' }]);
const ghk = { id: 'ghk-cu-50mg', name: 'GHK-Cu', size: '50mg', kit_cost_usd: 35, kit_vials: 10, sell_gbp: 24.45, listed: true };
const eco = economics(ghk, s746);
ok(Math.abs(eco.cost - 2.611) < 0.001 && Math.abs(eco.margin - 0.893) < 0.001 && Math.abs(eco.markup - 9.36) < 0.01, `GHK-Cu economics as the margin sheet (${eco.cost.toFixed(3)}, ${(eco.margin * 100).toFixed(1)}%)`);
ok(economics({ ...ghk, kit_cost_usd: null }, s746).margin === null, 'no cost → no margin, not zero');
ok(Math.abs(economics(ghk, { ...s746, landed_overhead_pct: 20 }).cost - 3.133) < 0.001, 'landed overhead lifts the cost');
const db3 = memoryDb();
await state.insert(db3, 'products', ghk);
await state.insert(db3, 'products', { id: 'bpc-157-5mg', name: 'BPC-157', size: '5mg', kit_cost_usd: 48, sell_gbp: 15.95 });
await refuses(() => state.insert(db3, 'products', { name: 'no id' }), /id is required|needs an id/, 'a product needs an id');
await refuses(() => state.insert(db3, 'stock_lots', { product_id: 'ghk-cu-50mg', coa: 'maybe' }), /must be one of/, 'unknown COA state');
await refuses(() => state.insert(db3, 'stock_lots', { product_id: 'ghk-cu-50mg', vials: -1 }), /0–100000/, 'negative vials');
const lot1 = await state.insert(db3, 'stock_lots', { product_id: 'ghk-cu-50mg', batch: 'B1', vials: 20, coa: 'pending' }, { now });
const lot2 = await state.insert(db3, 'stock_lots', { product_id: 'ghk-cu-50mg', batch: 'B2', vials: 5, coa: 'published' }, { now });
await state.insert(db3, 'stock_lots', { product_id: 'bpc-157-5mg', batch: 'B3', vials: 4, coa: 'none' }, { now });
ok(lot1.id === 'LOT-20260918-001' && lot2.id === 'LOT-20260918-002', 'lots mint by day');
const st1 = stockOf('ghk-cu-50mg', await state.list(db3, 'stock_lots'));
ok(st1.vials === 25 && st1.coa === 'pending', 'stock sums the lots; COA is the worst live lot');
await state.update(db3, 'stock_lots', lot1.id, { coa: 'published' });
ok(stockOf('ghk-cu-50mg', await state.list(db3, 'stock_lots')).coa === 'published', 'all lots published → published');
const dsp = await state.insert(db3, 'dispatch', { ref: '#1042', items: '2× GHK-Cu' }, { now });
const shipped = await state.update(db3, 'dispatch', dsp.id, { stage: 'shipped' }, { now });
ok(dsp.id === 'DSP-20260918-001' && shipped.shipped_at === now.toISOString(), 'dispatch mints and stamps shipped_at');
await refuses(() => state.remove(db3, 'products', 'ghk-cu-50mg'), /never deleted/, 'products are retired, not deleted');
await state.insert(db3, 'settings', { key: 'fx_gbp_per_usd', value: '0.746' });
await refuses(() => state.insert(db3, 'settings', { key: 'anything', value: '1' }), /must be one of/, 'only known settings');
const sum = labSummary(await state.list(db3, 'products'), await state.list(db3, 'stock_lots'), await state.list(db3, 'settings'), await state.list(db3, 'dispatch'));
ok(sum.vials === 29 && sum.live === 2 && sum.coaPct === 50 && sum.low.length === 1 && sum.low[0].name === 'BPC-157' && sum.noCoa.length === 1, `the Lab summary: vials, COA %, low, no-COA (${sum.vials}, ${sum.coaPct}%, ${sum.low.length}, ${sum.noCoa.length})`);
ok(sum.dispatch.packing === 0 && sum.dispatch.ready === 0, 'a shipped order leaves the queue');
const a3 = await aggregate(db3, { now });
ok(a3.lab && a3.lab.vials === 29 && a3.lab.thinnest[0].name === 'BPC-157', 'the Bridge aggregate carries the Lab');

/* ---- THE VAULT, SANCTUM, THE TRADING FLOOR ---- */
const { moneySummary, history: moneyHistory } = await import('../apps/facility/src/core/money.js');
const db4 = memoryDb({ pots: [{ id: 'tax', pct: 25, position: 0 }, { id: 'pay', pct: 75, position: 1 }], protocol_items: [{ id: 'train', name: 'Train', target: 4, unit: 'per week', cadence: 'week', active: true, position: 0 }] });
await state.insert(db4, 'ledger_months', { id: '2026-09:archives', month: '2026-09', venture: 'archives', units: 12 });
await state.insert(db4, 'ledger_months', { id: '2026-09:peptides', month: '2026-09', venture: 'peptides', revenue_gbp: 900, visitors: 400, leads: 30, orders: 11 });
await state.insert(db4, 'ledger_months', { id: '2026-08:archives', month: '2026-08', venture: 'archives', units: 10 });
await refuses(() => state.insert(db4, 'ledger_months', { id: 'sept:archives', month: '2026-09', venture: 'archives' }), /YYYY-MM:venture/, 'ledger ids are month:venture');
await refuses(() => state.insert(db4, 'ledger_months', { id: '2026-09:moon', month: '2026-09', venture: 'moon' }), /unknown venture/, 'ledger needs a real venture');
await state.insert(db4, 'fixed_costs', { id: 'software', name: 'Software', amount_gbp: 120 });
await state.insert(db4, 'cash_snapshots', { day: '2026-09-01', cash_gbp: 3000 });
await state.insert(db4, 'cash_snapshots', { day: '2026-09-19', cash_gbp: 2500 });
await refuses(() => state.insert(db4, 'pots', { id: 'tax', name: 'Tax', pct: 130 }), /0–100/, 'a pot is a percentage');
const M = moneySummary({ ledger: await state.list(db4, 'ledger_months'), fixed: await state.list(db4, 'fixed_costs'), cash: await state.list(db4, 'cash_snapshots'), pots: await state.list(db4, 'pots') }, '2026-09');
ok(M.revenue === 12 * 128 + 900 && M.previous === 1280 && M.fixed === 120 && M.net === M.revenue - 120, `revenue from units × price and typed £ (${M.revenue})`);
ok(M.cash.cash === 2500 && M.cash.day === '2026-09-19' && M.runway === Infinity, 'the latest cash snapshot wins; covered when revenue beats fixed');
ok(moneySummary({ ledger: [], fixed: [{ amount_gbp: 500 }], cash: [{ day: '2026-09-19', cash_gbp: 1000 }], pots: [] }, '2026-09').runway === 2, 'runway = cash / shortfall');
ok(M.split === 100 && M.pots[0].amount === M.revenue * 0.25, 'the split over this month\'s revenue');
ok(moneyHistory(await state.list(db4, 'ledger_months'), await state.list(db4, 'fixed_costs')).map((h) => h.month).join() === '2026-09,2026-08', 'history newest first');
await state.insert(db4, 'protocol_ticks', { id: '2026-09-19:train', day: '2026-09-19', item_id: 'train' });
await refuses(() => state.insert(db4, 'protocol_ticks', { id: 'today:train', day: '2026-09-19', item_id: 'train' }), /YYYY-MM-DD:item/, 'tick ids are day:item');
const ent = await state.insert(db4, 'entries', { kind: 'principle', title: 'Revenue before vanity', body: 'x' }, { now });
ok(ent.id === 'ENT-20260918-001' && ent.private === true && ent.status === 'open', 'entries mint by day and are private by default');
await refuses(() => state.remove(db4, 'entries', ent.id), /never deleted/, 'entries are dropped, not deleted');
const tr = await state.insert(db4, 'trades', { id: 'T-20260919-01', direction: 'Long', entry: 2400, stop: 2390, target: 2430, exit: 2425, risk: 100, opened: '2026-09-19T08:05:00Z', closed: '2026-09-19T09:10:00Z', plan_followed: true });
ok(tr.instrument === 'XAUUSD' && tr.setup === 'unplanned' && tr.rule_breaks.length === 0, 'a trade takes the schema\'s defaults');
await refuses(() => state.insert(db4, 'trades', { id: 'T-20260919-01', direction: 'Sideways' }), /must be one of/, 'direction is Long or Short');
await refuses(() => state.insert(db4, 'trades', { id: 'trade-1' }), /T-YYYYMMDD-NN/, 'trade ids keep the journal\'s shape');
const a4 = await aggregate(db4, { now: new Date('2026-09-19T12:00:00') });
ok(a4.money.revenue === M.revenue && a4.protocol.done === 1 && a4.protocol.items === 1, 'the Bridge aggregate carries money and the protocol');

if (fails.length) { console.error(`✗ operating state — ${fails.length} failed:\n  ${fails.join('\n  ')}`); process.exit(1); }
console.log(`✓ operating state — registry, orders, lists, focus, decisions, the Lab, the Vault, Sanctum, the Journal, the Bridge aggregate and the vault mirror behave (${9 + 6 + 9 + 10 + 9 + 14 + 14 + 5} checks)`);
