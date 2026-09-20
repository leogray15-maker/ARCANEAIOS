/**
 * The floor's operating state, as verbs.
 *
 * One registry describes each table the rooms run on: its key, which
 * columns a caller may set, what each must be, and how an id is minted.
 * The API gateway (api/state.js) and the tools go through `insert`,
 * `update`, `remove` and `list` here, so a rule holds in one place: an
 * order's priority is 0–3, a decision's verdict is one of four words, a
 * list item belongs to a known list. Every change leaves a system event.
 *
 * Shapes are the tables' own (docs/DATA-MODEL.md); the facility's store
 * maps them to what the floor draws.
 */
import { randomUUID } from 'node:crypto';
import { ROOM_BY_ID, VENTURE_BY_ID, AGENT_BY_ID, ORDER_STATES, ORDER_PRIORITY, ORDER_SOURCES, ORDER_FROM_PROPOSED, VERDICTS } from '../../config/src/index.js';
import { DatabaseError } from './index.js';
import { nextId } from './content.js';
import { events } from './content.js';

export const LISTS = ['moves', 'stop', 'watch', 'pipeline', 'ideas', 'lessons', 'manuscripts'];
export const ALLOCATIONS = ['push', 'maintain', 'starve'];
export const COA_STATES = ['none', 'pending', 'published'];
export const DISPATCH_STAGES = ['packing', 'ready', 'shipped', 'delivered', 'cancelled'];
export const SETTING_KEYS = ['fx_gbp_per_usd', 'landed_overhead_pct', 'low_stock_vials'];

const str = (max = 2000) => (v) => { const s = String(v ?? '').trim(); if (s.length > max) throw bad(`too long (max ${max})`); return s; };
const oneOf = (list) => (v) => { const s = String(v ?? ''); if (!list.includes(s)) throw bad(`must be one of ${list.join(', ')}`); return s; };
const int = (lo, hi) => (v) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw bad(`must be an integer ${lo}–${hi}`); return n; };
const num = () => (v) => { const n = Number(v); if (!Number.isFinite(n)) throw bad('must be a number'); return n; };
const numOrNull = (lo = -Infinity) => (v) => { if (v === null || v === '' || v === undefined) return null; const n = Number(v); if (!Number.isFinite(n) || n < lo) throw bad(`must be a number${lo > -Infinity ? ` ≥ ${lo}` : ''}`); return n; };
const intOrNull = (lo = -Infinity, hi = Infinity) => (v) => { if (v === null || v === '' || v === undefined) return null; const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw bad(`must be an integer${lo > -Infinity ? ` ${lo}–${hi === Infinity ? '' : hi}` : ''}`); return n; };
const dayReq = () => (v) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw bad('day must be YYYY-MM-DD'); return String(v); };
const slug = () => (v) => { const s = String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); if (!s) throw bad('needs an id'); return s; };
const bool = () => (v) => v === true || v === 'true' || v === 1;
const dateOrNull = () => (v) => { if (v === null || v === '' || v === undefined) return null; const d = new Date(v); if (Number.isNaN(d.getTime())) throw bad('must be a date'); return d.toISOString(); };
const dayOrNull = () => (v) => { if (v === null || v === '' || v === undefined) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw bad('must be YYYY-MM-DD'); return String(v); };
const jsonArr = () => (v) => (Array.isArray(v) ? v : []);
const jsonObjOrNull = () => (v) => (v && typeof v === 'object' ? v : null);
const room = () => (v) => { const s = String(v ?? ''); if (!ROOM_BY_ID[s]) throw bad(`unknown room "${s}"`); return s; };
const agentOrEmpty = () => (v) => { const s = String(v ?? ''); if (s && !AGENT_BY_ID[s]) throw bad(`unknown agent "${s}"`); return s; };
const ventureOrEmpty = () => (v) => { const s = String(v ?? ''); if (s && !VENTURE_BY_ID[s]) throw bad(`unknown venture "${s}"`); return s; };
const bad = (m) => new DatabaseError(m, { status: 400 });

/**
 * The registry. `key` is the primary key column; `mint` makes an id for
 * an insert (or the caller supplies the key, for the natural-key tables);
 * `fields` are the settable columns with their validators; `required` must
 * be present on insert; `order` is the default listing order.
 */
export const TABLES = {
  orders: {
    key: 'id', mint: (db, now) => nextId(db, 'orders', 'ORD', now), order: 'priority.asc,created_at.desc', event: 'order',
    required: ['room', 'text'],
    defaults: { priority: 2, state: 'open', holder: 'Leo', actor: 'human', venture: '', blocked_on: '', due: null, note: '', source: 'floor', source_id: '', agent: '', brain_n: null, done_at: null },
    fields: { room: room(), text: str(500), priority: int(0, 3), state: oneOf(ORDER_STATES), holder: str(60), actor: oneOf(['human', 'agent']), venture: ventureOrEmpty(), blocked_on: str(300), due: dayOrNull(), note: str(2000), source: oneOf(ORDER_SOURCES), source_id: str(80), agent: agentOrEmpty(), brain_n: (v) => (v === null || v === undefined || v === '' ? null : int(0, 100000)(v)), done_at: dateOrNull() },
    // A proposal must say who made it and what it came from, or it cannot
    // be answered for later; and it may only be approved or killed, never
    // marked done, because nobody did it.
    check(row, { insert, current } = {}) {
      const state = row.state ?? current?.state;
      if (state === 'proposed') {
        const agent = row.agent ?? current?.agent;
        const source = row.source ?? current?.source;
        if (!agent) throw bad('a proposed order must name the agent that proposed it');
        if (!source || source === 'floor') throw bad('a proposed order must say what it came from (source: agent, signal, counsel, council)');
      }
      if (!insert && current?.state === 'proposed' && row.state && row.state !== 'proposed' && !ORDER_FROM_PROPOSED.includes(row.state)) {
        throw bad(`a proposed order can only be approved (open) or killed — not ${row.state}`);
      }
      if ((row.source_id ?? '') && (row.source ?? current?.source ?? 'floor') === 'floor') throw bad('source_id needs a source that is not the floor');
    },
  },
  list_items: {
    key: 'id', mint: () => randomUUID(), order: 'position.asc,created_at.desc', event: 'item',
    required: ['list', 'text'],
    defaults: { tag: '', venture: '', position: 0, done: false, outcome: '', done_at: null },
    fields: { list: oneOf(LISTS), text: str(500), tag: str(40), venture: ventureOrEmpty(), position: int(-100000, 100000), done: bool(), outcome: str(1000), done_at: dateOrNull() },
  },
  decisions: {
    key: 'id', mint: (db, now) => nextId(db, 'decisions', 'DEC', now), order: 'created_at.desc', event: 'decision',
    required: ['question'],
    defaults: { verdict: 'WATCH', summary: '', conditions: [], dissent: '', positions: [], outcome: '', source: 'council', device: '', usage: {}, reviewed_at: null },
    fields: { question: str(500), verdict: oneOf(VERDICTS), summary: str(4000), conditions: jsonArr(), dissent: str(2000), positions: jsonArr(), outcome: str(2000), source: oneOf(['council', 'leo']), device: str(60), usage: (v) => (v && typeof v === 'object' ? v : {}), reviewed_at: dateOrNull() },
  },
  counsel_turns: {
    key: 'id', mint: () => randomUUID(), order: 'created_at.asc', event: 'counsel',
    required: ['who', 'text'],
    defaults: { specialist: '', proposal: null, device: '' },
    fields: { who: oneOf(['leo', 'arcane']), text: str(8000), specialist: str(60), proposal: jsonObjOrNull(), device: str(60) },
  },
  venture_focus: {
    key: 'venture', natural: true, order: 'rank.asc', event: 'focus',
    required: ['venture'],
    defaults: { rank: 0, allocation: 'maintain', why: '' },
    fields: { venture: (v) => { const s = String(v ?? ''); if (!VENTURE_BY_ID[s]) throw bad(`unknown venture "${s}"`); return s; }, rank: int(0, 10), allocation: oneOf(ALLOCATIONS), why: str(300) },
  },
  goal_progress: {
    key: 'goal_id', natural: true, order: 'goal_id.asc', event: 'goal',
    required: ['goal_id'],
    defaults: { value: 0, note: '' },
    fields: { goal_id: str(40), value: num(), note: str(300) },
  },
  days: {
    key: 'day', natural: true, order: 'day.desc', event: 'day',
    required: ['day'],
    defaults: { focus: '', note: '', energy: null, sleep: null },
    fields: { day: (v) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw bad('day must be YYYY-MM-DD'); return String(v); }, focus: str(300), note: str(4000), energy: (v) => (v === null || v === '' || v === undefined ? null : int(1, 10)(v)), sleep: (v) => (v === null || v === '' || v === undefined ? null : num()(v)) },
  },
  /* ---- THE LAB (0005) ---- */
  settings: {
    key: 'key', natural: true, order: 'key.asc', event: 'setting',
    required: ['key'],
    defaults: { value: '', note: '' },
    fields: { key: oneOf(SETTING_KEYS), value: str(200), note: str(300) },
  },
  products: {
    key: 'id', natural: true, order: 'category.asc,name.asc,size.asc', event: 'product',
    required: ['id', 'name'],
    defaults: { size: '', category: '', listed: true, sell_gbp: null, supplier_id: 'jx', supplier_code: '', supplier_section: '', kit_cost_usd: null, kit_vials: 10, active: true, note: '' },
    fields: { id: slug(), name: str(120), size: str(40), category: str(80), listed: bool(), sell_gbp: numOrNull(0), supplier_id: str(20), supplier_code: str(20), supplier_section: str(80), kit_cost_usd: numOrNull(0), kit_vials: int(1, 1000), active: bool(), note: str(1000) },
  },
  stock_lots: {
    key: 'id', mint: (db, now) => nextId(db, 'stock_lots', 'LOT', now), order: 'created_at.desc', event: 'lot',
    required: ['product_id'],
    defaults: { batch: '', vials: 0, coa: 'none', coa_url: '', cost_usd: null, received: null, note: '' },
    fields: { product_id: str(120), batch: str(60), vials: int(0, 100000), coa: oneOf(COA_STATES), coa_url: str(500), cost_usd: numOrNull(0), received: dayOrNull(), note: str(1000) },
  },
  dispatch: {
    key: 'id', mint: (db, now) => nextId(db, 'dispatch', 'DSP', now), order: 'created_at.desc', event: 'dispatch',
    required: ['ref'],
    defaults: { items: '', stage: 'packing', tracking: '', note: '', shipped_at: null },
    fields: { ref: str(60), items: str(1000), stage: oneOf(DISPATCH_STAGES), tracking: str(120), note: str(1000), shipped_at: dateOrNull() },
  },
  /* ---- THE VAULT (0006) ---- */
  ledger_months: {
    key: 'id', natural: true, order: 'month.desc,venture.asc', event: 'ledger',
    required: ['id', 'month', 'venture'],
    defaults: { revenue_gbp: null, units: null, visitors: null, leads: null, orders: null, note: '' },
    fields: { id: (v) => { const s = String(v ?? ''); if (!/^\d{4}-\d{2}:[a-z]+$/.test(s)) throw bad('id must be YYYY-MM:venture'); return s; }, month: (v) => { if (!/^\d{4}-\d{2}$/.test(String(v))) throw bad('month must be YYYY-MM'); return String(v); }, venture: (v) => { const s = String(v ?? ''); if (!VENTURE_BY_ID[s]) throw bad(`unknown venture "${s}"`); return s; }, revenue_gbp: numOrNull(0), units: intOrNull(0), visitors: intOrNull(0), leads: intOrNull(0), orders: intOrNull(0), note: str(500) },
  },
  fixed_costs: {
    key: 'id', natural: true, order: 'name.asc', event: 'cost',
    required: ['id', 'name'],
    defaults: { amount_gbp: 0, room: '', active: true, note: '' },
    fields: { id: slug(), name: str(80), amount_gbp: (v) => Math.max(0, num()(v ?? 0)), room: str(30), active: bool(), note: str(300) },
  },
  cash_snapshots: {
    key: 'day', natural: true, order: 'day.desc', event: 'cash',
    required: ['day'],
    defaults: { cash_gbp: 0, note: '' },
    fields: { day: dayReq(), cash_gbp: (v) => Math.max(0, num()(v ?? 0)), note: str(300) },
  },
  pots: {
    key: 'id', natural: true, order: 'position.asc', event: 'pot',
    required: ['id', 'name'],
    defaults: { pct: 0, note: '', accent: 'ash', position: 0 },
    fields: { id: slug(), name: str(60), pct: (v) => { const n = num()(v); if (n < 0 || n > 100) throw bad('pct must be 0–100'); return n; }, note: str(300), accent: str(20), position: int(0, 100) },
  },
  /* ---- SANCTUM (0007) ---- */
  protocol_items: {
    key: 'id', natural: true, order: 'position.asc', event: 'protocol-item',
    required: ['id', 'name'],
    defaults: { target: 0, unit: '', cadence: 'day', active: true, position: 0 },
    fields: { id: slug(), name: str(60), target: num(), unit: str(30), cadence: oneOf(['day', 'week']), active: bool(), position: int(0, 100) },
  },
  protocol_ticks: {
    key: 'id', natural: true, order: 'day.desc', event: 'tick',
    required: ['id', 'day', 'item_id'],
    defaults: { done: true, value: null },
    fields: { id: (v) => { const s = String(v ?? ''); if (!/^\d{4}-\d{2}-\d{2}:[a-z0-9-]+$/.test(s)) throw bad('id must be YYYY-MM-DD:item'); return s; }, day: dayReq(), item_id: str(40), done: bool(), value: numOrNull() },
  },
  entries: {
    key: 'id', mint: (db, now) => nextId(db, 'entries', 'ENT', now), order: 'created_at.desc', event: 'entry',
    required: ['kind'],
    defaults: { title: '', body: '', status: 'open', private: true },
    fields: { kind: oneOf(['journal', 'reflection', 'principle', 'objective', 'decision']), title: str(200), body: str(20000), status: oneOf(['open', 'kept', 'done', 'dropped']), private: bool() },
  },
  /* ---- THE TRADING FLOOR (0008) ---- */
  trades: {
    key: 'id', natural: true, order: 'opened.desc', event: 'trade',
    required: ['id'],
    defaults: { instrument: 'XAUUSD', direction: 'Long', session: '', killzone: '', setup: 'unplanned', bias: '', grade: '', conviction: null, entry: null, stop: null, target: null, exit: null, risk: null, size: null, opened: null, closed: null, plan_followed: false, rule_breaks: [], emotion_before: '', emotion_during: '', emotion_after: '', energy: null, sleep: null, stress: null, streamed: false, process: '', thesis: '', execution: '', review: '', lesson: '', chart: '', example: false },
    fields: { id: (v) => { const s = String(v ?? '').trim(); if (!/^T-\d{8}-\d{2,3}$/.test(s)) throw bad('id must be T-YYYYMMDD-NN'); return s; }, instrument: str(20), direction: oneOf(['Long', 'Short']), session: str(30), killzone: str(40), setup: str(60), bias: str(20), grade: str(5), conviction: intOrNull(1, 5), entry: numOrNull(), stop: numOrNull(), target: numOrNull(), exit: numOrNull(), risk: numOrNull(0), size: numOrNull(0), opened: dateOrNull(), closed: dateOrNull(), plan_followed: bool(), rule_breaks: (v) => (Array.isArray(v) ? v.map(String) : []), emotion_before: str(30), emotion_during: str(30), emotion_after: str(30), energy: intOrNull(1, 5), sleep: numOrNull(0), stress: intOrNull(1, 5), streamed: bool(), process: str(5), thesis: str(4000), execution: str(4000), review: str(4000), lesson: str(1000), chart: str(500), example: bool() },
  },
  setups: {
    key: 'id', natural: true, order: 'name.asc', event: 'setup',
    required: ['id', 'name'],
    defaults: { status: 'Active', session: '', tf: '', conditions: '', trigger: '', stop: '', target: '', aplus: '', invalidation: '' },
    fields: { id: slug(), name: str(60), status: str(20), session: str(30), tf: str(40), conditions: str(2000), trigger: str(2000), stop: str(500), target: str(500), aplus: str(500), invalidation: str(500) },
  },
  checkins: {
    key: 'id', mint: () => randomUUID(), order: 'created_at.desc', event: 'checkin',
    required: [],
    defaults: { type: 'Pre-market', mood: '', stress: null, energy: null, sleep: null, streamed: false, acted: false, trigger: '', note: '' },
    fields: { type: str(30), mood: str(30), stress: intOrNull(1, 5), energy: intOrNull(1, 5), sleep: numOrNull(0), streamed: bool(), acted: bool(), trigger: str(300), note: str(2000) },
  },
};
export const TABLE_IDS = Object.keys(TABLES);

function spec(table) { const t = TABLES[table]; if (!t) throw new DatabaseError(`no such table "${table}"`, { status: 404 }); return t; }

/** Validate a patch against the registry: unknown columns are refused, known ones are coerced. */
export function clean(table, input, { insert = false, current = null } = {}) {
  const t = spec(table); const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (k === t.key && t.natural) { out[k] = t.fields[k] ? t.fields[k](v) : String(v); continue; }
    if (!(k in t.fields)) { if (['id', 'created_at', 'updated_at', 'code'].includes(k)) continue; throw bad(`${table} has no settable column "${k}"`); }
    out[k] = t.fields[k](v);
  }
  if (insert) {
    for (const r of t.required) if (out[r] === undefined || out[r] === '') throw bad(`${table}: ${r} is required`);
    // The defaults live here as well as in the schema so the in-memory twin and Postgres agree row for row.
    for (const [k, v] of Object.entries(t.defaults || {})) if (out[k] === undefined) out[k] = v;
  }
  // A rule that spans columns (a proposal must name its agent) belongs here,
  // once, rather than in whichever surface happens to write the row.
  if (t.check) t.check(out, { insert, current });
  return out;
}

export const state = {
  async list(db, table, { limit = 1000, where = {} } = {}) {
    const t = spec(table);
    return db.get(table, { select: '*', order: t.order, limit: Math.min(5000, Number(limit) || 1000), ...where });
  },
  /** Every table the floor needs, in one round trip. */
  async all(db, tables = TABLE_IDS) {
    const out = {};
    for (const t of tables) out[t] = await state.list(db, t);
    return out;
  },
  async insert(db, table, input, { actor = 'leo', now = new Date() } = {}) {
    const t = spec(table);
    const row = clean(table, input, { insert: true });
    if (!t.natural) row[t.key] = await t.mint(db, now);
    row.created_at = now.toISOString();
    if (t.natural) {
      const [saved] = await db.post(table, row, { upsert: t.key });
      await events.add(db, { kind: `${t.event}.set`, actor, subject_type: t.event, subject_id: String(row[t.key]), summary: summarise(table, saved) });
      return saved;
    }
    const [saved] = await db.post(table, row);
    await events.add(db, { kind: `${t.event}.added`, actor, subject_type: t.event, subject_id: String(saved[t.key]), summary: summarise(table, saved) });
    return saved;
  },
  async update(db, table, id, input, { actor = 'leo', now = new Date() } = {}) {
    const t = spec(table);
    const cur0 = await db.get(table, { select: '*', [t.key]: `eq.${id}` }, { single: true });
    if (!cur0) throw new DatabaseError(`no ${table} ${id}`, { status: 404 });
    const patch = clean(table, input, { current: cur0 });
    delete patch[t.key];
    if (!Object.keys(patch).length) throw bad('nothing to change');
    const cur = cur0;
    if (table === 'orders' && patch.state && patch.state !== cur.state) patch.done_at = ['done', 'killed'].includes(patch.state) ? now.toISOString() : null;
    if (table === 'list_items' && patch.done !== undefined && patch.done !== cur.done) patch.done_at = patch.done ? now.toISOString() : null;
    if (table === 'decisions' && patch.outcome !== undefined && patch.outcome !== cur.outcome) patch.reviewed_at = patch.outcome ? now.toISOString() : null;
    if (table === 'dispatch' && patch.stage === 'shipped' && cur.stage !== 'shipped') patch.shipped_at = now.toISOString();
    const [saved] = await db.patch(table, { [t.key]: `eq.${id}` }, patch);
    const change = table === 'orders' && patch.state ? `${cur.state} → ${patch.state}` : table === 'list_items' && patch.done !== undefined ? (patch.done ? 'done' : 'reopened') : table === 'decisions' && patch.outcome ? 'outcome recorded' : Object.keys(patch).join(', ');
    await events.add(db, { kind: `${t.event}.changed`, actor, subject_type: t.event, subject_id: String(id), summary: `${summarise(table, saved)} — ${change}`, data: { fields: Object.keys(patch) } });
    return saved;
  },
  async remove(db, table, id, { actor = 'leo' } = {}) {
    const t = spec(table);
    if (table === 'decisions' || table === 'orders') throw bad(`${table} are never deleted — set state to killed`);
    if (table === 'products') throw bad('products are never deleted — set active to false');
    if (table === 'entries') throw bad('entries are never deleted — set status to dropped');
    if (table === 'dispatch') throw bad('dispatch rows are never deleted — set the stage to cancelled');
    const cur = await db.get(table, { select: '*', [t.key]: `eq.${id}` }, { single: true });
    if (!cur) throw new DatabaseError(`no ${table} ${id}`, { status: 404 });
    await db.delete(table, { [t.key]: `eq.${id}` });
    await events.add(db, { kind: `${t.event}.removed`, actor, subject_type: t.event, subject_id: String(id), summary: `removed: ${summarise(table, cur)}` });
    return cur;
  },
};

function summarise(table, r) {
  switch (table) {
    case 'orders': return `[P${r.priority}] ${ROOM_BY_ID[r.room]?.name || r.room}: ${r.text}`;
    case 'list_items': return `${r.list}${r.tag ? ` (${r.tag})` : ''}: ${r.text}`;
    case 'decisions': return `${r.verdict}: ${r.question}`;
    case 'counsel_turns': return `${r.who}: ${String(r.text).slice(0, 80)}`;
    case 'venture_focus': return `${VENTURE_BY_ID[r.venture]?.name || r.venture}: rank ${r.rank}, ${r.allocation}`;
    case 'goal_progress': return `${r.goal_id}: ${r.value}`;
    case 'days': return `${r.day}: ${r.focus || '(no focus)'}`;
    case 'settings': return `${r.key} = ${r.value}`;
    case 'products': return `${r.name} ${r.size}${r.sell_gbp ? ` £${r.sell_gbp}` : ''}${r.kit_cost_usd ? ` · kit $${r.kit_cost_usd}` : ''}`;
    case 'stock_lots': return `${r.product_id} · ${r.vials} vials · COA ${r.coa}${r.batch ? ` · batch ${r.batch}` : ''}`;
    case 'dispatch': return `${r.ref}: ${r.stage}${r.items ? ` — ${String(r.items).slice(0, 60)}` : ''}`;
    case 'ledger_months': return `${r.month} ${VENTURE_BY_ID[r.venture]?.name || r.venture}: ${r.revenue_gbp !== null && r.revenue_gbp !== undefined ? `£${r.revenue_gbp}` : ''}${r.units !== null && r.units !== undefined ? ` · ${r.units} units` : ''}`;
    case 'fixed_costs': return `${r.name}: £${r.amount_gbp}/mo${r.active === false ? ' (retired)' : ''}`;
    case 'cash_snapshots': return `cash ${r.day}: £${r.cash_gbp}`;
    case 'pots': return `${r.name}: ${r.pct}%`;
    case 'protocol_items': return `${r.name}: ${r.target} ${r.unit}`;
    case 'protocol_ticks': return `${r.day} ${r.item_id}: ${r.done ? 'done' : 'undone'}${r.value !== null && r.value !== undefined ? ` (${r.value})` : ''}`;
    case 'entries': return `${r.kind}: ${r.title || String(r.body).slice(0, 60)}`;
    case 'trades': return `${r.id} ${r.instrument} ${r.direction}${r.exit !== null && r.exit !== undefined ? ' closed' : ' open'}`;
    case 'setups': return `setup ${r.name} (${r.status})`;
    case 'checkins': return `check-in: ${r.type}${r.mood ? ` · ${r.mood}` : ''}`;
    default: return table;
  }
}
