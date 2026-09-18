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
import { ROOM_BY_ID, VENTURE_BY_ID, ORDER_STATES, ORDER_PRIORITY, VERDICTS } from '../../config/src/index.js';
import { DatabaseError } from './index.js';
import { nextId } from './content.js';
import { events } from './content.js';

export const LISTS = ['moves', 'stop', 'watch', 'pipeline', 'ideas'];
export const ALLOCATIONS = ['push', 'maintain', 'starve'];

const str = (max = 2000) => (v) => { const s = String(v ?? '').trim(); if (s.length > max) throw bad(`too long (max ${max})`); return s; };
const oneOf = (list) => (v) => { const s = String(v ?? ''); if (!list.includes(s)) throw bad(`must be one of ${list.join(', ')}`); return s; };
const int = (lo, hi) => (v) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw bad(`must be an integer ${lo}–${hi}`); return n; };
const num = () => (v) => { const n = Number(v); if (!Number.isFinite(n)) throw bad('must be a number'); return n; };
const bool = () => (v) => v === true || v === 'true' || v === 1;
const dateOrNull = () => (v) => { if (v === null || v === '' || v === undefined) return null; const d = new Date(v); if (Number.isNaN(d.getTime())) throw bad('must be a date'); return d.toISOString(); };
const dayOrNull = () => (v) => { if (v === null || v === '' || v === undefined) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw bad('must be YYYY-MM-DD'); return String(v); };
const jsonArr = () => (v) => (Array.isArray(v) ? v : []);
const jsonObjOrNull = () => (v) => (v && typeof v === 'object' ? v : null);
const room = () => (v) => { const s = String(v ?? ''); if (!ROOM_BY_ID[s]) throw bad(`unknown room "${s}"`); return s; };
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
    defaults: { priority: 2, state: 'open', holder: 'Leo', actor: 'human', venture: '', blocked_on: '', due: null, note: '', source: 'floor', brain_n: null, done_at: null },
    fields: { room: room(), text: str(500), priority: int(0, 3), state: oneOf(ORDER_STATES), holder: str(60), actor: oneOf(['human', 'agent']), venture: ventureOrEmpty(), blocked_on: str(300), due: dayOrNull(), note: str(2000), source: oneOf(['floor', 'brain', 'counsel', 'council']), brain_n: (v) => (v === null || v === undefined || v === '' ? null : int(0, 100000)(v)), done_at: dateOrNull() },
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
};
export const TABLE_IDS = Object.keys(TABLES);

function spec(table) { const t = TABLES[table]; if (!t) throw new DatabaseError(`no such table "${table}"`, { status: 404 }); return t; }

/** Validate a patch against the registry: unknown columns are refused, known ones are coerced. */
export function clean(table, input, { insert = false } = {}) {
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
    const patch = clean(table, input);
    delete patch[t.key];
    if (!Object.keys(patch).length) throw bad('nothing to change');
    const cur = await db.get(table, { select: '*', [t.key]: `eq.${id}` }, { single: true });
    if (!cur) throw new DatabaseError(`no ${table} ${id}`, { status: 404 });
    if (table === 'orders' && patch.state && patch.state !== cur.state) patch.done_at = ['done', 'killed'].includes(patch.state) ? now.toISOString() : null;
    if (table === 'list_items' && patch.done !== undefined && patch.done !== cur.done) patch.done_at = patch.done ? now.toISOString() : null;
    if (table === 'decisions' && patch.outcome !== undefined && patch.outcome !== cur.outcome) patch.reviewed_at = patch.outcome ? now.toISOString() : null;
    const [saved] = await db.patch(table, { [t.key]: `eq.${id}` }, patch);
    const change = table === 'orders' && patch.state ? `${cur.state} → ${patch.state}` : table === 'list_items' && patch.done !== undefined ? (patch.done ? 'done' : 'reopened') : table === 'decisions' && patch.outcome ? 'outcome recorded' : Object.keys(patch).join(', ');
    await events.add(db, { kind: `${t.event}.changed`, actor, subject_type: t.event, subject_id: String(id), summary: `${summarise(table, saved)} — ${change}`, data: { fields: Object.keys(patch) } });
    return saved;
  },
  async remove(db, table, id, { actor = 'leo' } = {}) {
    const t = spec(table);
    if (table === 'decisions' || table === 'orders') throw bad(`${table} are never deleted — set state to killed`);
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
    default: return table;
  }
}
