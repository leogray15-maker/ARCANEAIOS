/**
 * CAPITAL PLAN — where the money goes, as arithmetic, pure.
 *
 *   revenue → cost of goods → gross → fixed costs → net → tax reserve → available → the buckets
 *
 * Revenue is the month's typed revenue (money.js). Cost of goods is what
 * the tables can prove: the lot cost of the lines shipped this month; the
 * ventures with no lines have no known COGS and the room says so rather
 * than guessing. Fixed costs are the Vault's list. The tax reserve is the
 * `tax` pot's share of net, taken first. What is left is available, and
 * the buckets are the pots — or, when a capital rule's threshold is met,
 * that rule's percentages. Nothing here moves money: a confirmed
 * allocation is a row in `capital_allocations`, a plan on the record.
 */
import { moneySummary, monthOf, splitTotal } from './money.js';

const round2 = (n) => Math.round(n * 100) / 100;

/** The first active rule whose threshold the available figure meets, in position order; null means the pots apply. */
export function ruleFor(rules = [], available) {
  if (available === null || available === undefined) return null;
  return (rules || []).filter((r) => r.active !== false).sort((a, b) => (a.position || 0) - (b.position || 0)).find((r) => Number(r.min_available || 0) <= available) || null;
}

/** Percentages → pounds over an amount. The last bucket takes the rounding so the pounds add to the amount exactly. */
export function allocate(amount, pcts = {}) {
  const ids = Object.keys(pcts);
  if (amount === null || amount === undefined || !ids.length) return {};
  const out = {}; let acc = 0;
  ids.forEach((id, i) => { const v = i === ids.length - 1 ? round2(amount - acc) : round2(amount * (Number(pcts[id]) || 0) / 100); out[id] = v; acc = round2(acc + v); });
  return out;
}

/** True when a set of percentages adds to 100 (within a penny of rounding). */
export function pctsValid(pcts = {}) { const t = Object.values(pcts).reduce((n, p) => n + (Number(p) || 0), 0); return Math.abs(t - 100) < 0.01; }

/**
 * The waterfall for one month.
 *
 * `tables`: ledger_months, fixed_costs, cash_snapshots, pots, dispatch,
 * dispatch_items, capital_rules, capital_allocations. Every step carries
 * its working in `explain`.
 */
export function waterfall(tables = {}, month = monthOf()) {
  const m = moneySummary({ ledger: tables.ledger_months || [], fixed: tables.fixed_costs || [], cash: tables.cash_snapshots || [], pots: tables.pots || [], dispatch: tables.dispatch || [], dispatchItems: tables.dispatch_items || [] }, month);
  const pots = (tables.pots || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
  const revenue = m.revenue;
  const cogs = m.realised.cost === null || m.realised.cost === undefined ? null : m.realised.cost;
  const cogsKnown = cogs !== null && m.realised.dispatches > 0;
  const gross = revenue === null ? null : revenue - (cogsKnown ? cogs : 0);
  const fixed = m.fixed;
  const net = gross === null ? null : gross - fixed;
  const taxPot = pots.find((p) => p.id === 'tax');
  const taxPct = taxPot ? Number(taxPot.pct) || 0 : 0;
  const tax = net === null ? null : net > 0 ? round2(net * taxPct / 100) : 0;
  const available = net === null ? null : round2(net - (tax || 0));
  const rules = tables.capital_rules || [];
  const rule = ruleFor(rules, available);
  // The default split is the pots other than tax, renormalised to 100.
  const rest = pots.filter((p) => p.id !== 'tax');
  const restTotal = rest.reduce((n, p) => n + (Number(p.pct) || 0), 0);
  const defaultPcts = Object.fromEntries(rest.map((p) => [p.id, restTotal ? round2((Number(p.pct) || 0) * 100 / restTotal) : 0]));
  const pcts = rule ? rule.pcts || {} : defaultPcts;
  const buckets = available !== null && available > 0 ? allocate(available, pcts) : Object.fromEntries(Object.keys(pcts).map((k) => [k, 0]));
  const existing = (tables.capital_allocations || []).find((a) => a.month === month) || null;
  const explain = {
    revenue: m.explain.revenue,
    cogs: cogsKnown ? `lot cost of ${m.realised.vials} vials shipped in ${m.realised.dispatches} dispatch${m.realised.dispatches === 1 ? '' : 'es'}${m.realised.incomplete?.length ? ` (${m.realised.incomplete.length} lines uncosted)` : ''}` : 'no shipped lines this month — cost of goods unknown, taken as 0',
    gross: revenue === null ? 'no revenue typed' : `£${r(revenue)} − £${r(cogsKnown ? cogs : 0)}`,
    fixed: m.explain.fixed,
    net: gross === null ? '—' : `£${r(gross)} gross − £${r(fixed)} fixed`,
    tax: taxPot ? (net !== null && net > 0 ? `${taxPct}% of £${r(net)} net (the tax pot)` : 'nothing to reserve: net is not positive') : 'no tax pot in THE VAULT',
    available: net === null ? '—' : `£${r(net)} − £${r(tax || 0)} tax`,
    rule: rule ? `rule "${rule.name}" (available ≥ £${r(rule.min_available)})` : `the pots (${rest.map((p) => `${p.name} ${p.pct}%`).join(', ')}${restTotal !== 100 - taxPct ? `, renormalised from ${restTotal}%` : ''})`,
  };
  return { month, revenue, cogs: cogsKnown ? cogs : null, cogsKnown, gross, fixed, net, taxPct, tax, available, rule, pcts, buckets, pots, explain, existing, splitTotal: splitTotal(pots) };
}

/** Confirmed allocations, cumulative by bucket, oldest month first. */
export function cumulative(allocations = []) {
  const rows = (allocations || []).filter((a) => a.confirmed_at).slice().sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const total = {};
  const out = rows.map((a) => { for (const [k, v] of Object.entries(a.confirmed || {})) total[k] = round2((total[k] || 0) + (Number(v) || 0)); return { month: a.month, confirmed: a.confirmed, running: { ...total } }; });
  return { rows: out, total };
}

const r = (n) => Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 });
