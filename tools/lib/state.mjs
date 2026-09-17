/**
 * The floor's state, as the tools see it.
 *
 * Every device that opens the site keeps its own row in Supabase, keyed by
 * its sync code. Server-side tools read all of them with the service-role
 * key (from .env, never bundled) and fold them into one state: the newest
 * row is the base, and anything keyed by id — orders, trades, decisions,
 * list items, draft marks — is unioned so nothing decided on one device
 * is lost because another device saved later.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './brain.mjs';

export function loadEnv() {
  try { for (const line of fs.readFileSync(path.join(REPO, '.env'), 'utf8').split('\n')) { const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch {}
}

export function supabase() {
  loadEnv();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_storage_SUPABASE_URL || process.env.storage_SUPABASE_URL || 'https://pjdzdfmnfuneumzqoijn.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.storage_SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, key };
}

/** All rows, or null when there is no service key to read them with. */
export async function fetchRows() {
  const { url, key } = supabase();
  if (!key) return null;
  const r = await fetch(`${url}/rest/v1/arcane_sync?select=id,body,updated`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

const newer = (a, b) => ((b?.updated || b?.ts || 0) > (a?.updated || a?.ts || 0) ? b : a);
const unionById = (lists) => { const m = new Map(); for (const l of lists) for (const x of l || []) m.set(x.id, m.has(x.id) ? newer(m.get(x.id), x) : x); return [...m.values()]; };

export function mergeRows(rows) {
  if (!rows?.length) return null;
  const sorted = [...rows].sort((a, b) => new Date(b.updated) - new Date(a.updated));
  const bodies = sorted.map((r) => r.body).filter((b) => b && b.v === 3);
  if (!bodies.length) return null;
  const s = structuredClone(bodies[0]);
  s.orders = {}; for (const room of new Set(bodies.flatMap((b) => Object.keys(b.orders || {})))) s.orders[room] = unionById(bodies.map((b) => b.orders?.[room])).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  s.drafts = {}; for (const b of bodies) for (const [id, m] of Object.entries(b.drafts || {})) if (!s.drafts[id] || (m.ts || 0) > (s.drafts[id].ts || 0)) s.drafts[id] = m;
  s.lists = {}; for (const key of new Set(bodies.flatMap((b) => Object.keys(b.lists || {})))) s.lists[key] = unionById(bodies.map((b) => b.lists?.[key])).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  s.protocol = {}; for (const b of bodies.slice().reverse()) for (const [day, items] of Object.entries(b.protocol || {})) s.protocol[day] = { ...(s.protocol[day] || {}), ...items };
  s.decisions = unionById(bodies.map((b) => b.decisions)).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  s.journal = { trades: unionById(bodies.map((b) => b.journal?.trades)).sort((a, b) => (b.opened || '').localeCompare(a.opened || '')), setups: unionById(bodies.map((b) => b.journal?.setups)), checkins: unionById(bodies.map((b) => b.journal?.checkins)).sort((a, b) => (b.ts || 0) - (a.ts || 0)) };
  s.counsel = bodies.flatMap((b) => b.counsel || []).filter((c, i, arr) => arr.findIndex((d) => d.ts === c.ts && d.who === c.who) === i).sort((a, b) => a.ts - b.ts).slice(-40);
  s.log = bodies.flatMap((b) => b.log || []).filter((c, i, arr) => arr.findIndex((d) => d.ts === c.ts && d.text === c.text) === i).sort((a, b) => a.ts - b.ts).slice(-200);
  s.devices = bodies.length;
  return s;
}

/** The merged floor state, or null with a reason when it cannot be read. */
export async function floorState() {
  const rows = await fetchRows();
  if (rows === null) return { state: null, reason: 'no SUPABASE_SERVICE_ROLE_KEY in .env' };
  const state = mergeRows(rows);
  return { state, reason: state ? '' : 'no rows yet — open the site once' };
}

/* ---------- the same arithmetic the store does, for the tools ---------- */

export const money = (n) => (n === null || n === undefined || !isFinite(n) ? '—' : `£${Math.round(n).toLocaleString('en-GB')}`);
export function ventureRevenue(state, v) { const l = state?.ledger?.[v.id] || { mrr: 0, units: 0 }; return v.price ? (l.units || 0) * v.price : l.mrr || 0; }
export function monthlyRevenue(state, ventures) { return ventures.reduce((n, v) => n + ventureRevenue(state, v), 0); }
export function monthlyFixed(state) { return Object.values(state?.budget?.fixed || {}).reduce((n, a) => n + (Number(a) || 0), 0); }
export function runwayMonths(state, ventures) { const burn = monthlyFixed(state) - monthlyRevenue(state, ventures); const cash = Number(state?.budget?.cash) || 0; return burn <= 0 ? Infinity : cash / burn; }
