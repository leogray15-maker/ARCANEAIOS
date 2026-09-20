/**
 * THE VAULT's arithmetic — pure, shared by the floor, the Bridge aggregate
 * and the brief, the way lab.js and journal.js are.
 *
 * Revenue is per venture per month (`ledger_months`): typed as revenue,
 * or as units when the venture has a price (members × £128). Fixed costs
 * are a monthly list; cash is the latest dated snapshot; the split is a
 * set of pots over this month's revenue. Runway is cash over the monthly
 * shortfall. Every number here was typed by Leo; none moves money.
 */
import { VENTURES, VENTURE_BY_ID } from '../../../../packages/config/src/index.js';
import { realised } from './lab.js';

const pad = (n) => String(n).padStart(2, '0');
export const monthOf = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const prevMonth = (m) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 2, 1); return monthOf(d); };
export const monthLabel = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); };

/** The revenue a ledger row means: typed revenue first, else units × the venture's price. */
export function rowRevenue(row) {
  if (!row) return null;
  if (row.revenue_gbp !== null && row.revenue_gbp !== undefined && row.revenue_gbp !== '') return Number(row.revenue_gbp);
  const v = VENTURE_BY_ID[row.venture];
  if (v?.price && row.units !== null && row.units !== undefined) return Number(row.units) * v.price;
  return null;
}

export function monthRows(ledger = [], month) { return (ledger || []).filter((r) => r.month === month); }
export function ventureRow(ledger = [], month, venture) { return (ledger || []).find((r) => r.month === month && r.venture === venture) || null; }

/** Revenue for a month across the ventures; null when nothing was typed for that month. */
export function monthRevenue(ledger = [], month) {
  const rows = monthRows(ledger, month).map(rowRevenue).filter((x) => x !== null);
  return rows.length ? rows.reduce((a, b) => a + b, 0) : null;
}
export function monthlyFixed(fixed = []) { return (fixed || []).filter((f) => f.active !== false).reduce((n, f) => n + (Number(f.amount_gbp) || 0), 0); }
export function latestCash(snapshots = []) { const s = (snapshots || []).slice().sort((a, b) => String(b.day).localeCompare(String(a.day)))[0]; return s ? { day: s.day, cash: Number(s.cash_gbp) || 0, note: s.note } : null; }
export function runway(cash, revenue, fixed) { if (cash === null || cash === undefined) return null; const burn = fixed - (revenue || 0); return burn <= 0 ? Infinity : cash / burn; }
export function allocations(pots = [], revenue) { return (pots || []).slice().sort((a, b) => a.position - b.position).map((p) => ({ ...p, pct: Number(p.pct) || 0, amount: revenue === null ? null : revenue * (Number(p.pct) || 0) / 100 })); }
const items_ = (x) => x || [];
export const splitTotal = (pots = []) => (pots || []).reduce((n, p) => n + (Number(p.pct) || 0), 0);

/** The last `n` months with figures, newest first: revenue, fixed at today's list, net. */
export function history(ledger = [], fixed = [], n = 12) {
  const months = [...new Set((ledger || []).map((r) => r.month))].sort().reverse().slice(0, n);
  const fx = monthlyFixed(fixed);
  return months.map((m) => { const rev = monthRevenue(ledger, m); return { month: m, revenue: rev, fixed: fx, net: rev === null ? null : rev - fx, byVenture: Object.fromEntries(VENTURES.map((v) => [v.id, rowRevenue(ventureRow(ledger, m, v.id))])) }; });
}

/** What the boxes shipped in one month actually made. The month is the shipping date, not the order date. */
export function realisedMonth(dispatch = [], items = [], month = monthOf()) {
  return realised(dispatch, items, { from: `${month}-01`, to: `${month}-31` });
}

/** The Vault in one object — the header, the Bridge and the brief read this. */
export function moneySummary({ ledger = [], fixed = [], cash = [], pots = [], dispatch = [], dispatchItems = [] } = {}, month = monthOf()) {
  const revenue = monthRevenue(ledger, month);
  const prev = monthRevenue(ledger, prevMonth(month));
  const fx = monthlyFixed(fixed);
  const c = latestCash(cash);
  const rw = runway(c?.cash ?? null, revenue, fx);
  const real = realisedMonth(dispatch, items_(dispatchItems), month);
  return {
    month, revenue, previous: prev, change: revenue !== null && prev !== null && prev > 0 ? (revenue - prev) / prev : null,
    // Typed revenue is what Leo says came in; realised is what the boxes
    // that left the building actually made. They answer different
    // questions and are never added together.
    realised: real,
    fixed: fx, net: revenue === null ? null : revenue - fx,
    cash: c, runway: rw, split: splitTotal(pots), pots: allocations(pots, revenue),
    ventures: VENTURES.map((v) => { const r = ventureRow(ledger, month, v.id); return { id: v.id, name: v.name, revenue: rowRevenue(r), units: r?.units ?? null, price: v.price, unitLabel: v.unitLabel, visitors: r?.visitors ?? null, leads: r?.leads ?? null, orders: r?.orders ?? null }; }),
  };
}
