/**
 * The database, from the server side.
 *
 * Supabase Postgres through PostgREST, with the service-role key, no SDK.
 * Three verbs — get, post, patch — and PostgREST's own filter language in
 * plain objects (`{ status: 'in.(draft,review)', order: 'created_at.desc' }`)
 * so what a helper sends is what the log shows. Errors carry the PostgREST
 * code and are translated once, here, into a sentence the operator can act
 * on: a missing table says which migration to run.
 *
 * This module is only ever imported by Vercel functions and by tools on the
 * operator's machine. It reads the service key from the environment and is
 * never bundled into the facility; CI checks the bundle for it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const DEFAULT_URL = 'https://pjdzdfmnfuneumzqoijn.supabase.co';

/** Load `.env` at the repo root into process.env without overriding what is already set. Tools call this; Vercel has its own environment. */
export function loadEnv(file = path.join(REPO, '.env')) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}

/** Where the database is and how to reach it. The service key is optional here so a caller can say clearly that it is missing. */
export function config(env = process.env) {
  return {
    url: env.SUPABASE_URL || env.NEXT_PUBLIC_storage_SUPABASE_URL || env.storage_SUPABASE_URL || DEFAULT_URL,
    key: env.SUPABASE_SERVICE_ROLE_KEY || env.storage_SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

export class DatabaseError extends Error {
  constructor(message, { status = 500, code = '', hint = '', table = '' } = {}) {
    super(message);
    this.name = 'DatabaseError';
    this.status = status; this.code = code; this.hint = hint; this.table = table;
  }
}

/** Which migration a table came from, so a missing one names its file. */
const MIGRATION_OF = {
  arcane_state: '0001_arcane_state.sql', arcane_sync: '0002_sync_codes.sql',
  knowledge_sources: '0003_content_machine.sql', archive_modules: '0003_content_machine.sql', archive_subjects: '0003_content_machine.sql',
  content_drafts: '0003_content_machine.sql', content_revisions: '0003_content_machine.sql', agent_runs: '0003_content_machine.sql', system_events: '0003_content_machine.sql',
  orders: '0004_operating_state.sql', list_items: '0004_operating_state.sql', decisions: '0004_operating_state.sql', counsel_turns: '0004_operating_state.sql',
  venture_focus: '0004_operating_state.sql', goal_progress: '0004_operating_state.sql', days: '0004_operating_state.sql',
  settings: '0005_lab.sql', products: '0005_lab.sql', stock_lots: '0005_lab.sql', dispatch: '0005_lab.sql',
  ledger_months: '0006_vault.sql', fixed_costs: '0006_vault.sql', cash_snapshots: '0006_vault.sql', pots: '0006_vault.sql',
  protocol_items: '0007_sanctum.sql', protocol_ticks: '0007_sanctum.sql', entries: '0007_sanctum.sql',
  trades: '0008_trading.sql', setups: '0008_trading.sql', checkins: '0008_trading.sql',
};

function translate(status, body, table) {
  const code = body?.code || '';
  const msg = body?.message || body?.hint || `${status}`;
  if (code === 'PGRST205' || code === '42P01' || /schema cache|does not exist/i.test(msg)) {
    return new DatabaseError(`the table ${table} does not exist yet — run supabase/migrations/${MIGRATION_OF[table] || '<the migration that creates it>'} in the Supabase SQL editor`, { status: 503, code, table, hint: 'migration not applied' });
  }
  if (status === 401 || code === 'PGRST301') return new DatabaseError('the database rejected the service key — check SUPABASE_SERVICE_ROLE_KEY', { status: 503, code, table });
  if (code === '23505') return new DatabaseError(`duplicate key in ${table}: ${body?.details || msg}`, { status: 409, code, table });
  if (code === '23503') return new DatabaseError(`${table}: ${body?.details || msg}`, { status: 422, code, table });
  if (code === '23514') return new DatabaseError(`${table}: a value is outside what the schema allows (${body?.details || msg})`, { status: 422, code, table });
  return new DatabaseError(`${table}: ${msg}`, { status: status >= 500 ? 502 : status, code, table, hint: body?.hint || '' });
}

function query(params) {
  if (!params) return '';
  if (typeof params === 'string') return params ? `?${params}` : '';
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.append(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

/**
 * A client bound to one URL and key. `fetch` is injectable for tests.
 *
 *   db.get('content_drafts', { status: 'eq.draft', order: 'created_at.desc', limit: 50 })
 *   db.get('content_drafts', { id: 'eq.HER-1' }, { single: true })          → row or null
 *   db.get('content_drafts', { select: 'id' }, { count: true })              → { rows, count }
 *   db.post('content_drafts', rows, { upsert: 'id' })                        → rows back
 *   db.patch('content_drafts', { id: 'eq.HER-1' }, { status: 'approved' })  → rows back
 */
export function createDb({ url, key, fetch: f = globalThis.fetch } = config()) {
  if (!key) throw new DatabaseError('no SUPABASE_SERVICE_ROLE_KEY — the database is reachable only with the service key, server-side', { status: 503, hint: 'set it in .env (tools) or the Vercel project (functions); the Vercel integration calls it storage_SUPABASE_SERVICE_ROLE_KEY' });
  const base = `${url.replace(/\/$/, '')}/rest/v1/`;
  const headers = (extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra });

  async function call(method, table, params, body, prefer, { single = false, count = false } = {}) {
    const h = headers();
    const p = [];
    if (prefer) p.push(prefer);
    if (count) p.push('count=exact');
    if (p.length) h.Prefer = p.join(',');
    if (single) h.Accept = 'application/vnd.pgrst.object+json';
    let r;
    try { r = await f(base + table + query(params), { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch (e) { throw new DatabaseError(`cannot reach the database: ${e.message}`, { status: 503, table }); }
    const text = await r.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
    if (!r.ok) {
      // A single-row request that matched nothing is "no row", not an error.
      if (single && (r.status === 406 || json?.code === 'PGRST116')) return null;
      throw translate(r.status, json, table);
    }
    if (count) { const m = /\/(\d+|\*)$/.exec(r.headers.get('content-range') || ''); return { rows: json || [], count: m && m[1] !== '*' ? Number(m[1]) : (json || []).length }; }
    return json;
  }

  return {
    url, kind: 'postgrest',
    get: (table, params, opts) => call('GET', table, params, undefined, '', opts),
    post: (table, body, { upsert = '', returning = true } = {}) => call('POST', table, upsert ? { on_conflict: upsert } : undefined, body, [upsert ? 'resolution=merge-duplicates' : '', returning ? 'return=representation' : 'return=minimal'].filter(Boolean).join(',')),
    patch: (table, params, body, { returning = true } = {}) => call('PATCH', table, params, body, returning ? 'return=representation' : 'return=minimal'),
    delete: (table, params) => call('DELETE', table, params, undefined, 'return=minimal'),
  };
}

/** The tables the Content Machine expects, checked one by one; the result says what is missing and which migration supplies it. */
export async function checkSchema(db) {
  const out = [];
  for (const table of Object.keys(MIGRATION_OF)) {
    const key = { archive_subjects: 'subject', venture_focus: 'venture', goal_progress: 'goal_id', days: 'day', settings: 'key', cash_snapshots: 'day' }[table] || 'id';
    try { await db.get(table, { select: key, limit: 1 }); out.push({ table, ok: true, migration: MIGRATION_OF[table] }); }
    catch (e) { out.push({ table, ok: false, migration: MIGRATION_OF[table], error: e.message }); }
  }
  return out;
}

export { MIGRATION_OF };
