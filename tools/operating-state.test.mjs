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
ok(TABLE_IDS.length === 7, 'seven tables');
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
await state.insert(db2, 'list_items', { list: 'moves', text: 'Ship it', tag: 'now' });
await state.insert(db2, 'venture_focus', { venture: 'archives', rank: 1, allocation: 'push', why: 'x' });
ok((await mirrorLists(db2, scratch, now)) !== 'kept' && (await mirrorFocus(db2, scratch, now)) !== 'kept', 'lists and focus written as generated files');
ok(/Ship it `now`/.test(fs.readFileSync(path.join(scratch, '05-Knowledge', 'Lists.md'), 'utf8')), 'the move is in Lists.md');
fs.rmSync(scratch, { recursive: true, force: true });

if (fails.length) { console.error(`✗ operating state — ${fails.length} failed:\n  ${fails.join('\n  ')}`); process.exit(1); }
console.log(`✓ operating state — registry, orders, lists, focus, decisions, the Bridge aggregate and the vault mirror behave (${9 + 6 + 9 + 10 + 9} checks)`);
