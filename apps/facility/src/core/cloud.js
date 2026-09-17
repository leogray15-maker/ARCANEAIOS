/**
 * The cloud rung: Supabase, through its REST API, no SDK.
 *
 * One table, `arcane_state`, one row per signed-in operator per document
 * (see supabase/migrations/0001_arcane_state.sql). Requests carry the anon
 * key as `apikey` and the operator's session token as the bearer, so
 * row-level security decides — without a session there is nothing to
 * read or write, and the store stays on localStorage and says so.
 */
import { SUPABASE_URL as URL, SUPABASE_KEY as KEY } from './cloud-config.js';
import { auth } from './auth.js';

const TABLE = 'arcane_state';

export const cloud = {
  enabled: !!(URL && KEY),
  reason: !KEY ? 'no Supabase key at build' : '',
  lastError: '',

  /** Ready to sync: configured and signed in. */
  get ready() { return this.enabled && !!auth.session; },

  async headers() {
    const t = await auth.token();
    return { apikey: KEY, Authorization: `Bearer ${t || KEY}` };
  },

  async load(id = 'state') {
    if (!this.ready) return null;
    try {
      const r = await fetch(`${URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=body,updated`, { headers: await this.headers() });
      if (!r.ok) { this.lastError = `${r.status} ${await reason(r)}`; return null; }
      const rows = await r.json(); this.lastError = '';
      return rows[0] ? { body: rows[0].body, updated: rows[0].updated } : null;
    } catch (e) { this.lastError = e.message; return null; }
  },

  /** Only the timestamp — cheap enough to poll. */
  async stamp(id = 'state') {
    if (!this.ready) return null;
    try {
      const r = await fetch(`${URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=updated`, { headers: await this.headers() });
      if (!r.ok) return null;
      const rows = await r.json(); return rows[0]?.updated || null;
    } catch { return null; }
  },

  async save(id, body) {
    if (!this.ready) return false;
    try {
      const r = await fetch(`${URL}/rest/v1/${TABLE}?on_conflict=owner,id`, {
        method: 'POST',
        headers: { ...(await this.headers()), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id, body }),
      });
      if (!r.ok) { this.lastError = `${r.status} ${await reason(r)}`; return false; }
      this.lastError = ''; return true;
    } catch (e) { this.lastError = e.message; return false; }
  },
};

async function reason(r) { try { const j = await r.json(); return j.message || j.hint || j.msg || r.statusText; } catch { return r.statusText; } }
