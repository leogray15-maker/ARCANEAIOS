/**
 * The floor's operating state.
 *
 *   GET    /api/state?tables=orders,list_items,…       → { orders: [...], list_items: [...], … }   (all tables when omitted)
 *   POST   /api/state { code, table, row }              → { row }        insert (or set, for venture_focus / goal_progress / days)
 *   PATCH  /api/state { code, table, id, patch }        → { row }        update by key
 *   DELETE /api/state { code, table, id }               → { row }        remove (list items and counsel only)
 *
 * One gateway, one registry (packages/database/src/state.js): every
 * column is validated there, every change is a system event. The rooms'
 * store talks to this; nothing in the browser touches a table directly.
 */
import { json, guard, db } from './_lib.js';
import { state, TABLE_IDS } from '../packages/database/src/state.js';
import { events } from '../packages/database/src/content.js';

export default guard(['GET', 'POST', 'PATCH', 'DELETE'], async (req, res, auth) => {
  // GET /api/state?stamp=1 → { stamp } — the time of the last system event.
  // Every write leaves one, so this one small row is enough for a device to
  // know whether another device has changed anything since it last looked.
  // No table data crosses; the device then reloads through the same gate.
  if (req.method === 'GET' && req.query?.stamp) {
    const [last] = await events.list(db(), { limit: 1 });
    return json(res, 200, { stamp: last?.at || '', id: last?.id ?? null });
  }
  if (req.method === 'GET') {
    const asked = String(req.query?.tables || '').split(',').map((s) => s.trim()).filter(Boolean);
    const tables = asked.length ? asked.filter((t) => TABLE_IDS.includes(t)) : TABLE_IDS;
    if (asked.length && !tables.length) return json(res, 400, { error: `tables must be from ${TABLE_IDS.join(', ')}` });
    return json(res, 200, await state.all(db(), tables));
  }
  const b = req.body || {};
  const table = String(b.table || '');
  if (!TABLE_IDS.includes(table)) return json(res, 400, { error: `table must be one of ${TABLE_IDS.join(', ')}` });
  const opts = { actor: 'leo' };
  if (req.method === 'POST') {
    const row = { ...(b.row || {}) };
    if (table === 'counsel_turns' || table === 'decisions') row.device = auth.device;
    return json(res, 200, { row: await state.insert(db(), table, row, opts) });
  }
  const id = String(b.id || '').trim();
  if (!id) return json(res, 400, { error: 'id is required' });
  if (req.method === 'PATCH') return json(res, 200, { row: await state.update(db(), table, id, b.patch || {}, opts) });
  return json(res, 200, { row: await state.remove(db(), table, id, opts) });
});
