/**
 * The API, from the browser.
 *
 * Every call carries the operator key and this device's sync code, waits
 * as long as HERALD needs, and turns a failure into an Error with the
 * server's sentence and status on it — so a view can show exactly what
 * went wrong and what to do. Nothing here retries silently.
 */
import { sync } from './sync.js';
import { operator } from './operator.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = '', hint = '', body = null } = {}) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.hint = hint; this.body = body; }
  get needsKey() { return this.status === 401 || this.status === 403; }
  get notOpen() { return this.status === 503 && /ARCANE_OPERATOR_KEY/.test(this.message); }
}

async function call(method, path, { params = {}, body, timeout = 30_000 } = {}) {
  const url = new URL(path, location.origin);
  url.searchParams.set('code', sync.code);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  let r;
  try {
    r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(operator.key ? { Authorization: `Bearer ${operator.key}` } : {}) }, body: body === undefined ? undefined : JSON.stringify({ code: sync.code, ...body }), signal: ctl.signal });
  } catch (e) {
    clearTimeout(t);
    throw new ApiError(e.name === 'AbortError' ? `no answer after ${Math.round(timeout / 1000)} s — the server may still be working; reload in a moment` : `cannot reach the API (${e.message}) — is the dev API running? (npm run dev)`, { status: 0 });
  }
  clearTimeout(t);
  const text = await r.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new ApiError(j?.error || (r.status === 404 ? 'no such route — the API is not deployed here' : `${r.status} ${r.statusText}`), { status: r.status, code: j?.code || '', hint: j?.hint || '', body: j });
  return j;
}

export const api = {
  get: (path, params, opts) => call('GET', path, { params, ...opts }),
  post: (path, body, opts) => call('POST', path, { body, ...opts }),
  patch: (path, body, opts) => call('PATCH', path, { body, ...opts }),

  modules: {
    search: (q) => api.get('/api/modules', q),
    subjects: () => api.get('/api/modules', { facet: 'subjects' }),
    get: (id) => api.get('/api/modules', { id }),
  },
  herald: {
    /** One module, up to five formats. Claude takes a minute or two; wait for it. */
    generate: (body) => api.post('/api/herald', body, { timeout: 300_000 }),
  },
  drafts: {
    list: (q) => api.get('/api/drafts', q),
    get: (id) => api.get('/api/drafts', { id }),
    move: (id, status, extra = {}) => api.patch('/api/drafts', { id, status, ...extra }),
    edit: (id, patch) => api.patch('/api/drafts', { id, ...patch }),
  },
  runs: {
    list: (q) => api.get('/api/runs', q),
    events: (q) => api.get('/api/runs', { events: 1, ...q }),
    schema: () => api.get('/api/runs', { schema: 1 }),
  },
  /** The floor's operating state: orders, list items, decisions, counsel, venture focus, goal progress, days. */
  state: {
    all: (tables) => api.get('/api/state', tables ? { tables: tables.join(',') } : {}),
    /** The time of the last change anywhere — one row, so it can be asked often. */
    stamp: () => api.get('/api/state', { stamp: 1 }, { timeout: 10_000 }),
    insert: (table, row) => api.post('/api/state', { table, row }),
    update: (table, id, patch) => api.patch('/api/state', { table, id, patch }),
    remove: (table, id) => call('DELETE', '/api/state', { body: { table, id } }),
  },
  bridge: () => api.get('/api/bridge'),
  /** The machine's own state: keys held, database, migrations, imports, the last run — and the readiness the bar reads. */
  health: () => api.get('/api/health'),
  /** A reader — TALLY, MERIDIAN or VECTOR — on the agent contract, all three behind one function (the Hobby plan's 12-function ceiling). `dry` returns what it read without the model. */
  agent: (id, { question = '', dry = false } = {}) => api.post('/api/agent', { agent: id, question, dry }, { timeout: 300_000 }),
  /** CIPHER, the only call that reads outside the building. It takes a while: it is searching. */
  intel: (question = '', context = {}) => api.post('/api/intel', { question, context }, { timeout: 300_000 }),
};
