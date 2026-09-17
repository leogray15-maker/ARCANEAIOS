/**
 * Sign-in for the one operator: a Supabase magic link, no SDK.
 *
 * `signIn(email)` asks GoTrue for a one-time link. Clicking it lands back
 * on the site with the session in the URL fragment; `acceptHash()` takes
 * it, stores it, and clears the fragment so the hash router never sees
 * it. Tokens refresh themselves before they expire. The session's access
 * token is what the cloud rung sends, so row-level security applies.
 */
import { SUPABASE_URL as URL, SUPABASE_KEY as KEY } from './cloud-config.js';

const LS = 'arcane.session';
const listeners = new Set();
let session = load();

function load() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } }
function store(s) { session = s; try { s ? localStorage.setItem(LS, JSON.stringify(s)) : localStorage.removeItem(LS); } catch {} for (const fn of listeners) fn(s); }

export const auth = {
  get enabled() { return !!(URL && KEY); },
  get session() { return session; },
  get email() { return session?.email || ''; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Request a magic link to `email`. The link returns to this site. */
  async signIn(email) {
    if (!this.enabled) throw new Error('Supabase is not configured in this build');
    const redirect = `${location.origin}${location.pathname}`;
    const r = await fetch(`${URL}/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}`, {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, create_user: true }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.msg || j.error_description || j.message || `${r.status}`); }
    return true;
  },

  /** If the URL fragment carries a session (back from the magic link), take it. Returns true when it did. */
  acceptHash() {
    const h = location.hash;
    if (!/access_token=/.test(h)) return false;
    const p = new URLSearchParams(h.replace(/^#/, ''));
    const access = p.get('access_token'), refresh = p.get('refresh_token');
    if (!access) return false;
    const expiresIn = Number(p.get('expires_in') || 3600);
    store({ access, refresh, expires: Date.now() + expiresIn * 1000, email: emailOf(access) });
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  },

  /** A valid access token, refreshing first if it is about to expire. */
  async token() {
    if (!session) return null;
    if (Date.now() < session.expires - 60_000) return session.access;
    try {
      const r = await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh }) });
      if (!r.ok) { store(null); return null; }
      const j = await r.json();
      store({ access: j.access_token, refresh: j.refresh_token, expires: Date.now() + (j.expires_in || 3600) * 1000, email: j.user?.email || session.email });
      return session.access;
    } catch { return null; }
  },

  async signOut() {
    const t = session?.access; store(null);
    if (t) fetch(`${URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${t}` } }).catch(() => {});
  },
};

/** The email inside a JWT, without verifying it — display only; the server verifies. */
function emailOf(jwt) { try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || ''; } catch { return ''; } }
