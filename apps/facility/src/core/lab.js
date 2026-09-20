/**
 * THE LAB's arithmetic — pure, shared by the floor, the Bridge aggregate
 * and the brief (the tools import it the way they import journal.js).
 *
 * A product costs `kit_cost_usd` per kit of `kit_vials` from the
 * supplier; landed cost adds the overhead percentage; the exchange rate
 * turns it into pounds per vial. Margin is on the vial price Leo sells
 * at. Stock is the sum of a product's lots; a lot carries the COA state.
 * Nothing here is a claim about what any of these compounds do.
 */

export const DEFAULT_SETTINGS = { fx_gbp_per_usd: 0.78, landed_overhead_pct: 0, low_stock_vials: 12 };

/** Settings rows → numbers, with the defaults where a key is missing or not a number. */
export function settingsOf(rows = []) {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows || []) { const n = Number(r.value); if (r.key in out && Number.isFinite(n)) out[r.key] = n; }
  return out;
}

/** Landed cost per vial in GBP, or null when the product has no supplier cost. */
export function unitCost(p, s = DEFAULT_SETTINGS, lot = null) {
  const kit = lot?.cost_usd ?? p.kit_cost_usd;
  if (kit === null || kit === undefined || !(p.kit_vials > 0)) return null;
  return (Number(kit) / p.kit_vials) * s.fx_gbp_per_usd * (1 + (s.landed_overhead_pct || 0) / 100);
}

/** { cost, sell, margin (0–1), markup (×), profit } per vial; nulls where a side is unknown. */
export function economics(p, s = DEFAULT_SETTINGS) {
  const cost = unitCost(p, s);
  const sell = p.sell_gbp === null || p.sell_gbp === undefined ? null : Number(p.sell_gbp);
  if (cost === null || sell === null) return { cost, sell, margin: null, markup: null, profit: null };
  return { cost, sell, margin: sell > 0 ? (sell - cost) / sell : null, markup: cost > 0 ? sell / cost : null, profit: sell - cost };
}

/** Vials on hand per product, and the worst COA state among lots that still hold vials. */
export function stockOf(productId, lots = []) {
  const mine = (lots || []).filter((l) => l.product_id === productId);
  const vials = mine.reduce((n, l) => n + (Number(l.vials) || 0), 0);
  const live = mine.filter((l) => (Number(l.vials) || 0) > 0);
  const coa = !live.length ? 'none' : live.every((l) => l.coa === 'published') ? 'published' : live.some((l) => l.coa === 'published' || l.coa === 'pending') ? 'pending' : 'none';
  return { vials, coa, lots: mine };
}

/**
 * The stock lines the floor shows and VIGIL reads: one per product with
 * vials on hand (or listed and active), with cost, price, margin and COA.
 */
export function stockLines(products = [], lots = [], settings = DEFAULT_SETTINGS) {
  return (products || []).filter((p) => p.active !== false).map((p) => {
    const st = stockOf(p.id, lots);
    const eco = economics(p, settings);
    return { ...p, vials: st.vials, coa: st.coa, lotCount: st.lots.length, ...eco, low: st.vials > 0 && st.vials < settings.low_stock_vials, value_cost: eco.cost === null ? null : eco.cost * st.vials, value_sell: eco.sell === null ? null : eco.sell * st.vials };
  });
}

/**
 * What a shipped dispatch actually made.
 *
 * The catalogue's margin is a hope: price minus landed cost, at today's
 * exchange rate, for a vial nobody has bought. This is the other kind —
 * what the lines that actually left the building sold for, less what the
 * lot they came out of had cost, both captured at the moment of shipping.
 *
 * Only shipped and delivered dispatches count. A line with no captured
 * cost (shipped before this existed, or picked from no lot) is counted in
 * revenue and named in `incomplete`, never quietly given a cost of zero —
 * a margin that flatters itself is worse than no margin at all.
 */
export function realised(dispatch = [], items = [], { from = '', to = '' } = {}) {
  const shipped = (dispatch || []).filter((d) => ['shipped', 'delivered'].includes(d.stage))
    .filter((d) => { const day = String(d.shipped_at || d.updated_at || d.created_at || '').slice(0, 10); return (!from || day >= from) && (!to || day <= to); });
  const byId = Object.fromEntries(shipped.map((d) => [d.id, d]));
  const lines = (items || []).filter((l) => byId[l.dispatch_id]);
  const priced = lines.filter((l) => l.unit_price_gbp !== null && l.unit_price_gbp !== undefined);
  const costed = priced.filter((l) => l.unit_cost_gbp !== null && l.unit_cost_gbp !== undefined);
  const sum = (list, f) => list.reduce((n, l) => n + f(l), 0);
  const revenue = sum(priced, (l) => Number(l.unit_price_gbp) * l.vials);
  const cost = sum(costed, (l) => Number(l.unit_cost_gbp) * l.vials);
  const complete = costed.length === lines.length && lines.length > 0;
  const group = (key) => {
    const out = {};
    for (const l of costed) {
      const k = l[key]; if (!k) continue;
      const r = out[k] || (out[k] = { id: k, vials: 0, revenue: 0, cost: 0 });
      r.vials += l.vials; r.revenue += Number(l.unit_price_gbp || 0) * l.vials; r.cost += Number(l.unit_cost_gbp) * l.vials;
    }
    return Object.values(out).map((r) => ({ ...r, profit: r.revenue - r.cost, margin: r.revenue > 0 ? (r.revenue - r.cost) / r.revenue : null })).sort((a, b) => b.profit - a.profit);
  };
  return {
    dispatches: shipped.length, lines: lines.length, vials: sum(lines, (l) => l.vials),
    revenue: priced.length ? revenue : null,
    cost: costed.length ? cost : null,
    profit: costed.length ? revenue - cost : null,
    margin: costed.length && revenue > 0 ? (revenue - cost) / revenue : null,
    complete,
    incomplete: lines.filter((l) => !costed.includes(l)).map((l) => ({ id: l.id, dispatch: l.dispatch_id, product: l.product_id, why: l.unit_price_gbp === null || l.unit_price_gbp === undefined ? 'no price captured' : 'no lot cost captured' })),
    byProduct: group('product_id'), byLot: group('lot_id'),
  };
}

/** The room's numbers in one object — the Bridge, the brief and the Lab's header read this. */
export function labSummary(products = [], lots = [], settingsRows = [], dispatch = [], items = []) {
  const s = settingsOf(settingsRows);
  const lines = stockLines(products, lots, s);
  const live = lines.filter((l) => l.vials > 0);
  const listed = lines.filter((l) => l.listed);
  const costed = listed.filter((l) => l.margin !== null);
  const queue = (dispatch || []).filter((d) => ['packing', 'ready'].includes(d.stage));
  return {
    settings: s,
    products: lines.length, listed: listed.length, costed: costed.length, uncosted: listed.filter((l) => l.cost === null).map((l) => `${l.name} ${l.size}`.trim()),
    vials: live.reduce((n, l) => n + l.vials, 0), live: live.length,
    low: live.filter((l) => l.low).map((l) => ({ id: l.id, name: l.name, size: l.size, vials: l.vials })),
    noCoa: live.filter((l) => l.coa !== 'published').map((l) => ({ id: l.id, name: l.name, size: l.size, coa: l.coa })),
    coaPct: live.length ? Math.round(live.filter((l) => l.coa === 'published').length / live.length * 100) : null,
    valueCost: live.reduce((n, l) => n + (l.value_cost || 0), 0), valueSell: live.reduce((n, l) => n + (l.value_sell || 0), 0),
    avgMargin: costed.length ? costed.reduce((n, l) => n + l.margin, 0) / costed.length : null,
    thinnest: costed.slice().sort((a, b) => a.margin - b.margin).slice(0, 5).map((l) => ({ id: l.id, name: l.name, size: l.size, margin: l.margin })),
    dispatch: { packing: queue.filter((d) => d.stage === 'packing').length, ready: queue.filter((d) => d.stage === 'ready').length, oldest: queue.length ? queue.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0] : null },
    // What has actually been made, beside what the catalogue hopes for.
    realised: realised(dispatch, items),
  };
}
