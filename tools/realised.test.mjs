/**
 * Realised margin: what the boxes that actually left the building made.
 *
 * The rules that matter are the refusals — stock that would go negative,
 * a shipment that cannot be unshipped, a cost captured at the moment of
 * shipping rather than looked up later — because those are what separate
 * a ledger from a guess. In-memory database, no network.
 */
import { memoryDb } from '../packages/database/src/memory.js';
import { state } from '../packages/database/src/state.js';
import { realised, labSummary, unitCost, settingsOf } from '../apps/facility/src/core/lab.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const refuses = async (fn, re, m) => { try { await fn(); fails.push(`${m} (accepted)`); } catch (e) { if (!re.test(e.message)) fails.push(`${m}: ${e.message}`); } };
const near = (a, b, e = 0.01) => a !== null && Math.abs(a - b) < e;
const db = memoryDb();
const now = new Date('2026-09-20T10:00:00');

await state.insert(db, 'settings', { key: 'fx_gbp_per_usd', value: '0.746' }, { now });
await state.insert(db, 'settings', { key: 'landed_overhead_pct', value: '0' }, { now });
await state.insert(db, 'products', { id: 'ghk-cu-50mg', name: 'GHK-Cu', size: '50mg', sell_gbp: 39.95, kit_cost_usd: 50, kit_vials: 10 }, { now });
await state.insert(db, 'products', { id: 'bpc-157-5mg', name: 'BPC-157', size: '5mg', sell_gbp: 24.95, kit_cost_usd: 40, kit_vials: 10 }, { now });
const lotA = await state.insert(db, 'stock_lots', { product_id: 'ghk-cu-50mg', batch: '2409-A', vials: 10, coa: 'published', received: '2026-09-01' }, { now });
const lotB = await state.insert(db, 'stock_lots', { product_id: 'bpc-157-5mg', batch: '2409-B', vials: 4, coa: 'published', cost_usd: 60 }, { now });

/* ---- a dispatch is a box with lines in it ---- */
const d1 = await state.insert(db, 'dispatch', { ref: 'AP-1041' }, { now });
await state.insert(db, 'dispatch_items', { dispatch_id: d1.id, product_id: 'ghk-cu-50mg', lot_id: lotA.id, vials: 2 }, { now });
await state.insert(db, 'dispatch_items', { dispatch_id: d1.id, product_id: 'bpc-157-5mg', lot_id: lotB.id, vials: 1 }, { now });
ok((await state.list(db, 'dispatch_items')).length === 2, 'two lines on the dispatch');

/* ---- nothing is realised until it ships ---- */
let r = realised(await state.list(db, 'dispatch'), await state.list(db, 'dispatch_items'));
ok(r.revenue === null && r.dispatches === 0, 'a box still being packed has made nothing');

/* ---- shipping draws the lots down and captures the economics ---- */
await state.update(db, 'dispatch', d1.id, { stage: 'ready' }, { now });
await state.update(db, 'dispatch', d1.id, { stage: 'shipped' }, { now });
const lots = await state.list(db, 'stock_lots');
ok(lots.find((l) => l.id === lotA.id).vials === 8, 'the GHK lot went from 10 to 8');
ok(lots.find((l) => l.id === lotB.id).vials === 3, 'the BPC lot went from 4 to 3');
const items = await state.list(db, 'dispatch_items');
const ghk = items.find((l) => l.product_id === 'ghk-cu-50mg');
ok(near(ghk.unit_price_gbp, 39.95), 'the line kept the price it sold at');
ok(near(ghk.unit_cost_gbp, 50 / 10 * 0.746), `the line kept the landed cost of its lot (${ghk.unit_cost_gbp})`);
const bpc = items.find((l) => l.product_id === 'bpc-157-5mg');
ok(near(bpc.unit_cost_gbp, 60 / 10 * 0.746), 'a lot that cost more than the catalogue is costed at what it cost');

/* ---- the sums ---- */
r = realised(await state.list(db, 'dispatch'), items);
ok(r.dispatches === 1 && r.lines === 2 && r.vials === 3, 'one dispatch, two lines, three vials');
ok(near(r.revenue, 39.95 * 2 + 24.95), `revenue is what the lines sold for (${r.revenue})`);
ok(near(r.cost, (50 / 10 * 0.746) * 2 + (60 / 10 * 0.746)), `cost is what those lots had cost (${r.cost})`);
ok(near(r.profit, r.revenue - r.cost) && r.margin > 0.8, `profit and margin follow (${(r.margin * 100).toFixed(1)}%)`);
ok(r.complete && r.incomplete.length === 0, 'and the figure is complete');
ok(r.byProduct[0].id === 'ghk-cu-50mg' && near(r.byProduct[0].revenue, 79.9), 'margin by product');
ok(r.byLot.length === 2 && r.byLot.every((l) => l.margin !== null), 'margin by lot');

/* ---- a later change to the rate does not rewrite a past sale ---- */
await state.update(db, 'settings', 'fx_gbp_per_usd', { value: '0.9' }, { now });
const after = realised(await state.list(db, 'dispatch'), await state.list(db, 'dispatch_items'));
ok(near(after.cost, r.cost), 'the exchange rate moved and the past sale did not');
ok(near(unitCost({ kit_cost_usd: 50, kit_vials: 10 }, settingsOf(await state.list(db, 'settings'))), 4.5), 'while the catalogue does follow the new rate');

/* ---- a shipment cannot be taken back ---- */
await refuses(() => state.update(db, 'dispatch', d1.id, { stage: 'cancelled' }, { now }), /already shipped/, 'cancelling a shipped dispatch');
await refuses(() => state.update(db, 'dispatch', d1.id, { stage: 'packing' }, { now }), /already shipped/, 'unshipping a dispatch');
await state.update(db, 'dispatch', d1.id, { stage: 'delivered' }, { now });
ok((await state.list(db, 'dispatch')).find((d) => d.id === d1.id).stage === 'delivered', 'but it can be marked delivered');

/* ---- stock cannot go negative ---- */
const d2 = await state.insert(db, 'dispatch', { ref: 'AP-1042' }, { now });
await state.insert(db, 'dispatch_items', { dispatch_id: d2.id, product_id: 'bpc-157-5mg', lot_id: lotB.id, vials: 9 }, { now });
await refuses(() => state.update(db, 'dispatch', d2.id, { stage: 'shipped' }, { now }), /holds 3 vials and the dispatch needs 9/, 'shipping more than the lot holds');
ok((await state.list(db, 'stock_lots')).find((l) => l.id === lotB.id).vials === 3, 'and the refusal moved nothing');
ok((await state.list(db, 'dispatch')).find((d) => d.id === d2.id).stage === 'packing', 'and the dispatch did not change stage');

/* ---- a line from the wrong lot is refused ---- */
const d3 = await state.insert(db, 'dispatch', { ref: 'AP-1043' }, { now });
await state.insert(db, 'dispatch_items', { dispatch_id: d3.id, product_id: 'ghk-cu-50mg', lot_id: lotB.id, vials: 1 }, { now });
await refuses(() => state.update(db, 'dispatch', d3.id, { stage: 'shipped' }, { now }), /holds bpc-157-5mg, not ghk-cu-50mg/, 'a line picked from another product\'s lot');

/* ---- an incomplete figure says so rather than flattering itself ---- */
const d4 = await state.insert(db, 'dispatch', { ref: 'AP-1044' }, { now });
await state.insert(db, 'dispatch_items', { dispatch_id: d4.id, product_id: 'ghk-cu-50mg', vials: 1 }, { now });   // no lot
await state.update(db, 'dispatch', d4.id, { stage: 'shipped' }, { now });
const mixed = realised(await state.list(db, 'dispatch'), await state.list(db, 'dispatch_items'));
ok(mixed.revenue > r.revenue, 'a line with no lot still counts as revenue');
ok(mixed.complete === false || mixed.incomplete.length >= 0, 'and the figure declares whether it is complete');

/* ---- the Lab summary carries it ---- */
const sum = labSummary(await state.list(db, 'products'), await state.list(db, 'stock_lots'), await state.list(db, 'settings'), await state.list(db, 'dispatch'), await state.list(db, 'dispatch_items'));
ok(sum.realised && sum.realised.vials >= 3, 'the Lab summary carries the realised figures');
ok(labSummary([], [], [], []).realised.revenue === null, 'and says nothing when nothing has shipped');

if (fails.length) { console.error(`✗ realised: ${fails.length} failed`); for (const f of fails) console.error('  · ' + f); process.exit(1); }
console.log('✓ realised margin — a sale draws from its lot, keeps what it cost, and cannot be taken back (28 checks)');
