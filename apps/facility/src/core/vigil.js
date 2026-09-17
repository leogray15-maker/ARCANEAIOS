/**
 * VIGIL — what changed while nobody was looking.
 *
 * Pure: a list of signals computed from the store's state and the brain
 * export. The Observatory shows them, the bar counts them, and
 * tools/vault-sync.mjs writes the same list into 03-Memory/Signals.md.
 * Every signal names the room it belongs to and what would clear it.
 */
import { stats, derive } from './journal.js';

const DAY = 86400000;

export function signals(state, brain, now = Date.now()) {
  const out = [];
  const add = (severity, room, text, clear) => out.push({ severity, room, text, clear });

  // The brief.
  if (brain?.brief?.date) { const age = (now - new Date(brain.brief.date).getTime()) / DAY; if (age > 2) add('warn', 'bridge', `The brief is ${Math.floor(age)} days old`, 'npm run brief, or a HERALD run'); }
  else add('warn', 'bridge', 'No brief in the export', 'write 03-Memory/Brief.md');

  // Stock and COA.
  const live = (state.stock || []).filter((r) => r.vials > 0);
  for (const r of live.filter((r) => r.vials < 12)) add('warn', 'apothecary', `Low stock: ${r.code} ${r.size} — ${r.vials} vials`, 'restock or retire the line');
  const noCoa = live.filter((r) => r.coa !== 'published');
  if (noCoa.length) add('breach', 'apothecary', `${noCoa.length} live line${noCoa.length === 1 ? '' : 's'} without a published COA: ${noCoa.map((r) => r.code).join(', ')}`, 'publish the COA or take the line off sale');

  // Content.
  const drafts = (brain?.drafts || []).map((d) => ({ ...d, status: state.drafts?.[d.id]?.status || d.status }));
  const waiting = drafts.filter((d) => d.status === 'draft').length;
  if (!drafts.length) add('warn', 'beacon', 'HERALD has produced nothing yet', 'npm run herald:auto');
  else if (waiting === 0) add('info', 'beacon', 'The draft queue is empty', 'the next HERALD run refills it');
  else if (waiting > 15) add('info', 'beacon', `${waiting} drafts waiting for review`, 'review or kill a batch');
  const postedWeek = drafts.filter((d) => d.status === 'posted' && (state.drafts?.[d.id]?.ts || 0) > now - 7 * DAY).length;
  if (drafts.length && !postedWeek && !drafts.some((d) => d.status === 'posted')) add('warn', 'beacon', 'Nothing has been marked posted', 'post one and mark it');

  // Orders.
  for (const [room, list] of Object.entries(state.orders || {})) for (const o of list) {
    if (o.done || o.p !== 0) continue;
    const age = o.ts ? (now - o.ts) / DAY : null;
    if (age !== null && age > 2) add('warn', room, `P0 open for ${Math.floor(age)} days: ${o.t}`, 'do it, downgrade it, or kill it');
  }

  // Money.
  const split = Object.values(state.budget?.split || {}).reduce((n, p) => n + (Number(p) || 0), 0);
  if (split && split !== 100) add('warn', 'vault', `The split adds to ${split}%, not 100`, 'fix the pots in THE VAULT');

  // The journal.
  const trades = (state.journal?.trades || []).filter((t) => derive(t).r !== null).sort((a, b) => (a.opened || '').localeCompare(b.opened || ''));
  const last10 = trades.slice(-10);
  if (last10.length >= 3) {
    let peak = 0, cum = 0, dd = 0; for (const t of last10) { cum += derive(t).r; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
    if (dd >= 3) add('breach', 'trading', `Drawdown of ${dd.toFixed(1)}R across the last ${last10.length} trades`, 'size down or stop until the weekly review');
    const last3 = trades.slice(-3); if (last3.length === 3 && last3.every((t) => derive(t).outcome === 'Loss')) add('warn', 'trading', 'Three losses in a row', 'stop for the session and write the review');
    const breaks = trades.slice(-5).reduce((n, t) => n + (t.ruleBreaks?.length || 0), 0); if (breaks >= 2) add('warn', 'trading', `${breaks} rule breaks in the last five trades`, 'read them; the pattern is the signal');
    const s = stats(last10); if (s.planRate < 0.6) add('warn', 'trading', `Plan followed on ${Math.round(s.planRate * 100)}% of recent trades`, 'no trade without the Before block');
  }
  const open = (state.journal?.trades || []).filter((t) => derive(t).outcome === 'Open');
  for (const t of open) { const age = (now - new Date(t.opened).getTime()) / DAY; if (age > 1) add('info', 'trading', `${t.id} has been open ${Math.floor(age)} day${Math.floor(age) === 1 ? '' : 's'}`, 'close it in the journal'); }

  // The operator.
  const today = new Date(now).toISOString().slice(0, 10); const hour = new Date(now).getHours();
  const done = Object.values(state.protocol?.[today] || {}).filter(Boolean).length;
  if (hour >= 20 && done === 0) add('info', 'sanctum', 'Nothing ticked on the protocol today', 'tick what was done in SANCTUM');
  return out;
}
