/**
 * The cloud rung: Supabase, through its REST API, no SDK and no sign-in.
 *
 * One table, `arcane_sync`, one row per sync code (see
 * supabase/migrations/0002_sync_codes.sql). Requests carry the anon key;
 * the row id is this device's sync code, which is unguessable, so the
 * state is as private as the code. Without a key at build time there is
 * no cloud rung and the store stays on localStorage and says so.
 */
import { SUPABASE_URL as URL, SUPABASE_KEY as KEY } from './cloud-config.js';
import { sync } from './sync.js';

const TABLE = 'arcane_sync';

export const cloud = {
  enabled: !!(URL && KEY),
  reason: !KEY ? 'no Supabase key at build' : '',
  lastError: '',
  get ready() { return this.enabled; },
  get rowId() { return sync.code; },
  headers() { return { apikey: KEY, Authorization: `Bearer ${KEY}` }; },

  async load() {
    if (!this.ready) return null;
    try {
      const r = await fetch(`${URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(this.rowId)}&select=body,updated`, { headers: this.headers() });
      if (!r.ok) { this.lastError = `${r.status} ${await reason(r)}`; return null; }
      const rows = await r.json(); this.lastError = '';
      return rows[0] ? { body: rows[0].body, updated: rows[0].updated } : null;
    } catch (e) { this.lastError = e.message; return null; }
  },
  async stamp() {
    if (!this.ready) return null;
    try { const r = await fetch(`${URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(this.rowId)}&select=updated`, { headers: this.headers() }); if (!r.ok) return null; const rows = await r.json(); return rows[0]?.updated || null; } catch { return null; }
  },
  async save(body) {
    if (!this.ready) return false;
    try {
      const r = await fetch(`${URL}/rest/v1/${TABLE}?on_conflict=id`, { method: 'POST', headers: { ...this.headers(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: this.rowId, body }) });
      if (!r.ok) { this.lastError = `${r.status} ${await reason(r)}`; return false; }
      this.lastError = ''; return true;
    } catch (e) { this.lastError = e.message; return false; }
  },
};

async function reason(r) { try { const j = await r.json(); return j.message || j.hint || j.msg || r.statusText; } catch { return r.statusText; } }
