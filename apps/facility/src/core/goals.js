/**
 * NORTH STAR and TARGETS — the arithmetic, pure.
 *
 * A goal is a row in `goals`: a horizon (decade → day), a parent one
 * horizon up, a target, and either a typed `current` or a `metric` that
 * binds it to a number the tables already hold (this month's revenue,
 * cash, COA coverage, members …). A target is a goal read against the
 * tables: target, actual, variance, percent, time remaining, trend.
 *
 * Shared by the floor (through `store.tables()`), the Bridge aggregate and
 * the brief, the way lab.js and money.js are — so a goal's progress is one
 * number wherever it is shown, and nobody types a figure the tables know.
 *
 * `tables` is the raw rows keyed by table name, the shape signalsFromTables
 * reads: products, stock_lots, settings, ledger_months, cash_snapshots,
 * fixed_costs, pots, dispatch, dispatch_items, trades, protocol_items,
 * protocol_ticks, orders, goals, projects — plus `draftCounts` when the
 * caller has them.
 */
import { GOAL_HORIZONS, HORIZON_IDS, HORIZON_BY_ID, VENTURE_BY_ID } from '../../../../packages/config/src/index.js';
import { moneySummary, monthOf, prevMonth, monthRevenue, rowRevenue, ventureRow } from './money.js';
import { labSummary, stockLines, settingsOf } from './lab.js';
import { derive, stats } from './journal.js';
import { daysUntil } from './projects.js';

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The metrics a goal may bind to. Each reads the tables and returns the
 * actual now; `previous` returns the comparable figure one period back
 * when the data can say it (else null), for the trend. `unit` is how the
 * figure is written. Adding a metric here makes it available to every
 * goal and every target at once.
 */
export const METRICS = {
  revenue_month:       { name: 'Revenue this month (all ventures)', unit: '£', kind: 'money',
    actual: (t, { now }) => monthRevenue(t.ledger_months, monthOf(now)), previous: (t, { now }) => monthRevenue(t.ledger_months, prevMonth(monthOf(now))) },
  net_month:           { name: 'Net this month (revenue − fixed)', unit: '£', kind: 'money',
    actual: (t, { now }) => money(t, now).net, previous: (t, { now }) => { const m = moneySummary(rows(t), prevMonth(monthOf(now))); return m.net; } },
  realised_profit_month: { name: 'Realised profit this month (shipped lines)', unit: '£', kind: 'money',
    actual: (t, { now }) => money(t, now).realised.profit, previous: (t, { now }) => moneySummary(rows(t), prevMonth(monthOf(now))).realised.profit },
  cash:                { name: 'Cash in the bank (latest snapshot)', unit: '£', kind: 'money',
    actual: (t) => money(t).cash?.cash ?? null, previous: (t) => { const s = (t.cash_snapshots || []).slice().sort((a, b) => String(b.day).localeCompare(String(a.day))); return s[1] ? Number(s[1].cash_gbp) : null; } },
  runway_months:       { name: 'Runway in months', unit: 'months', kind: 'money',
    actual: (t, { now }) => { const r = money(t, now).runway; return r === null ? null : r === Infinity ? 99 : Math.round(r * 10) / 10; }, previous: () => null },
  members_archives:    { name: 'Archives members (this month)', unit: 'members', kind: 'venture', venture: 'archives',
    actual: (t, { now }) => ventureRow(t.ledger_months, monthOf(now), 'archives')?.units ?? null, previous: (t, { now }) => ventureRow(t.ledger_months, prevMonth(monthOf(now)), 'archives')?.units ?? null },
  members_track:       { name: 'Track members (this month)', unit: 'members', kind: 'venture', venture: 'track',
    actual: (t, { now }) => ventureRow(t.ledger_months, monthOf(now), 'track')?.units ?? null, previous: (t, { now }) => ventureRow(t.ledger_months, prevMonth(monthOf(now)), 'track')?.units ?? null },
  orders_peptides:     { name: 'Peptide orders (this month)', unit: 'orders', kind: 'venture', venture: 'peptides',
    actual: (t, { now }) => ventureRow(t.ledger_months, monthOf(now), 'peptides')?.orders ?? null, previous: (t, { now }) => ventureRow(t.ledger_months, prevMonth(monthOf(now)), 'peptides')?.orders ?? null },
  revenue_peptides:    { name: 'Peptides revenue (this month)', unit: '£', kind: 'venture', venture: 'peptides', actual: vrev('peptides'), previous: vrev('peptides', true) },
  revenue_archives:    { name: 'Archives revenue (this month)', unit: '£', kind: 'venture', venture: 'archives', actual: vrev('archives'), previous: vrev('archives', true) },
  revenue_track:       { name: 'Track revenue (this month)', unit: '£', kind: 'venture', venture: 'track', actual: vrev('track'), previous: vrev('track', true) },
  revenue_codex:       { name: 'Codex revenue (this month)', unit: '£', kind: 'venture', venture: 'codex', actual: vrev('codex'), previous: vrev('codex', true) },
  coa_pct:             { name: 'COA published, % of live lines', unit: '%', kind: 'work', venture: 'peptides',
    actual: (t) => labSummary(t.products, t.stock_lots, t.settings, t.dispatch, t.dispatch_items).coaPct, previous: () => null },
  vials:               { name: 'Vials on the shelf', unit: 'vials', kind: 'work', venture: 'peptides',
    actual: (t) => stockLines(t.products, t.stock_lots, settingsOf(t.settings)).reduce((n, l) => n + l.vials, 0), previous: () => null },
  posts:               { name: 'Drafts marked posted', unit: 'posts', kind: 'work', venture: 'archives',
    actual: (t) => t.draftCounts?.posted ?? null, previous: () => null },
  trades_r_month:      { name: 'Journal R this month', unit: 'R', kind: 'trading',
    actual: (t, { now }) => rMonth(t.trades, monthOf(now)), previous: (t, { now }) => rMonth(t.trades, prevMonth(monthOf(now))) },
  plan_rate:           { name: 'Plan followed, % of last 20 trades', unit: '%', kind: 'trading',
    actual: (t) => { const c = closed(t.trades).slice(-20); return c.length ? Math.round(stats(c).planRate * 100) : null; }, previous: () => null },
  habit_rate_week:     { name: 'Protocol ticked, % of the last 7 days', unit: '%', kind: 'life',
    actual: (t, { now }) => habitRate(t, now, 7), previous: (t, { now }) => habitRate(t, new Date(now.getTime() - 7 * DAY), 7) },
  orders_done_week:    { name: 'Orders done in the last 7 days', unit: 'orders', kind: 'work',
    actual: (t, { now }) => doneIn(t.orders, now, 7), previous: (t, { now }) => doneIn(t.orders, new Date(now.getTime() - 7 * DAY), 7) },
};
export const METRIC_IDS = Object.keys(METRICS);

function vrev(v, prev = false) { return (t, { now }) => rowRevenue(ventureRow(t.ledger_months, prev ? prevMonth(monthOf(now)) : monthOf(now), v)); }
function rows(t) { return { ledger: t.ledger_months || [], fixed: t.fixed_costs || [], cash: t.cash_snapshots || [], pots: t.pots || [], dispatch: t.dispatch || [], dispatchItems: t.dispatch_items || [] }; }
function money(t, now = new Date()) { return moneySummary(rows(t), monthOf(now)); }
function closed(trades = []) { return (trades || []).map(asTrade).filter((x) => derive(x).r !== null).sort((a, b) => String(a.opened).localeCompare(String(b.opened))); }
function asTrade(r) { return r.planFollowed !== undefined ? r : { ...r, planFollowed: !!r.plan_followed, ruleBreaks: r.rule_breaks || [] }; }
function rMonth(trades, month) { const c = closed(trades).filter((x) => derive(x).month === month); return c.length ? Math.round(c.reduce((n, x) => n + derive(x).r, 0) * 100) / 100 : null; }
function habitRate(t, now, days) {
  const items = (t.protocol_items || []).filter((i) => i.active !== false && (i.cadence || 'day') === 'day');
  if (!items.length) return null;
  const set = new Set(); for (let i = 0; i < days; i++) set.add(dayOf(new Date(now.getTime() - i * DAY)));
  const ticks = (t.protocol_ticks || []).filter((k) => k.done && set.has(k.day) && items.some((i) => i.id === k.item_id)).length;
  return Math.round(ticks / (items.length * days) * 100);
}
function doneIn(orders = [], now, days) { const from = now.getTime() - days * DAY; return (orders || []).filter((o) => o.state === 'done' && o.done_at && new Date(o.done_at).getTime() >= from && new Date(o.done_at).getTime() <= now.getTime()).length; }

/* ---------- the tree ---------- */

/** The goals as a forest ordered by horizon then position, each with `children`, `depth` and `path`. */
export function goalTree(goals = []) {
  const by = Object.fromEntries((goals || []).map((g) => [g.id, { ...g, children: [] }]));
  const roots = [];
  const sorted = Object.values(by).sort((a, b) => HORIZON_IDS.indexOf(a.horizon) - HORIZON_IDS.indexOf(b.horizon) || (a.position || 0) - (b.position || 0) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  for (const g of sorted) { const p = g.parent_id && by[g.parent_id]; if (p && p !== g) p.children.push(g); else roots.push(g); }
  const walk = (list, depth, path) => { for (const g of list) { g.depth = depth; g.path = [...path, g.id]; walk(g.children, depth + 1, g.path); } };
  walk(roots, 0, []);
  return roots;
}
/** Every goal in tree order, flat. */
export function goalsFlat(goals = []) { const out = []; const walk = (l) => { for (const g of l) { out.push(g); walk(g.children); } }; walk(goalTree(goals)); return out; }
/** The chain from a goal up to its root, root first. */
export function goalChain(goals = [], id) { const by = Object.fromEntries((goals || []).map((g) => [g.id, g])); const out = []; let g = by[id]; const seen = new Set(); while (g && !seen.has(g.id)) { seen.add(g.id); out.unshift(g); g = g.parent_id ? by[g.parent_id] : null; } return out; }
/** Every descendant of a goal, any depth. */
export function goalDescendants(goals = [], id) { const out = []; const kids = (pid) => (goals || []).filter((g) => g.parent_id === pid); const walk = (pid) => { for (const k of kids(pid)) { out.push(k); walk(k.id); } }; walk(id); return out; }

/* ---------- a goal read against the tables ---------- */

/**
 * The one shape a goal shows as everywhere. `actual` is the metric's figure
 * when bound, the typed `current` otherwise, or — for a goal with neither
 * but with children — the mean of its children's percentages, marked
 * `how: 'children'`. `pct` is capped at 100. `daysLeft` counts to `ends`, or
 * to the horizon's span from `starts`/creation when there is no end.
 */
export function target(goal, tables = {}, { now = new Date(), goals = tables.goals || [] } = {}) {
  const m = goal.metric ? METRICS[goal.metric] : null;
  let actual = null, previous = null, how = 'typed';
  if (m) { try { actual = m.actual(tables, { now }); previous = m.previous ? m.previous(tables, { now }) : null; } catch { actual = null; } how = 'computed'; }
  else if (goal.current !== null && goal.current !== undefined && goal.current !== '') actual = Number(goal.current);
  const tgt = goal.target === null || goal.target === undefined || goal.target === '' ? null : Number(goal.target);
  let pct = null;
  if (tgt !== null && actual !== null && tgt !== 0) pct = Math.max(0, Math.min(100, Math.round(actual / tgt * 100)));
  else if (tgt === null && actual === null && goal.status === 'done') pct = 100;
  if (pct === null && actual === null && goal.id) {
    // A parent without its own number is as far along as its children are.
    const kids = (goals || []).filter((g) => g.parent_id === goal.id && g.status !== 'dropped');
    const ps = kids.map((k) => target(k, tables, { now, goals }).pct).filter((p) => p !== null);
    if (ps.length) { pct = Math.round(ps.reduce((a, b) => a + b, 0) / ps.length); how = 'children'; }
  }
  if (goal.status === 'done' && pct !== null) pct = 100;
  const variance = tgt !== null && actual !== null ? actual - tgt : null;
  const start = goal.starts ? new Date(goal.starts) : goal.created_at ? new Date(goal.created_at) : null;
  const span = HORIZON_BY_ID[goal.horizon]?.days || 365;
  const endAt = goal.ends ? new Date(goal.ends).getTime() : start ? start.getTime() + span * DAY : null;
  const daysLeft = goal.ends ? daysUntil(goal.ends, now) : endAt === null ? null : Math.round((endAt - now.getTime()) / DAY);
  const trend = actual !== null && previous !== null ? (actual > previous ? 'up' : actual < previous ? 'down' : 'flat') : null;
  return { id: goal.id, title: goal.title, horizon: goal.horizon, unit: m?.unit || goal.unit || '', currency: goal.currency || 'GBP', target: tgt, actual, previous, variance, pct, daysLeft, trend, how, metric: goal.metric || '', status: goal.status, venture: goal.venture || m?.venture || '', category: goal.category || m?.kind || '', parent_id: goal.parent_id || null,
    // Whether time is being spent faster than progress is made: the share of the period elapsed against the share of the target reached.
    elapsedPct: start && endAt ? Math.max(0, Math.min(100, Math.round((now.getTime() - start.getTime()) / (endAt - start.getTime()) * 100))) : null };
}
/** Every active goal as a target, tree-ordered. */
export function targets(goals = [], tables = {}, { now = new Date(), includeDone = false } = {}) {
  return goalsFlat(goals).filter((g) => includeDone || g.status === 'active').map((g) => ({ ...target(g, tables, { now, goals }), depth: g.depth, path: g.path }));
}
/** Behind if less of the target is reached than of the time is spent, by more than ten points. */
export function behind(t) { return t.pct !== null && t.elapsedPct !== null && t.elapsedPct - t.pct > 10; }

/** How a figure is written, in the goal's unit. */
export function fmt(v, unit = '') {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (unit === '£') return `${v < 0 ? '−' : ''}£${Math.abs(Math.round(v)).toLocaleString('en-GB')}`;
  if (unit === '%') return `${Math.round(v)}%`;
  if (unit === 'R') return `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}R`;
  const n = Number.isInteger(v) ? v.toLocaleString('en-GB') : Number(v).toLocaleString('en-GB', { maximumFractionDigits: 1 });
  return unit ? `${n} ${unit}` : n;
}

/** The period key a horizon's goal would be reviewed under, for `reviews`. */
export function periodOf(kind, d = new Date()) {
  if (kind === 'day') return dayOf(d);
  if (kind === 'month') return monthOf(d);
  if (kind === 'quarter') return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  // ISO week.
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${pad(Math.ceil(((t - y) / DAY + 1) / 7))}`;
}

export { GOAL_HORIZONS, VENTURE_BY_ID };
