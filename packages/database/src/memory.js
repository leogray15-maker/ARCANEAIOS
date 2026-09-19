/**
 * The database's in-memory twin, for tests and for the dev API when there
 * is no service key. Same three verbs, the same PostgREST filter grammar
 * the real client sends — eq, neq, in, is, like, ilike, gt/gte/lt/lte,
 * wfts, or=(...), select, order, limit, offset — over plain arrays. It
 * exists so a handler can be tested end to end without a network, and it
 * is never what production runs on: `kind` says which one you have.
 */
const VIEWS = {
  archive_subjects: (tables) => {
    const by = {};
    for (const m of tables.archive_modules || []) {
      const r = by[m.subject] || (by[m.subject] = { subject: m.subject, lane: m.lane, gate: m.gate, modules: 0, words: 0, sensitive: false });
      if (m.kind === 'module') { r.modules++; r.words += m.words || 0; }
      r.sensitive = r.sensitive || !!m.sensitive;
    }
    return Object.values(by);
  },
};
const SERIAL = new Set(['content_revisions', 'system_events']);
const TOUCH = new Set(['archive_modules', 'content_drafts', 'knowledge_sources', 'orders', 'list_items', 'decisions', 'venture_focus', 'goal_progress', 'days', 'settings', 'products', 'stock_lots', 'dispatch', 'ledger_months', 'fixed_costs', 'pots', 'protocol_items', 'protocol_ticks', 'entries', 'trades', 'setups']);

const unq = (s) => String(s).replace(/^"|"$/g, '');
const like = (v, pat, ci) => { const re = new RegExp('^' + String(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$', ci ? 'i' : ''); return re.test(String(v ?? '')); };

function test(row, col, expr) {
  const i = expr.indexOf('.');
  const op = expr.slice(0, i), arg = expr.slice(i + 1);
  const v = row[col];
  switch (op) {
    case 'eq': return String(v) === arg;
    case 'neq': return String(v) !== arg;
    case 'is': return arg === 'null' ? v === null || v === undefined : String(v) === arg;
    case 'in': return arg.slice(1, -1).split(',').map(unq).includes(String(v));
    case 'like': return like(v, arg, false);
    case 'ilike': return like(v, arg, true);
    case 'gt': return v > arg; case 'gte': return v >= arg; case 'lt': return v < arg; case 'lte': return v <= arg;
    case 'wfts': case 'plfts': case 'fts': { const hay = ['title', 'subject', 'body', 'excerpt'].map((k) => row[k] || '').join(' ').toLowerCase(); return arg.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w)); }
    default: throw new Error(`memory db: unsupported operator ${op}`);
  }
}
function orGroup(row, spec) {
  // or=(a.eq.1,b.ilike.*x*)
  const inner = spec.replace(/^\(|\)$/g, '');
  const parts = []; let depth = 0, cur = '';
  for (const ch of inner) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
  if (cur) parts.push(cur);
  return parts.some((p) => { const i = p.indexOf('.'); return test(row, p.slice(0, i), p.slice(i + 1)); });
}

export function memoryDb(seed = {}) {
  const tables = {}; let serial = 0;
  for (const [t, rows] of Object.entries(seed)) { tables[t] = rows.map((r) => ({ ...r })); if (SERIAL.has(t)) for (const r of rows) if (Number(r.id) > serial) serial = Number(r.id); }
  const all = (t) => (VIEWS[t] ? VIEWS[t](tables) : (tables[t] || (tables[t] = [])));
  const now = () => new Date().toISOString();

  function filter(t, params = {}) {
    let rows = all(t);
    for (const [k, v] of Object.entries(params)) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
      if (k === 'or') rows = rows.filter((r) => orGroup(r, v)); else rows = rows.filter((r) => test(r, k, v));
    }
    if (params.order) {
      const keys = String(params.order).split(',').map((k) => { const [col, dir] = k.trim().split('.'); return [col, dir === 'desc' ? -1 : 1]; });
      rows = [...rows].sort((a, b) => { for (const [col, dir] of keys) { if (a[col] > b[col]) return dir; if (a[col] < b[col]) return -dir; } return 0; });
    }
    const off = Number(params.offset) || 0; const lim = params.limit ? Number(params.limit) : rows.length;
    return rows.slice(off, off + lim);
  }
  const project = (rows, select) => (!select || select === '*' ? rows.map((r) => ({ ...r })) : rows.map((r) => Object.fromEntries(select.split(',').map((c) => c.trim()).filter((c) => c in r).map((c) => [c, r[c]]))));

  return {
    kind: 'memory', tables,
    async get(t, params = {}, { single = false, count = false } = {}) {
      const rows = project(filter(t, params), params.select);
      if (single) return rows[0] || null;
      if (count) { const total = filter(t, { ...params, limit: undefined, offset: undefined }).length; return { rows, count: total }; }
      return rows;
    },
    async post(t, body, { upsert = '' } = {}) {
      const list = all(t); const rows = Array.isArray(body) ? body : [body]; const out = [];
      for (const r of rows) {
        const row = { created_at: now(), ...(TOUCH.has(t) ? { updated_at: now() } : {}), ...r };
        if (SERIAL.has(t) && row.id === undefined) row.id = ++serial;
        const i = upsert ? list.findIndex((x) => x[upsert] === row[upsert]) : (row.id !== undefined ? list.findIndex((x) => x.id === row.id) : -1);
        if (i >= 0 && !upsert) throw Object.assign(new Error(`duplicate key in ${t}: ${row.id}`), { status: 409 });
        if (i >= 0) list[i] = { ...list[i], ...row, updated_at: now() }; else list.push(row);
        out.push({ ...(i >= 0 ? list[i] : row) });
      }
      return out;
    },
    async patch(t, params, body) {
      const hit = filter(t, params); const out = [];
      for (const r of hit) { Object.assign(r, body, TOUCH.has(t) ? { updated_at: now() } : {}); out.push({ ...r }); }
      return out;
    },
    async delete(t, params) { const hit = new Set(filter(t, params)); tables[t] = all(t).filter((r) => !hit.has(r)); return null; },
  };
}
