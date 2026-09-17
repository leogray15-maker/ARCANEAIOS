/**
 * The cloud rung: Supabase, through its REST API, no SDK.
 *
 * One table, one row per operator:
 *
 *   create table arcane_state (
 *     id text primary key,
 *     body jsonb not null,
 *     updated timestamptz not null default now()
 *   );
 *   alter table arcane_state enable row level security;
 *   -- Until Supabase Auth is wired (day 3 of the plan), keep the table
 *   -- closed: no anon policy means the facility falls back to localStorage
 *   -- and says so in the Bridge dashboard. Open it only behind auth.
 *
 * Only the anon key ever reaches the browser. The build injects the URL
 * and anon key from SUPABASE_URL / SUPABASE_ANON_KEY (or their
 * NEXT_PUBLIC_ / VITE_ spellings); a service-role key is never read.
 */

/* global __SUPABASE_URL__, __SUPABASE_ANON__ */
const URL = typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '';
const KEY = typeof __SUPABASE_ANON__ !== 'undefined' ? __SUPABASE_ANON__ : '';
const TABLE = 'arcane_state';

export const cloud = {
  enabled: !!(URL && KEY),
  reason: !URL ? 'no SUPABASE_URL at build' : !KEY ? 'no SUPABASE_ANON_KEY at build' : '',
  lastError: '',

  async load(id) {
    if (!this.enabled) return null;
    try {
      const r = await fetch(`${URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=body,updated`, { headers: headers() });
      if (!r.ok) { this.lastError = `${r.status} ${await reason(r)}`; return null; }
      const rows = await r.json();
      this.lastError = '';
      return rows[0] ? { body: rows[0].body, updated: rows[0].updated } : null;
    } catch (e) { this.lastError = e.message; return null; }
  },

  async save(id, body) {
    if (!this.enabled) return false;
    try {
      const r = await fetch(`${URL}/rest/v1/${TABLE}`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id, body, updated: new Date().toISOString() }),
      });
      if (!r.ok) { this.lastError = `${r.status} ${await reason(r)}`; return false; }
      this.lastError = '';
      return true;
    } catch (e) { this.lastError = e.message; return false; }
  },
};

const headers = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}` });
async function reason(r) { try { const j = await r.json(); return j.message || j.hint || r.statusText; } catch { return r.statusText; } }
