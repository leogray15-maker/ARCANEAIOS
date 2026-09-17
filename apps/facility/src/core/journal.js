/**
 * The Trading Journal — the data half. Pure functions over the store's
 * `journal` slice: what a trade computes to, and the statistics a set of
 * trades rolls up to. The Notion design in the brain
 * (05-Knowledge/Trading-Journal.md) is the spec; this is it running.
 *
 * Nothing here is a claim to anyone else. It is the operator's own record.
 */

export const SESSIONS = ['Asia', 'London', 'NY AM', 'NY PM', 'Overlap'];
export const KILLZONES = ['London KZ 02–05', 'NY KZ 07–10', 'Silver Bullet 10–11', 'NY PM 13–16', 'Outside KZ'];
export const GRADES = ['A+', 'A', 'B', 'C'];
export const PROCESS = ['A', 'B', 'C', 'D'];
export const EMOTIONS = ['Calm', 'Focused', 'Eager', 'Anxious', 'Bored', 'Tired', 'Frustrated', 'Euphoric'];
export const RULE_BREAKS = ['Late entry', 'No stop', 'Moved stop', 'Oversized', 'Revenge', 'FOMO', 'Early exit', 'Held past invalidation', 'Outside killzone', 'No setup', 'Added to loser'];
export const EDGES = ['Sweep → displacement', 'FVG retest', 'OB tap', 'Breaker', 'SMT', 'Turtle soup', 'OTE', 'Equilibrium'];
export const URGES = ['Revenge', 'FOMO', 'Oversize', 'Move stop', 'Skip plan', 'Keep trading'];
export const BIAS = ['Bullish', 'Bearish', 'Neutral'];

export const SEED_SETUPS = [
  { id: 'london-sweep', name: 'London Sweep', status: 'Active', session: 'London', tf: '4H bias · 5m entry', conditions: 'Asia range formed; HTF bias set; liquidity resting above or below the range.', trigger: 'Sweep of the Asia high/low into the London killzone, then displacement back through the range with an FVG.', stop: 'Beyond the sweep wick.', target: 'Opposite side of the range, then the HTF draw.', aplus: 'Sweep lands on an HTF level with SMT against the correlated pair.', invalidation: 'Price accepts beyond the sweep and holds.' },
  { id: 'silver-bullet', name: 'Silver Bullet', status: 'Active', session: 'NY AM', tf: '15m bias · 1m entry', conditions: '10:00–11:00 New York. A liquidity run already in progress toward a clear draw.', trigger: 'The first FVG formed after the 10:00 open in the direction of the draw; entry in the gap.', stop: 'Beyond the FVG.', target: 'The draw on liquidity; partial at 2R.', aplus: 'Displacement candle closes beyond a short-term high/low.', invalidation: 'Gap fully filled without continuation.' },
  { id: 'ny-reversal', name: 'NY Reversal', status: 'Testing', session: 'NY AM', tf: '1H bias · 5m entry', conditions: 'London has run one side; NY opens into an HTF level.', trigger: 'Sweep of the London extreme, SMT, then a market-structure shift on 5m.', stop: 'Beyond the NY extreme.', target: 'London open price, then the opposite London extreme.', aplus: 'Red-folder news already released; the sweep is on a 4H level.', invalidation: 'No MSS within 30 minutes of the sweep.' },
  { id: 'unplanned', name: 'Unplanned', status: 'Active', session: '', tf: '', conditions: 'There were none. This is where trades without a Before block go, so they count against you.', trigger: '', stop: '', target: '', aplus: '', invalidation: '' },
];

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/** Everything a trade computes to, from its typed fields. */
export function derive(t) {
  const entry = num(t.entry), stop = num(t.stop), target = num(t.target), exit = num(t.exit), risk = num(t.risk) || 0;
  const stopDist = entry !== null && stop !== null ? Math.abs(entry - stop) : null;
  const sign = t.direction === 'Short' ? -1 : 1;
  const plannedR = stopDist && target !== null ? Math.abs(target - entry) / stopDist : null;
  const r = stopDist && exit !== null ? (sign * (exit - entry)) / stopDist : null;
  const pnl = r !== null ? r * risk : null;
  const outcome = exit === null ? 'Open' : r > 0.2 ? 'Win' : r < -0.2 ? 'Loss' : 'BE';
  const opened = t.opened ? new Date(t.opened) : null, closed = t.closed ? new Date(t.closed) : null;
  const hold = opened && closed ? Math.round((closed - opened) / 60000) : null;
  return { stopDist, plannedR, r, pnl, outcome, hold, day: opened ? dayKey(opened) : '', week: opened ? weekKey(opened) : '', month: opened ? monthKey(opened) : '', hour: opened ? opened.getHours() : null, weekday: opened ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][opened.getDay()] : '' };
}

export const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export function weekKey(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return `${x.getUTCFullYear()}-W${String(Math.ceil(((x - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

/** Statistics over closed trades. */
export function stats(trades) {
  const closed = trades.map((t) => ({ t, d: derive(t) })).filter((x) => x.d.r !== null);
  const rs = closed.map((x) => x.d.r);
  const wins = closed.filter((x) => x.d.outcome === 'Win'), losses = closed.filter((x) => x.d.outcome === 'Loss'), be = closed.filter((x) => x.d.outcome === 'BE');
  const winR = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0), lossR = -rs.filter((r) => r < 0).reduce((a, b) => a + b, 0);
  const total = rs.reduce((a, b) => a + b, 0);
  const pnl = closed.reduce((a, x) => a + (x.d.pnl || 0), 0);
  let peak = 0, cum = 0, dd = 0; for (const r of rs) { cum += r; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
  const followed = closed.filter((x) => x.t.planFollowed).length;
  return {
    n: closed.length, wins: wins.length, losses: losses.length, be: be.length,
    winRate: closed.length ? wins.length / closed.length : 0,
    totalR: total, avgR: closed.length ? total / closed.length : 0, pnl,
    profitFactor: lossR ? winR / lossR : (winR ? Infinity : 0),
    best: rs.length ? Math.max(...rs) : 0, worst: rs.length ? Math.min(...rs) : 0,
    maxDD: dd, planRate: closed.length ? followed / closed.length : 0,
    avgHold: closed.length ? closed.reduce((a, x) => a + (x.d.hold || 0), 0) / closed.length : 0,
    ruleBreaks: closed.reduce((a, x) => a + (x.ruleBreaks?.length || x.t.ruleBreaks?.length || 0), 0),
  };
}

/** Group trades by a derived key; returns [{ key, trades, stats }] newest first. */
export function groupBy(trades, keyOf) {
  const m = new Map();
  for (const t of trades) { const k = keyOf(t, derive(t)); if (k === null || k === undefined || k === '') continue; if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
  return [...m.entries()].map(([key, ts]) => ({ key, trades: ts, stats: stats(ts) })).sort((a, b) => String(b.key).localeCompare(String(a.key)));
}

/** Cumulative R in time order, for the equity curve. */
export function equity(trades) {
  const closed = trades.filter((t) => derive(t).r !== null).sort((a, b) => (a.opened || '').localeCompare(b.opened || ''));
  let cum = 0; return closed.map((t) => { cum += derive(t).r; return { id: t.id, when: t.opened, r: derive(t).r, cum }; });
}

/** R histogram in half-R buckets. */
export function distribution(trades) {
  const rs = trades.map((t) => derive(t).r).filter((r) => r !== null);
  if (!rs.length) return [];
  const lo = Math.floor(Math.min(...rs, -1) * 2) / 2, hi = Math.ceil(Math.max(...rs, 1) * 2) / 2;
  const buckets = [];
  for (let b = lo; b <= hi; b += 0.5) buckets.push({ r: b, n: rs.filter((r) => Math.round(r * 2) / 2 === b).length });
  return buckets;
}

export const fmtR = (r) => (r === null || r === undefined || Number.isNaN(r) ? '—' : `${r > 0 ? '+' : ''}${r.toFixed(2)}R`);
export const fmtPct = (p) => `${Math.round(p * 100)}%`;
export const fmtGbp = (n) => (n === null || n === undefined ? '—' : `${n < 0 ? '−' : ''}£${Math.abs(Math.round(n)).toLocaleString('en-GB')}`);

/** Ten example trades over two weeks, so the journal can be seen working before the first real one. All marked `example`. */
export function exampleTrades() {
  const mk = (day, h, dir, setup, entry, stop, target, exit, grade, emo, plan, breaks = [], energy = 3, sleep = 7) => ({
    opened: `${day}T${String(h).padStart(2, '0')}:${['05', '20', '35', '50'][h % 4]}`, closed: `${day}T${String(h + 1).padStart(2, '0')}:10`, instrument: 'XAUUSD', direction: dir, session: h < 7 ? 'London' : 'NY AM', killzone: h < 7 ? 'London KZ 02–05' : h === 10 ? 'Silver Bullet 10–11' : 'NY KZ 07–10',
    setup, bias: dir === 'Long' ? 'Bullish' : 'Bearish', grade, conviction: grade === 'A+' ? 5 : grade === 'A' ? 4 : 3, entry, stop, target, exit, risk: 100, size: 0.5,
    emotionBefore: emo, emotionAfter: exit ? ((dir === 'Long' ? exit > entry : exit < entry) ? 'Calm' : 'Frustrated') : '', energy, sleep, stress: 6 - energy, planFollowed: plan, ruleBreaks: breaks, edges: ['Sweep → displacement'], process: plan ? 'A' : 'C', example: true,
  });
  return [
    mk('2026-09-03', 3, 'Long', 'london-sweep', 2648, 2644, 2660, 2659, 'A', 'Focused', true),
    mk('2026-09-03', 10, 'Short', 'silver-bullet', 2662, 2665, 2654, 2655, 'A+', 'Calm', true, [], 4, 7.5),
    mk('2026-09-04', 8, 'Long', 'unplanned', 2650, 2646, 2656, 2645, 'C', 'Eager', false, ['No setup', 'Late entry'], 2, 5),
    mk('2026-09-05', 3, 'Short', 'london-sweep', 2671, 2675, 2660, 2664, 'B', 'Focused', true),
    mk('2026-09-08', 10, 'Long', 'silver-bullet', 2655, 2652, 2664, 2663, 'A', 'Calm', true, [], 4, 8),
    mk('2026-09-09', 9, 'Short', 'ny-reversal', 2669, 2673, 2658, 2671, 'B', 'Anxious', false, ['Moved stop'], 2, 5.5),
    mk('2026-09-10', 3, 'Long', 'london-sweep', 2642, 2638, 2654, 2651, 'A+', 'Focused', true, [], 5, 8),
    mk('2026-09-11', 10, 'Short', 'silver-bullet', 2668, 2671, 2660, 2667, 'B', 'Bored', true),
    mk('2026-09-12', 8, 'Long', 'unplanned', 2649, 2645, 2655, 2644, 'C', 'Frustrated', false, ['Revenge', 'Oversized'], 2, 6),
    mk('2026-09-15', 3, 'Short', 'london-sweep', 2675, 2679, 2664, 2666, 'A', 'Focused', true, [], 4, 7.5),
  ].map((t) => ({ ...t, id: `T-${t.opened.slice(0, 10).replace(/-/g, '')}-${t.opened.slice(11, 13)}` }));
}
