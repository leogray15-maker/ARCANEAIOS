/**
 * A proposal is not work.
 *
 * The rule the whole loop turns on: an agent may put something forward,
 * but nothing enters the floor's queue until the operator approves it, and
 * whatever is put forward must say who proposed it and what it came from.
 * In-memory database, no network, no model.
 */
import { memoryDb } from '../packages/database/src/memory.js';
import { state } from '../packages/database/src/state.js';
import { aggregate } from '../packages/database/src/bridge.js';
import { events } from '../packages/database/src/content.js';
import { ORDER_STATES, ORDER_OPEN_STATES } from '../packages/config/src/index.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const refuses = async (fn, re, m) => { try { await fn(); fails.push(`${m} (accepted)`); } catch (e) { if (!re.test(e.message)) fails.push(`${m}: ${e.message}`); } };
const db = memoryDb();
const now = new Date('2026-09-20T09:00:00');

/* ---- the vocabulary ---- */
ok(ORDER_STATES[0] === 'proposed', 'proposed comes before open in the vocabulary');
ok(!ORDER_OPEN_STATES.includes('proposed'), 'proposed is not one of the open states');

/* ---- what a proposal must carry ---- */
await refuses(() => state.insert(db, 'orders', { room: 'apothecary', text: 'Reorder GHK-Cu', state: 'proposed' }, { now }),
  /must name the agent/, 'a proposal without an agent');
await refuses(() => state.insert(db, 'orders', { room: 'apothecary', text: 'Reorder GHK-Cu', state: 'proposed', agent: 'nobody' }, { now }),
  /unknown agent/, 'a proposal from an agent that does not exist');
await refuses(() => state.insert(db, 'orders', { room: 'apothecary', text: 'Reorder GHK-Cu', state: 'proposed', agent: 'intel' }, { now }),
  /what it came from/, 'a proposal with no source');
await refuses(() => state.insert(db, 'orders', { room: 'forge', text: 'x', source_id: 'CIP-R-1' }, { now }),
  /source_id needs a source/, 'a source_id with no source');

const p = await state.insert(db, 'orders', { room: 'apothecary', text: 'Reorder GHK-Cu before the weekend', priority: 1, state: 'proposed', actor: 'agent', agent: 'intel', holder: 'CIPHER', source: 'agent', source_id: 'CIP-R-20260920-001', note: 'Supplier raised the kit price 12%.' }, { actor: 'intel', now });
ok(p.state === 'proposed' && p.agent === 'intel' && p.source_id === 'CIP-R-20260920-001', 'a proposal keeps who proposed it and what from');

/* ---- a proposal cannot be marked done, because nobody did it ---- */
await refuses(() => state.update(db, 'orders', p.id, { state: 'done' }, { now }), /only be approved/, 'a proposal marked done');
await refuses(() => state.update(db, 'orders', p.id, { state: 'active' }, { now }), /only be approved/, 'a proposal marked active');

/* ---- it is not work until it is approved ---- */
await state.insert(db, 'orders', { room: 'forge', text: 'Real work', priority: 1 }, { now });
let agg = await aggregate(db, { now });
ok(agg.active.open === 1, `a proposal is not counted as open work (${agg.active.open})`);
ok(agg.waiting.proposals.length === 1, 'the Bridge shows it under what is waiting');
ok(agg.waiting.proposals[0].agent_name === 'CIPHER', 'the proposal names the agent that made it');
ok(agg.waiting.proposals[0].source_id === 'CIP-R-20260920-001', 'and the run it came from');
ok(!agg.today.orders.some((o) => o.id === p.id), 'a proposal is not in what matters today');
ok(!agg.active.by_room.apothecary, 'a proposal does not make a room look busy');

/* ---- approval is the operator's act, and the record says so ---- */
const approved = await state.update(db, 'orders', p.id, { state: 'open' }, { actor: 'leo', now });
ok(approved.state === 'open', 'approving makes it work');
const log = await events.list(db, { limit: 50 });
const ev = log.find((e) => e.subject_id === p.id && /proposed → open/.test(e.summary));
ok(!!ev, 'the approval is in the record');
ok(ev.actor === 'leo', 'the record says the operator approved it, not the agent');
agg = await aggregate(db, { now });
ok(agg.active.open === 2 && agg.waiting.proposals.length === 0, 'once approved it is work and no longer waiting');
ok(agg.today.orders.some((o) => o.id === p.id), 'and it reaches the Bridge as work');

/* ---- a refused proposal is killed, never deleted: the record keeps it ---- */
const p2 = await state.insert(db, 'orders', { room: 'market', text: 'Raise the price', state: 'proposed', actor: 'agent', agent: 'intel', source: 'agent', source_id: 'CIP-R-20260920-001' }, { actor: 'intel', now });
await refuses(() => state.remove(db, 'orders', p2.id), /never deleted/, 'deleting a proposal');
const killed = await state.update(db, 'orders', p2.id, { state: 'killed' }, { actor: 'leo', now });
ok(killed.state === 'killed' && killed.done_at, 'a refused proposal is killed and stamped');
const rows = await state.list(db, 'orders');
ok(rows.some((o) => o.id === p2.id), 'and the row is still there to be answered for');

/* ---- a signal can be the source too, with no agent behind it ---- */
const fromSignal = await state.insert(db, 'orders', { room: 'vault', text: 'Type this month\'s cash', source: 'signal', source_id: 'money.cash-stale' }, { now });
ok(fromSignal.source === 'signal' && fromSignal.source_id === 'money.cash-stale' && fromSignal.state === 'open', 'work opened from a signal carries the signal it came from and is open at once');

if (fails.length) { console.error(`✗ proposals: ${fails.length} failed`); for (const f of fails) console.error('  · ' + f); process.exit(1); }
console.log('✓ proposals — an agent proposes, the operator approves, and every order can say what caused it (24 checks)');
