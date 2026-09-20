/**
 * What an agent reads before it thinks.
 *
 * Each function here assembles one agent's evidence from the tables — the
 * same rows the rooms show, through the same pure arithmetic — and hands
 * back three things: `facts` (numbers a room can show and a run can
 * record), `problems` (what the data cannot say, named rather than
 * papered over), and `brief` (the same facts written out for the model).
 *
 * Nothing here calls a model. That is deliberate: an agent's *reading* of
 * the state is real whether or not its reasoning can run, so a room can
 * show what TALLY read even on a day the account has no credits. And a
 * reading that is deterministic can be tested.
 */
import { ROOMS, ROOM_BY_ID, VENTURES, VENTURE_BY_ID } from '../../config/src/index.js';
import { state } from './state.js';
import { events, runs } from './content.js';
import { aggregate } from './bridge.js';
import { labSummary, stockLines, settingsOf, realised } from '../../../apps/facility/src/core/lab.js';
import { moneySummary, monthOf, prevMonth, realisedMonth } from '../../../apps/facility/src/core/money.js';
import { derive, stats } from '../../../apps/facility/src/core/journal.js';

const DAY = 86400000;
const gbp = (n) => (n === null || n === undefined || n === Infinity ? '—' : `£${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`);
const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
const src = (name, rows) => `${name} (${Array.isArray(rows) ? rows.length : rows} rows)`;
async function table(db, name, opts) { try { return await state.list(db, name, opts); } catch { return null; } }

/* ============================================================
   TALLY — the Treasurer. Quantitative: what changed, what it means.
   ============================================================ */
export async function tallyEvidence(db, { now = new Date() } = {}) {
  const month = monthOf(now), previous = prevMonth(month);
  const [ledger, fixed, cash, pots, products, lots, settings, dispatch, items, trades] = await Promise.all([
    table(db, 'ledger_months'), table(db, 'fixed_costs'), table(db, 'cash_snapshots'), table(db, 'pots'),
    table(db, 'products'), table(db, 'stock_lots'), table(db, 'settings'), table(db, 'dispatch'), table(db, 'dispatch_items', { limit: 5000 }), table(db, 'trades', { limit: 500 }),
  ]);
  const problems = [], sources = [];
  for (const [n, r] of [['ledger_months', ledger], ['fixed_costs', fixed], ['cash_snapshots', cash], ['pots', pots], ['products', products], ['stock_lots', lots], ['dispatch', dispatch], ['dispatch_items', items], ['trades', trades]]) {
    if (r === null) problems.push(`the ${n} table could not be read`); else sources.push(src(n, r));
  }
  const money = moneySummary({ ledger: ledger || [], fixed: fixed || [], cash: cash || [], pots: pots || [], dispatch: dispatch || [], dispatchItems: items || [] }, month);
  const prev = moneySummary({ ledger: ledger || [], fixed: fixed || [], cash: cash || [], pots: pots || [], dispatch: dispatch || [], dispatchItems: items || [] }, previous);
  const lab = labSummary(products || [], lots || [], settings || [], dispatch || [], items || []);
  if (money.revenue === null) problems.push(`no revenue typed for ${month}`);
  if (!money.cash) problems.push('no cash snapshot has ever been typed — runway cannot be computed');
  else if ((now.getTime() - new Date(money.cash.day).getTime()) / DAY > 14) problems.push(`the cash figure is from ${money.cash.day}`);
  if (!(lots || []).length) problems.push('no stock has been booked in — every margin is the catalogue\'s, none is realised');
  if (!(items || []).length) problems.push('no dispatch lines recorded — nothing has been sold against a lot');
  if (money.realised.incomplete.length) problems.push(`${money.realised.incomplete.length} shipped line(s) this month have no lot cost`);
  if (lab.uncosted.length) problems.push(`${lab.uncosted.length} listed line(s) have no supplier cost`);

  const closed = (trades || []).map(tradeShape).filter((t) => derive(t).r !== null && String(t.closed || '').startsWith(month));
  const jr = closed.length ? stats(closed) : null;
  // What moved, from the record: the money and stock events of the last two weeks.
  let recent = [];
  try { recent = (await events.list(db, { limit: 200 })).filter((e) => /^(ledger|cash|cost|pot|dispatch|lot|setting)\./.test(e.kind) && now.getTime() - new Date(e.at).getTime() < 14 * DAY).slice(0, 25).map((e) => ({ at: e.at, kind: e.kind, summary: e.summary })); } catch {}

  const facts = {
    month, previous,
    money: { revenue: money.revenue, previous: money.previous, change: money.change, fixed: money.fixed, net: money.net, cash: money.cash, runway: money.runway === Infinity ? 'covered' : money.runway, split: money.split, ventures: money.ventures.map((v) => ({ id: v.id, name: v.name, revenue: v.revenue, units: v.units, previous: prev.ventures.find((p) => p.id === v.id)?.revenue ?? null })) },
    realised: { revenue: money.realised.revenue, cost: money.realised.cost, profit: money.realised.profit, margin: money.realised.margin, dispatches: money.realised.dispatches, vials: money.realised.vials, incomplete: money.realised.incomplete.length, byProduct: money.realised.byProduct.slice(0, 5) },
    lab: { vials: lab.vials, live: lab.live, valueCost: lab.valueCost, valueSell: lab.valueSell, avgMargin: lab.avgMargin, thinnest: lab.thinnest, uncosted: lab.uncosted.length, low: lab.low, noCoa: lab.noCoa, queue: lab.dispatch.packing + lab.dispatch.ready },
    journal: jr ? { closed: closed.length, r_sum: Number(jr.totalR?.toFixed?.(2) ?? 0), plan_rate: jr.planRate, open: (trades || []).map(tradeShape).filter((t) => derive(t).outcome === 'Open').length } : { closed: 0, open: (trades || []).map(tradeShape).filter((t) => derive(t).outcome === 'Open').length },
    changes: recent,
  };
  const brief = [
    `Month ${month} (previous ${previous}).`,
    `MONEY — revenue ${gbp(money.revenue)} (previous ${gbp(money.previous)}${money.change !== null ? `, ${pct(money.change)}` : ''}); fixed ${gbp(money.fixed)}/month; net ${gbp(money.net)}; cash ${money.cash ? `${gbp(money.cash.cash)} as at ${money.cash.day}` : 'not typed'}; runway ${money.runway === null ? 'unknown' : money.runway === Infinity ? 'covered by revenue' : `${money.runway.toFixed(1)} months`}; split ${money.split}%.`,
    `BY VENTURE — ${facts.money.ventures.map((v) => `${v.name}: ${gbp(v.revenue)}${v.units !== null ? ` (${v.units} units)` : ''}${v.previous !== null ? `, was ${gbp(v.previous)}` : ''}`).join('; ')}.`,
    `REALISED (shipped this month) — ${money.realised.revenue === null ? 'nothing shipped with lines recorded' : `${money.realised.dispatches} dispatches, ${money.realised.vials} vials, revenue ${gbp(money.realised.revenue)}, cost ${gbp(money.realised.cost)}, profit ${gbp(money.realised.profit)}, margin ${pct(money.realised.margin)}${money.realised.incomplete.length ? `, ${money.realised.incomplete.length} lines without a cost` : ''}`}.`,
    `STOCK — ${lab.vials} vials in ${lab.live} lines; at cost ${gbp(lab.valueCost)}, at price ${gbp(lab.valueSell)}; average catalogue margin ${pct(lab.avgMargin)}; thinnest: ${lab.thinnest.map((t) => `${t.name} ${t.size} ${pct(t.margin)}`).join(', ') || 'none costed'}; low: ${lab.low.map((l) => `${l.name} ${l.size} (${l.vials})`).join(', ') || 'none'}; without COA: ${lab.noCoa.length}; uncosted listed lines: ${lab.uncosted.length}; dispatch queue: ${facts.lab.queue}.`,
    `JOURNAL — ${closed.length} trades closed this month${jr ? `, ${facts.journal.r_sum}R, plan followed ${pct(jr.planRate)}` : ''}; ${facts.journal.open} open.`,
    `CHANGED IN THE LAST 14 DAYS — ${recent.length ? recent.map((e) => `${e.at.slice(0, 10)} ${e.summary}`).join('; ') : 'no money or stock events recorded'}.`,
    problems.length ? `WHAT THE DATA CANNOT SAY — ${problems.join('; ')}.` : 'The data is complete for this reading.',
  ].join('\n');
  return { facts, problems, sources, brief };
}

/* ============================================================
   MERIDIAN — the Quartermaster. Operational: the chain and its bottlenecks.
   ============================================================ */
export async function meridianEvidence(db, { now = new Date() } = {}) {
  const [products, lots, settings, dispatch, items] = await Promise.all([table(db, 'products'), table(db, 'stock_lots'), table(db, 'settings'), table(db, 'dispatch'), table(db, 'dispatch_items', { limit: 5000 })]);
  const problems = [], sources = [];
  for (const [n, r] of [['products', products], ['stock_lots', lots], ['settings', settings], ['dispatch', dispatch], ['dispatch_items', items]]) { if (r === null) problems.push(`the ${n} table could not be read`); else sources.push(src(n, r)); }
  const s = settingsOf(settings || []);
  const lines = stockLines(products || [], lots || [], s);
  const lab = labSummary(products || [], lots || [], settings || [], dispatch || [], items || []);
  const t = now.getTime();
  // Cover: vials on hand against what shipped in the last 30 days, per product.
  const shipped30 = realised(dispatch || [], items || [], { from: new Date(t - 30 * DAY).toISOString().slice(0, 10) });
  const outBy = Object.fromEntries(shipped30.byProduct.map((p) => [p.id, p.vials]));
  const cover = lines.filter((l) => l.vials > 0 || outBy[l.id]).map((l) => { const out = outBy[l.id] || 0; return { id: l.id, name: `${l.name} ${l.size}`.trim(), vials: l.vials, out30: out, days: out ? Math.round(l.vials / (out / 30)) : null, coa: l.coa, margin: l.margin, low: l.low }; }).sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
  const queue = (dispatch || []).filter((d) => ['packing', 'ready'].includes(d.stage)).map((d) => ({ id: d.id, ref: d.ref, stage: d.stage, age_days: Math.floor((t - new Date(d.created_at).getTime()) / DAY), lines: (items || []).filter((i) => i.dispatch_id === d.id).length, unpicked: (items || []).filter((i) => i.dispatch_id === d.id && !i.lot_id).length }));
  const lotRows = (lots || []).map((l) => ({ id: l.id, product: l.product_id, batch: l.batch, vials: l.vials, coa: l.coa, received: l.received, age_days: l.received ? Math.floor((t - new Date(l.received).getTime()) / DAY) : null }));
  if (!(lots || []).length) problems.push('no stock has been booked in — there is no chain to read, only a catalogue');
  if (!(items || []).length) problems.push('no dispatch lines recorded — nothing has drawn from a lot, so cover cannot be estimated');
  if (queue.some((q) => q.unpicked)) problems.push(`${queue.filter((q) => q.unpicked).length} dispatch(es) in the queue have lines with no lot picked`);
  if (lab.uncosted.length) problems.push(`${lab.uncosted.length} listed line(s) have no supplier cost`);
  if (lab.noCoa.length) problems.push(`${lab.noCoa.length} live line(s) have no published COA`);
  const facts = {
    settings: s, live: lab.live, vials: lab.vials, valueCost: lab.valueCost,
    cover, low: lab.low, noCoa: lab.noCoa, uncosted: lab.uncosted, thinnest: lab.thinnest,
    queue, shipped30: { dispatches: shipped30.dispatches, vials: shipped30.vials, revenue: shipped30.revenue, margin: shipped30.margin, incomplete: shipped30.incomplete.length },
    lots: lotRows.slice(0, 40),
  };
  const brief = [
    `SETTINGS — rate ${s.fx_gbp_per_usd} GBP/USD, landed overhead ${s.landed_overhead_pct}%, low-stock line ${s.low_stock_vials} vials.`,
    `STOCK — ${lab.vials} vials across ${lab.live} live lines, ${gbp(lab.valueCost)} at cost. Lots: ${lotRows.length ? lotRows.map((l) => `${l.id} ${l.product} ${l.batch || ''} ${l.vials} vials COA ${l.coa}${l.age_days !== null ? ` ${l.age_days}d old` : ''}`).join('; ') : 'none booked in'}.`,
    `COVER (last 30 days) — ${cover.length ? cover.map((c) => `${c.name}: ${c.vials} on hand, ${c.out30} out, ${c.days === null ? 'no rate' : `~${c.days} days`}${c.low ? ' LOW' : ''}${c.coa !== 'published' ? ` COA ${c.coa}` : ''}`).join('; ') : 'nothing has moved'}.`,
    `DISPATCH — queue ${queue.length}: ${queue.map((q) => `${q.ref} ${q.stage} ${q.age_days}d ${q.lines} lines${q.unpicked ? ` (${q.unpicked} without a lot)` : ''}`).join('; ') || 'empty'}. Shipped in 30 days: ${shipped30.dispatches} dispatches, ${shipped30.vials} vials, ${gbp(shipped30.revenue)}, margin ${pct(shipped30.margin)}${shipped30.incomplete.length ? `, ${shipped30.incomplete.length} lines uncosted` : ''}.`,
    `MARGINS — thinnest: ${lab.thinnest.map((x) => `${x.name} ${x.size} ${pct(x.margin)}`).join(', ') || 'none costed'}; without COA: ${lab.noCoa.map((x) => `${x.name} ${x.size}`).join(', ') || 'none'}; low: ${lab.low.map((x) => `${x.name} ${x.size} (${x.vials})`).join(', ') || 'none'}; uncosted listed: ${lab.uncosted.slice(0, 8).join(', ') || 'none'}.`,
    problems.length ? `WHAT THE DATA CANNOT SAY — ${problems.join('; ')}.` : 'The data is complete for this reading.',
  ].join('\n');
  return { facts, problems, sources, brief };
}

/* ============================================================
   VECTOR — the Strategist. Where the empire stands, and what to put to the Council.
   ============================================================ */
export async function vectorEvidence(db, { now = new Date() } = {}) {
  const a = await aggregate(db, { now });
  const problems = [], sources = [`orders (${a.active.open} open)`, `venture_focus (${a.ventures.filter((v) => v.rank).length} ranked)`, `list_items (${a.moves.now.length + a.moves.next.length + a.moves.other.length} moves)`, `decisions (${a.decisions.length})`, `signals (${a.signals.length}, computed)`];
  if (!a.ventures.some((v) => v.rank)) problems.push('no venture ranking has been set in THE WAR ROOM');
  if (!a.moves.now.length) problems.push('no move is tagged now');
  if (!a.money || a.money.revenue === null) problems.push(`no revenue typed for ${a.money?.month || 'this month'}`);
  if (a.waiting.proposals.length) problems.push(`${a.waiting.proposals.length} proposal(s) already waiting for an answer`);
  let recentRuns = [];
  try { recentRuns = (await runs.list(db, { limit: 8 })).map((r) => ({ id: r.id, agent: r.agent, status: r.status, objective: r.objective, at: r.started_at })); } catch {}
  const facts = {
    day: a.day, focus: a.today.focus,
    ventures: a.ventures.map((v) => ({ id: v.id, name: v.name, rank: v.rank, allocation: v.allocation, why: v.why, open: v.open, p0: v.p0, blocked: v.blocked, moves: v.moves, revenue: a.money?.ventures.find((m) => m.id === v.id)?.revenue ?? null, units: a.money?.ventures.find((m) => m.id === v.id)?.units ?? null, top: v.top ? { id: v.top.id, text: v.top.text, priority: v.top.priority, age_days: v.top.age_days } : null })),
    money: a.money ? { month: a.money.month, revenue: a.money.revenue, previous: a.money.previous, change: a.money.change, fixed: a.money.fixed, net: a.money.net, cash: a.money.cash, runway: a.money.runway === Infinity ? 'covered' : a.money.runway, realised: { profit: a.money.realised.profit, margin: a.money.realised.margin } } : null,
    moves: { now: a.moves.now.map((m) => m.text), next: a.moves.next.map((m) => m.text), stop: a.moves.stop.map((m) => m.text) },
    blocked: a.waiting.blocked.map((o) => ({ id: o.id, room: o.room_name, text: o.text, on: o.blocked_on, age_days: o.age_days })),
    stale: a.waiting.stale.map((o) => ({ id: o.id, room: o.room_name, text: o.text, age_days: o.age_days })),
    decisions: a.decisions.map((d) => ({ id: d.id, question: d.question, verdict: d.verdict, outcome: d.outcome || '', conditions: d.conditions })),
    signals: a.signals.map((s) => ({ id: s.id, severity: s.severity, room: s.room, text: s.text, answered: s.answered })),
    proposals: a.waiting.proposals.map((p) => ({ id: p.id, room: p.room_name, text: p.text, agent: p.agent_name })),
    runs: recentRuns,
  };
  const brief = [
    `DAY ${a.day.day}${a.today.focus ? ` — focus: ${a.today.focus}` : ' — no focus set'}.`,
    `VENTURES (rank order) — ${facts.ventures.map((v) => `${v.name}: rank ${v.rank || '—'}, ${v.allocation}${v.why ? ` (${v.why})` : ''}; revenue ${gbp(v.revenue)}${v.units !== null ? ` / ${v.units} units` : ''}; ${v.open} open, ${v.p0} P0, ${v.blocked} blocked, ${v.moves} moves${v.top ? `; top: [P${v.top.priority}] ${v.top.text} (${v.top.age_days}d)` : ''}`).join('\n  ')}.`,
    facts.money ? `MONEY — ${a.money.month}: revenue ${gbp(a.money.revenue)} (previous ${gbp(a.money.previous)}), fixed ${gbp(a.money.fixed)}, net ${gbp(a.money.net)}, cash ${a.money.cash ? `${gbp(a.money.cash.cash)} at ${a.money.cash.day}` : 'not typed'}, runway ${a.money.runway === null ? 'unknown' : a.money.runway === Infinity ? 'covered' : `${a.money.runway.toFixed(1)} months`}; realised profit ${gbp(a.money.realised.profit)} (${pct(a.money.realised.margin)}).` : 'MONEY — the Vault could not be read.',
    `MOVES — now: ${facts.moves.now.join(' | ') || 'none'}; next: ${facts.moves.next.join(' | ') || 'none'}; stop doing: ${facts.moves.stop.join(' | ') || 'none'}.`,
    `BLOCKED — ${facts.blocked.map((b) => `${b.room}: ${b.text} (on: ${b.on}, ${b.age_days}d)`).join('; ') || 'nothing'}. STALE P0 — ${facts.stale.map((s) => `${s.room}: ${s.text} (${s.age_days}d)`).join('; ') || 'none'}.`,
    `DECISIONS — ${facts.decisions.map((d) => `${d.id} ${d.verdict}: ${d.question}${d.outcome ? ` → ${d.outcome}` : ' (no outcome yet)'}`).join('; ') || 'none recorded'}.`,
    `SIGNALS — ${facts.signals.map((s) => `${s.severity} ${s.room}: ${s.text}${s.answered ? ' (work open)' : ''}`).join('; ') || 'quiet'}.`,
    `PROPOSALS WAITING — ${facts.proposals.map((p) => `${p.agent} → ${p.room}: ${p.text}`).join('; ') || 'none'}.`,
    problems.length ? `WHAT THE DATA CANNOT SAY — ${problems.join('; ')}.` : 'The data is complete for this reading.',
  ].join('\n');
  return { facts, problems, sources, brief };
}

/** A `trades` row in the shape journal.js computes over. */
function tradeShape(r) {
  return { id: r.id, entry: r.entry ?? '', stop: r.stop ?? '', target: r.target ?? '', exit: r.exit ?? '', risk: r.risk ?? '', opened: r.opened || '', closed: r.closed || '', planFollowed: !!r.plan_followed, ruleBreaks: r.rule_breaks || [], direction: r.direction, example: !!r.example };
}

export const EVIDENCE = { tally: tallyEvidence, meridian: meridianEvidence, vector: vectorEvidence };
