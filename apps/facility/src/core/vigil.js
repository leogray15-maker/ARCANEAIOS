/**
 * VIGIL — what changed while nobody was looking.
 *
 * Pure: a list of signals computed from the state the rooms already hold.
 * The Observatory shows them, the bar counts them, the Bridge aggregate
 * carries them to the server's picture of the day, and
 * tools/vault-sync.mjs writes the same list into 03-Memory/Signals.md.
 * One implementation, four readers.
 *
 * Every signal is addressable and answerable:
 *
 *   id        stable across runs, so an order can point back at it
 *   kind      the family it belongs to (stock, money, journal …)
 *   severity  breach · warn · info
 *   room      where it belongs, and where the work would go
 *   text      what is true
 *   clear     what would make it stop being true
 *   evidence  the rows and numbers it was computed from — no bare claims
 *   since     when it started, when the data knows; null when it does not
 *   proposal  the smallest order that would answer it, or null
 *
 * A signal is never stored. It is derived, which is why it cannot go
 * stale — and why answering one means opening an order that carries its
 * id (`source: 'signal'`, `source_id: <id>`), not ticking it off.
 */
import { stats, derive } from './journal.js';
import { stockLines, settingsOf } from './lab.js';

const DAY = 86400000;
const iso = (v) => (v ? new Date(v).toISOString() : null);

export function signals(state, brain, now = Date.now()) {
  const out = [];
  /** @param {object} s {id, kind, severity, room, text, clear, evidence, since, proposal} */
  const add = (s) => out.push({ evidence: null, since: null, proposal: null, ...s });

  // The brief. `brain === null` means the caller has no vault to look at
  // (the server does not), so the question is not asked at all rather than
  // answered with a signal that is only true of the reader.
  if (brain === null) { /* not asked */ }
  else if (brain?.brief?.date) {
    const age = (now - new Date(brain.brief.date).getTime()) / DAY;
    if (age > 2) add({ id: 'brief.stale', kind: 'brief', severity: 'warn', room: 'bridge', text: `The brief is ${Math.floor(age)} days old`, clear: 'npm run brief, or a HERALD run', evidence: { date: brain.brief.date, days: Math.floor(age) }, since: iso(brain.brief.date) });
  } else add({ id: 'brief.missing', kind: 'brief', severity: 'warn', room: 'bridge', text: 'No brief in the export', clear: 'write 03-Memory/Brief.md', evidence: { date: null } });


  // Stock and COA — from THE LAB's products and lots (the old blob's `stock` still works for a state that has only that).
  const lines = state.products
    ? stockLines(state.products, state.lots, settingsOf(state.settings)).map((l) => ({ id: l.id, code: `${l.name} ${l.size}`.trim(), vials: l.vials, coa: l.coa, low: l.low }))
    : (state.stock || []).map((r) => ({ id: r.id, code: `${r.code} ${r.size}`, vials: r.vials, coa: r.coa, low: r.vials > 0 && r.vials < 12 }));
  const live = lines.filter((r) => r.vials > 0);
  for (const r of live.filter((r) => r.low)) {
    add({ id: `stock.low:${r.id}`, kind: 'stock', severity: 'warn', room: 'apothecary', text: `Low stock: ${r.code} — ${r.vials} vials`, clear: 'restock or retire the line',
      evidence: { product: r.id, vials: r.vials },
      proposal: { room: 'apothecary', text: `Reorder ${r.code} — ${r.vials} vials left`, priority: 1 } });
  }
  const noCoa = live.filter((r) => r.coa !== 'published');
  if (noCoa.length) {
    add({ id: 'coa.missing', kind: 'coa', severity: 'breach', room: 'apothecary', text: `${noCoa.length} live line${noCoa.length === 1 ? '' : 's'} without a published COA: ${noCoa.map((r) => r.code).join(', ')}`, clear: 'publish the COA or take the line off sale',
      evidence: { lines: noCoa.map((r) => ({ id: r.id, code: r.code, coa: r.coa, vials: r.vials })) },
      proposal: { room: 'apothecary', text: `Publish the COA for ${noCoa.map((r) => r.code).join(', ')} or take ${noCoa.length === 1 ? 'it' : 'them'} off sale`, priority: 0 } });
  }

  // Content. The counts come from the caller when it has them (the server
  // reads them from the drafts table); otherwise they are derived from the
  // brain export the way the floor sees it. One set of rules either way.
  const dc = state.draftCounts || (() => {
    const list = (brain?.drafts || []).map((d) => ({ ...d, status: state.drafts?.[d.id]?.status || d.status }));
    return { total: list.length, waiting: list.filter((d) => d.status === 'draft').length, posted: list.filter((d) => d.status === 'posted').length };
  })();
  if (!dc.total) add({ id: 'content.none', kind: 'content', severity: 'warn', room: 'beacon', text: 'HERALD has produced nothing yet', clear: 'npm run herald:auto', evidence: { drafts: 0 } });
  else if (dc.waiting === 0) add({ id: 'content.empty', kind: 'content', severity: 'info', room: 'beacon', text: 'The draft queue is empty', clear: 'the next HERALD run refills it', evidence: { waiting: 0, drafts: dc.total } });
  else if (dc.waiting > 15) add({ id: 'content.backlog', kind: 'content', severity: 'info', room: 'beacon', text: `${dc.waiting} drafts waiting for review`, clear: 'review or kill a batch', evidence: { waiting: dc.waiting } });
  if (dc.total && !dc.posted) {
    add({ id: 'content.unposted', kind: 'content', severity: 'warn', room: 'beacon', text: 'Nothing has been marked posted', clear: 'post one and mark it', evidence: { drafts: dc.total, posted: 0 },
      proposal: { room: 'beacon', text: 'Post one approved draft and mark it posted', priority: 1 } });
  }

  // Orders. A P0 that has sat for days is a signal about the priority, not the work.
  for (const [room, list] of Object.entries(state.orders || {})) for (const o of list) {
    if (o.done || o.proposed || o.p !== 0) continue;
    const age = o.ts ? (now - o.ts) / DAY : null;
    if (age !== null && age > 2) add({ id: `order.stale:${o.id}`, kind: 'order', severity: 'warn', room, text: `P0 open for ${Math.floor(age)} days: ${o.t}`, clear: 'do it, downgrade it, or kill it', evidence: { order: o.id, days: Math.floor(age) }, since: iso(o.ts) });
  }

  // Money — from the pots and the ledger (the old blob's `budget` for a state that has only that).
  const split = state.pots ? state.pots.reduce((n, p) => n + (Number(p.pct) || 0), 0) : Object.values(state.budget?.split || {}).reduce((n, p) => n + (Number(p) || 0), 0);
  if (split && split !== 100) {
    add({ id: 'money.split', kind: 'money', severity: 'warn', room: 'vault', text: `The split adds to ${split}%, not 100`, clear: 'fix the pots in THE VAULT', evidence: { split, pots: (state.pots || []).map((p) => ({ id: p.id, pct: Number(p.pct) || 0 })) },
      proposal: { room: 'vault', text: `Fix the split — the pots add to ${split}%`, priority: 2 } });
  }
  if (state.ledger && Array.isArray(state.ledger)) {
    const m = new Date(now); const month = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    if (m.getDate() >= 7 && !state.ledger.some((r) => r.month === month)) {
      add({ id: `money.month:${month}`, kind: 'money', severity: 'info', room: 'vault', text: `No figures typed for ${month} yet`, clear: 'type this month\'s revenue in THE VAULT', evidence: { month, rows: 0 },
        proposal: { room: 'vault', text: `Type ${month}'s revenue by venture`, priority: 2 } });
    }
    const cash = (state.cash || []).slice().sort((a, b) => String(b.day).localeCompare(String(a.day)))[0];
    if (cash && (now - new Date(cash.day).getTime()) / DAY > 14) {
      add({ id: 'money.cash', kind: 'money', severity: 'info', room: 'vault', text: `Cash was last typed on ${cash.day}`, clear: 'a fresh cash snapshot in THE VAULT', evidence: { day: cash.day, cash: Number(cash.cash_gbp) || 0, days: Math.floor((now - new Date(cash.day).getTime()) / DAY) }, since: iso(cash.day),
        proposal: { room: 'vault', text: 'Type a fresh cash snapshot', priority: 2 } });
    }
  }

  // The journal.
  const trades = (state.journal?.trades || []).filter((t) => derive(t).r !== null).sort((a, b) => (a.opened || '').localeCompare(b.opened || ''));
  const last10 = trades.slice(-10);
  if (last10.length >= 3) {
    let peak = 0, cum = 0, dd = 0; for (const t of last10) { cum += derive(t).r; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
    if (dd >= 3) add({ id: 'journal.drawdown', kind: 'journal', severity: 'breach', room: 'trading', text: `Drawdown of ${dd.toFixed(1)}R across the last ${last10.length} trades`, clear: 'size down or stop until the weekly review', evidence: { drawdown_r: Number(dd.toFixed(2)), trades: last10.length },
      proposal: { room: 'trading', text: `Stop trading until the weekly review — ${dd.toFixed(1)}R drawdown`, priority: 0 } });
    const last3 = trades.slice(-3);
    if (last3.length === 3 && last3.every((t) => derive(t).outcome === 'Loss')) add({ id: 'journal.losses', kind: 'journal', severity: 'warn', room: 'trading', text: 'Three losses in a row', clear: 'stop for the session and write the review', evidence: { trades: last3.map((t) => t.id) } });
    const breaks = trades.slice(-5).reduce((n, t) => n + (t.ruleBreaks?.length || 0), 0);
    if (breaks >= 2) add({ id: 'journal.breaks', kind: 'journal', severity: 'warn', room: 'trading', text: `${breaks} rule breaks in the last five trades`, clear: 'read them; the pattern is the signal', evidence: { breaks, trades: trades.slice(-5).map((t) => t.id) } });
    const s = stats(last10);
    if (s.planRate < 0.6) add({ id: 'journal.plan', kind: 'journal', severity: 'warn', room: 'trading', text: `Plan followed on ${Math.round(s.planRate * 100)}% of recent trades`, clear: 'no trade without the Before block', evidence: { plan_rate: Number(s.planRate.toFixed(2)), trades: last10.length } });
  }
  const open = (state.journal?.trades || []).filter((t) => derive(t).outcome === 'Open');
  for (const t of open) {
    const age = (now - new Date(t.opened).getTime()) / DAY;
    if (age > 1) add({ id: `journal.open:${t.id}`, kind: 'journal', severity: 'info', room: 'trading', text: `${t.id} has been open ${Math.floor(age)} day${Math.floor(age) === 1 ? '' : 's'}`, clear: 'close it in the journal', evidence: { trade: t.id, days: Math.floor(age) }, since: iso(t.opened) });
  }

  // The operator.
  const today = new Date(now).toISOString().slice(0, 10); const hour = new Date(now).getHours();
  const done = state.protocolTicks ? state.protocolTicks.filter((t) => t.day === today && t.done).length : Object.values(state.protocol?.[today] || {}).filter(Boolean).length;
  if (hour >= 20 && done === 0) add({ id: `protocol.untouched:${today}`, kind: 'protocol', severity: 'info', room: 'sanctum', text: 'Nothing ticked on the protocol today', clear: 'tick what was done in SANCTUM', evidence: { day: today, ticked: 0 } });
  return out;
}

/**
 * The same rules over the tables as the database holds them, so the server's
 * picture of the day (the Bridge aggregate, the brief) is computed from the
 * same code the floor runs — not a second implementation that can drift.
 */
export function signalsFromTables(t = {}, { draftCounts = null, now = Date.now() } = {}) {
  const orders = {};
  for (const o of t.orders || []) (orders[o.room] || (orders[o.room] = [])).push({ id: o.id, t: o.text, p: o.priority, done: ['done', 'killed'].includes(o.state), proposed: o.state === 'proposed', ts: o.created_at ? new Date(o.created_at).getTime() : 0 });
  const state = {
    orders,
    products: t.products || [], lots: t.stock_lots || [], settings: t.settings || [],
    ledger: t.ledger_months || [], cash: t.cash_snapshots || [], pots: t.pots || [],
    protocolTicks: t.protocol_ticks || [],
    journal: { trades: (t.trades || []).map(tradeForSignals) },
    drafts: {},
    // The drafts table counts by status; the rules want three numbers.
    draftCounts: draftCounts ? { total: Object.values(draftCounts).reduce((a, b) => a + (Number(b) || 0), 0), waiting: (draftCounts.draft || 0) + (draftCounts.review || 0), posted: draftCounts.posted || 0 } : null,
  };
  // null: the server has no vault export, so it does not judge the brief.
  return signals(state, null, now);
}

/** A `trades` row in the shape journal.js computes over. Only the fields the rules read. */
function tradeForSignals(r) {
  return { id: r.id, entry: r.entry ?? '', stop: r.stop ?? '', target: r.target ?? '', exit: r.exit ?? '', risk: r.risk ?? '', opened: r.opened || '', closed: r.closed || '', planFollowed: !!r.plan_followed, ruleBreaks: r.rule_breaks || [], direction: r.direction, example: !!r.example };
}
