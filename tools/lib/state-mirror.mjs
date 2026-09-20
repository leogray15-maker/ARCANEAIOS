/**
 * The operating state, between the database and the vault.
 *
 *   importOrders    vault → database   06-Orders/Orders.md rows the database has not seen (by number), once
 *   mirrorOrders    database → vault   the two tables in Orders.md rebuilt from `orders`
 *   mirrorLists     database → vault   05-Knowledge/Lists.md from `list_items`
 *   mirrorDecisions database → vault   04-Records/Decisions/<id>.md and the Decision-Log rows from `decisions`
 *   mirrorCounsel   database → vault   04-Records/Counsel.md from `counsel_turns`
 *   mirrorFocus     database → vault   05-Knowledge/Focus.md from `venture_focus` and `days`
 *
 * The database is where the floor writes; these files are the record a
 * person reads in Obsidian. Orders.md keeps its prose above the tables
 * (ARCANE's hand); only the two tables are rewritten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOMS, ROOM_BY_ID, VENTURES, VENTURE_BY_ID, AGENT_BY_ID } from '../../packages/config/src/index.js';
import { serializeFrontmatter, writeGenerated, stamp, stampDate } from './brain.mjs';
import { state } from '../../packages/database/src/state.js';

const cell = (s) => String(s ?? '—').replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim() || '—';
const wiki = (room) => `[[${ROOM_BY_ID[room]?.name || room}]]`;
const day = (iso) => (iso ? stampDate(new Date(iso)) : '—');
const fm = (now, o) => serializeFrontmatter({ created: stamp(now), updated: stamp(now), status: 'active', generated: true, source: 'tools/vault-sync.mjs', ...o });

/** The rows of the two tables in Orders.md, as objects. */
export function readOrdersMd(brain) {
  const file = path.join(brain, '06-Orders', 'Orders.md');
  const text = fs.readFileSync(file, 'utf8');
  const openAt = text.indexOf('## Open'), closedAt = text.indexOf('## Closed');
  const rowsOf = (chunk) => chunk.split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*(#|---)/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  const roomId = (w) => ROOMS.find((r) => r.name === w.replace(/\[\[|\]\]/g, ''))?.id || 'bridge';
  const open = rowsOf(text.slice(openAt, closedAt)).map((c) => ({ n: Number(c[0]), text: c[1], room: roomId(c[2]), holder: c[3].replace(/\[\[|\]\]/g, ''), actor: c[4] === 'agent' ? 'agent' : 'human', priority: /^P?[0-3]$/.test(String(c[5]).trim()) ? Number(String(c[5]).trim().replace('P', '')) : 2, state: c[6] || 'open', blocked: c[7] === '—' ? '' : c[7] || '' }));
  const closed = rowsOf(text.slice(closedAt)).map((c) => ({ n: Number(c[0]), text: c[1], room: roomId(c[2]), outcome: c[3] || '', closed: c[4] || '' }));
  return { file, text, openAt, closedAt, open, closed };
}

/** Vault → database: every numbered row Orders.md has that the table does not. Returns the ids created. */
export async function importOrders(db, brain) {
  const have = new Set((await state.list(db, 'orders')).map((o) => o.brain_n).filter((n) => n !== null && n !== undefined));
  const md = readOrdersMd(brain);
  const made = [];
  for (const o of md.open) {
    if (have.has(o.n)) continue;
    const st = /done|killed/.test(o.state) ? (o.state.includes('killed') ? 'killed' : 'done') : ['open', 'active', 'blocked', 'review'].includes(o.state) ? o.state : o.blocked ? 'blocked' : 'open';
    const row = await state.insert(db, 'orders', { room: o.room, text: o.text, priority: o.priority, state: st, holder: o.holder || 'Leo', actor: o.actor, blocked_on: o.blocked, source: 'brain', brain_n: o.n }, { actor: 'tools/vault-sync.mjs' });
    made.push(row.id);
  }
  for (const o of md.closed) {
    if (have.has(o.n)) continue;
    const row = await state.insert(db, 'orders', { room: o.room, text: o.text, state: /kill/.test(o.outcome) ? 'killed' : 'done', holder: 'Leo', note: o.outcome, source: 'brain', brain_n: o.n, done_at: /^\d{4}-\d{2}-\d{2}$/.test(o.closed) ? `${o.closed}T12:00:00.000Z` : null }, { actor: 'tools/vault-sync.mjs' });
    made.push(row.id);
  }
  return made;
}

/** Database → vault: rebuild the Open and Closed tables. The prose above them is kept as it is. */
export async function mirrorOrders(db, brain, now = new Date()) {
  const md = readOrdersMd(brain);
  // A proposal is not on the board: it has no number and does not appear in
  // Orders.md until the operator has approved it. The vault is a mirror of
  // the work, not of what an agent has suggested.
  const rows = (await state.list(db, 'orders')).filter((o) => o.state !== 'proposed');
  let n = Math.max(0, ...rows.map((o) => o.brain_n || 0), ...md.open.map((o) => o.n), ...md.closed.map((o) => o.n));
  const numbered = rows.map((o) => ({ ...o, n: o.brain_n ?? ++n }));
  // Numbers minted here go back to the database so the next sync matches by number, not by text.
  for (const o of numbered) if (o.brain_n === null || o.brain_n === undefined) await db.patch('orders', { id: `eq.${o.id}` }, { brain_n: o.n }, { returning: false });
  const open = numbered.filter((o) => !['done', 'killed'].includes(o.state)).sort((a, b) => a.priority - b.priority || a.n - b.n);
  const closed = numbered.filter((o) => ['done', 'killed'].includes(o.state)).sort((a, b) => a.n - b.n);
  const holder = (o) => (o.actor === 'agent' ? `[[${AGENT_BY_ID[ROOM_BY_ID[o.room]?.agent]?.name || o.holder || 'agent'}]]` : cell(o.holder || 'Leo'));
  const openRows = open.map((o) => `| ${o.n} | ${cell(o.text)} | ${wiki(o.room)} | ${holder(o)} | ${o.actor} | P${o.priority} | ${o.state} | ${cell(o.blocked_on || '—')} |`);
  const closedRows = closed.map((o) => `| ${o.n} | ${cell(o.text)} | ${wiki(o.room)} | ${o.state}${o.note ? ` — ${cell(o.note)}` : ''} | ${day(o.done_at || o.updated_at)} |`);
  const head = (chunk) => chunk.split('\n').filter((l) => !/^\|/.test(l) || /^\|\s*(#|---)/.test(l)).join('\n').replace(/\s*$/, '');
  const text = md.text;
  const next = `${text.slice(0, md.openAt)}${head(text.slice(md.openAt, md.closedAt))}\n${openRows.join('\n') || '| — | nothing open | — | — | — | — | — | — |'}\n\n${head(text.slice(md.closedAt))}\n${closedRows.join('\n')}\n`.replace(/^updated: .*$/m, `updated: ${stamp(now)}`);
  if (next === text) return 'unchanged';
  fs.writeFileSync(md.file, next);
  return 'updated';
}

export async function mirrorLists(db, brain, now = new Date()) {
  const items = await state.list(db, 'list_items');
  const NAMES = { moves: 'Moves', stop: 'Stop doing', watch: 'Watchlist', pipeline: 'Pipeline', ideas: 'Ideas' };
  const body = Object.entries(NAMES).map(([k, name]) => {
    const open = items.filter((i) => i.list === k && !i.done).sort((a, b) => a.position - b.position);
    const done = items.filter((i) => i.list === k && i.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')).slice(0, 20);
    return `## ${name}\n\n${open.length ? open.map((it) => `- ${cell(it.text)}${it.tag ? ` \`${it.tag}\`` : ''}${it.venture ? ` — ${VENTURE_BY_ID[it.venture]?.name || it.venture}` : ''} — ${day(it.created_at)}`).join('\n') : '- —'}${done.length ? `\n\nDone:\n\n${done.map((it) => `- ~~${cell(it.text)}~~${it.outcome ? ` — ${cell(it.outcome)}` : ''} — ${day(it.done_at)}`).join('\n')}` : ''}`;
  }).join('\n\n');
  return writeGenerated(path.join(brain, '05-Knowledge', 'Lists.md'), fm(now, { type: 'lists', agent: 'ARCANE', tags: ['knowledge', 'lists'] }) + `# Lists\n\nThe boards from the floor — moves and stop-doing (THE WAR ROOM), watchlist, pipeline, ideas — as they stand in the database. Edit them on the site; this file follows.\n\n${body}\n`, { write: true });
}

export async function mirrorDecisions(db, brain, now = new Date()) {
  const rows = await state.list(db, 'decisions', { limit: 500 });
  const dir = path.join(brain, '04-Records', 'Decisions');
  const logF = path.join(brain, '04-Records', 'Decision-Log.md');
  let log = fs.existsSync(logF) ? fs.readFileSync(logF, 'utf8') : '';
  const report = { written: 0, unchanged: 0 };
  for (const d of rows) {
    const body = fm(now, { type: 'decision', id: d.id, agent: 'ARCANE', verdict: d.verdict, outcome: d.outcome, decided: stamp(new Date(d.created_at)), tags: ['records', 'decision', 'council'] })
      + `# ${d.id} — ${cell(d.question)}\n\n**Verdict:** ${d.verdict}\n\n${cell(d.summary)}\n\n## Positions\n\n${(d.positions || []).length ? `| Seat | Lean | Position |\n| --- | --- | --- |\n${d.positions.map((p) => `| [[${cell(p.seat || p.agent)}]] | ${cell(p.leans || p.lean)} | ${cell(p.position || p.text)} |`).join('\n')}` : '—'}\n\n## Conditions\n\n${(d.conditions || []).length ? d.conditions.map((c) => `- ${cell(c)}`).join('\n') : '- —'}\n\n## Dissent\n\n${cell(d.dissent || '—')}\n\n## Outcome\n\n${d.outcome ? `${cell(d.outcome)} — reviewed ${d.reviewed_at ? stamp(new Date(d.reviewed_at)) : '—'}` : '— (fill in later; that is the point)'}\n`;
    const r = writeGenerated(path.join(dir, `${d.id}.md`), body, { write: true });
    if (r === 'unchanged') report.unchanged++; else report.written++;
    const row = `| ${day(d.created_at)} | [[04-Records/Decisions/${d.id}\\|${cell(d.question)}]] | ${d.verdict} | ${d.source === 'council' ? 'Council' : 'Leo'} | ${cell(d.outcome || '—')} |`;
    if (log && !log.includes(d.id)) log = log.replace(/\s*$/, '') + `\n${row}\n`;
    else if (log) log = log.split('\n').map((l) => (l.includes(d.id) ? row : l)).join('\n');
  }
  if (log && log !== fs.readFileSync(logF, 'utf8')) fs.writeFileSync(logF, log.replace(/^updated: .*$/m, `updated: ${stamp(now)}`));
  return report;
}

export async function mirrorCounsel(db, brain, now = new Date()) {
  const turns = await state.list(db, 'counsel_turns', { limit: 200 });
  return writeGenerated(path.join(brain, '04-Records', 'Counsel.md'), fm(now, { type: 'counsel', agent: 'ARCANE', tags: ['records', 'counsel'] }) + `# Counsel\n\nThe last ${turns.length} turns with ARCANE on the [[BRIDGE]], from the database.\n\n${turns.length ? turns.map((c) => `**${c.who === 'leo' ? 'Leo' : 'ARCANE'}** · ${stamp(new Date(c.created_at))}${c.specialist ? ` · via [[${c.specialist}]]` : ''}\n\n${String(c.text || '').trim()}${c.proposal ? `\n\n> order → ${wiki(c.proposal.room)}: ${cell(c.proposal.text)} (${c.proposal.priority || 'P2'})` : ''}`).join('\n\n---\n\n') : '—'}\n`, { write: true });
}

export async function mirrorFocus(db, brain, now = new Date()) {
  const [focus, days] = await Promise.all([state.list(db, 'venture_focus'), state.list(db, 'days', { limit: 30 })]);
  const ranked = VENTURES.map((v) => ({ v, f: focus.find((x) => x.venture === v.id) || { rank: 0, allocation: 'maintain', why: '' } })).sort((a, b) => (a.f.rank || 9) - (b.f.rank || 9));
  const body = `# Focus\n\nWhich venture gets the next hour and the next pound — set in [[THE WAR ROOM]] — and the last ${days.length} days' focus lines from the [[BRIDGE]].\n\n## The ranking\n\n| Rank | Venture | Allocation | Why |\n| --- | --- | --- | --- |\n${ranked.map(({ v, f }, i) => `| ${f.rank || i + 1} | [[${ROOM_BY_ID[v.room]?.name || v.name}\\|${v.name}]] | ${f.allocation} | ${cell(f.why || '—')} |`).join('\n')}\n\n## Days\n\n| Day | Focus | Energy | Sleep |\n| --- | --- | --- | --- |\n${days.length ? days.map((d) => `| ${d.day} | ${cell(d.focus || '—')} | ${d.energy ?? '—'} | ${d.sleep ?? '—'} |`).join('\n') : '| — | — | — | — |'}\n`;
  return writeGenerated(path.join(brain, '05-Knowledge', 'Focus.md'), fm(now, { type: 'focus', agent: 'VECTOR', tags: ['knowledge', 'focus'] }) + body, { write: true });
}

/** THE LAB → 05-Knowledge/Lab.md: the catalogue with cost, price and margin; stock by lot; the dispatch queue. */
export async function mirrorLab(db, brain, now = new Date()) {
  const { labSummary, stockLines, settingsOf } = await import('../../apps/facility/src/core/lab.js');
  const [products, lots, settings, dispatch] = await Promise.all([state.list(db, 'products'), state.list(db, 'stock_lots'), state.list(db, 'settings'), state.list(db, 'dispatch')]);
  const s = settingsOf(settings); const sum = labSummary(products, lots, settings, dispatch);
  const lines = stockLines(products, lots, s).filter((l) => l.listed || l.vials > 0).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const gbp = (n) => (n === null || n === undefined ? '—' : `£${Number(n).toFixed(2)}`);
  const pct = (m) => (m === null || m === undefined ? '—' : `${Math.round(m * 100)}%`);
  const body = `# The Lab\n\nArcane Peptides as operations, from the database. Rate £${s.fx_gbp_per_usd}/$ · landed +${s.landed_overhead_pct}% · low under ${s.low_stock_vials} vials. ${sum.vials} vials in ${sum.live} lines · COA ${sum.coaPct === null ? '—' : `${sum.coaPct}%`} · stock ${gbp(sum.valueCost)} at cost, ${gbp(sum.valueSell)} at price · average margin ${pct(sum.avgMargin)}. Nothing here is a claim about what a compound does.\n\n## Catalogue\n\n| Product | Size | Category | Code | Kit $ | Cost / vial | Price | Margin | Vials | COA | Note |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${lines.map((l) => `| ${cell(l.name)} | ${cell(l.size || '—')} | ${cell(l.category || '—')} | ${cell(l.supplier_code || '—')} | ${l.kit_cost_usd ?? '—'} | ${gbp(l.cost)} | ${gbp(l.sell)} | ${pct(l.margin)} | ${l.vials} | ${l.vials ? l.coa : '—'} | ${cell(l.note || '—')} |`).join('\n') || '| — | | | | | | | | | | |'}\n\n## Lots\n\n| Lot | Product | Batch | Vials | COA | Received |\n| --- | --- | --- | --- | --- | --- |\n${lots.length ? lots.map((l) => { const p = products.find((x) => x.id === l.product_id); return `| ${l.id} | ${cell(p ? `${p.name} ${p.size}` : l.product_id)} | ${cell(l.batch || '—')} | ${l.vials} | ${l.coa} | ${l.received || '—'} |`; }).join('\n') : '| — | | | | | |'}\n\n## Dispatch\n\n| Ref | Items | Stage | Tracking | Created |\n| --- | --- | --- | --- | --- |\n${dispatch.length ? dispatch.slice(0, 50).map((d) => `| ${cell(d.ref)} | ${cell(d.items || '—')} | ${d.stage} | ${cell(d.tracking || '—')} | ${day(d.created_at)} |`).join('\n') : '| — | | | | |'}\n`;
  return writeGenerated(path.join(brain, '05-Knowledge', 'Lab.md'), fm(now, { type: 'lab', agent: 'MERIDIAN', tags: ['knowledge', 'lab', 'peptides'] }) + body, { write: true });
}

/** SANCTUM's protocol → 04-Records/Protocol.md: items, streaks, the last 30 days. Entries are never mirrored. */
export async function mirrorProtocol(db, brain, now = new Date()) {
  const [items, ticks] = await Promise.all([state.list(db, 'protocol_items'), state.list(db, 'protocol_ticks', { limit: 2000 })]);
  const active = items.filter((i) => i.active !== false).sort((a, b) => a.position - b.position);
  const done = new Set(ticks.filter((t) => t.done).map((t) => `${t.day}:${t.item_id}`));
  const days = [...new Set(ticks.map((t) => t.day))].sort().slice(-30);
  const streak = (id) => { let n = 0; const d = new Date(now); for (;;) { const k = stampDate(d); if (!done.has(`${k}:${id}`)) break; n++; d.setDate(d.getDate() - 1); if (n > 400) break; } return n; };
  const body = `# Protocol\n\nThe operator is a system component, maintained like one. Ticked in [[SANCTUM]]; the last ${days.length} days.\n\n| Item | Target | Streak |\n| --- | --- | --- |\n${active.map((i) => `| ${cell(i.name)} | ${i.target} ${cell(i.unit)} | ${streak(i.id)} |`).join('\n')}\n\n| Day | ${active.map((i) => cell(i.name)).join(' | ')} | Done |\n| --- | ${active.map(() => '---').join(' | ')} | --- |\n${days.length ? days.map((d) => `| ${d} | ${active.map((i) => (done.has(`${d}:${i.id}`) ? 'x' : '·')).join(' | ')} | ${active.filter((i) => done.has(`${d}:${i.id}`)).length} / ${active.length} |`).join('\n') : `| — | ${active.map(() => '·').join(' | ')} | — |`}\n`;
  return writeGenerated(path.join(brain, '04-Records', 'Protocol.md'), fm(now, { type: 'protocol', agent: 'PULSE', tags: ['records', 'protocol'] }) + body, { write: true });
}

/** THE TRADING FLOOR → 04-Records/Journal/<id>.md and Journal-Log.md, from the trades table. */
export async function mirrorJournal(db, brain, now = new Date()) {
  const { derive, stats } = await import('../../apps/facility/src/core/journal.js');
  const rows = await state.list(db, 'trades', { limit: 5000 });
  const trades = rows.map((r) => ({ ...r, planFollowed: !!r.plan_followed, ruleBreaks: r.rule_breaks || [], emotionBefore: r.emotion_before, emotionDuring: r.emotion_during, emotionAfter: r.emotion_after }));
  const dir = path.join(brain, '04-Records', 'Journal');
  const report = { written: 0, unchanged: 0 };
  for (const t of trades) {
    const d = derive(t);
    const body = fm(now, { type: 'trade', id: t.id, agent: 'TALLY', instrument: t.instrument || '', direction: t.direction || '', setup: t.setup || '', grade: t.grade || '', outcome: d.outcome, r: d.r === null ? '' : Number(d.r.toFixed(2)), pnl: d.pnl === null ? '' : Number(d.pnl.toFixed(2)), opened: t.opened ? stamp(new Date(t.opened)) : '', closed: t.closed ? stamp(new Date(t.closed)) : '', tags: ['records', 'journal', ...(t.example ? ['example'] : [])] })
      + `# ${t.id} — ${t.instrument || '—'} ${t.direction || ''} · ${d.outcome}\n\n| Field | Value |\n| --- | --- |\n${[['Opened', t.opened ? stamp(new Date(t.opened)) : ''], ['Closed', t.closed ? stamp(new Date(t.closed)) : ''], ['Session', t.session], ['Killzone', t.killzone], ['Setup', t.setup], ['Bias', t.bias], ['Grade', t.grade], ['Conviction', t.conviction], ['Entry', t.entry], ['Stop', t.stop], ['Target', t.target], ['Exit', t.exit], ['Risk', t.risk], ['Size', t.size], ['Planned R', d.plannedR?.toFixed?.(2)], ['R', d.r?.toFixed?.(2)], ['P&L', d.pnl?.toFixed?.(2)], ['Hold (min)', d.hold], ['Plan followed', t.planFollowed ? 'yes' : 'no'], ['Rule breaks', t.ruleBreaks.join(', ')], ['Emotion before', t.emotionBefore], ['Emotion after', t.emotionAfter], ['Energy', t.energy], ['Sleep', t.sleep], ['Process', t.process]].map(([k, v]) => `| ${k} | ${cell(v)} |`).join('\n')}\n\n## Before\n\n${cell(t.thesis || '—')}\n\n## During\n\n${cell(t.execution || '—')}${t.emotionDuring ? ` (${cell(t.emotionDuring)})` : ''}\n\n## After\n\n${cell(t.review || '—')}${t.lesson ? `\n\n**Lesson:** ${cell(t.lesson)}` : ''}${t.chart ? `\n\nChart: ${cell(t.chart)}` : ''}\n`;
    const r = writeGenerated(path.join(dir, `${t.id}.md`), body, { write: true });
    if (r === 'unchanged') report.unchanged++; else report.written++;
  }
  const closed = trades.filter((t) => derive(t).r !== null), s = stats(closed);
  const lines = [...trades].sort((a, b) => String(b.opened || '').localeCompare(String(a.opened || ''))).map((t) => { const d = derive(t); return `| [[04-Records/Journal/${t.id}\\|${t.id}]] | ${t.opened ? String(t.opened).slice(0, 10) : '—'} | ${cell(t.instrument)} | ${cell(t.direction)} | ${cell(t.setup)} | ${cell(t.grade)} | ${d.outcome} | ${d.r === null ? '—' : d.r.toFixed(2)} | ${t.planFollowed ? 'yes' : 'no'} |`; });
  writeGenerated(path.join(brain, '04-Records', 'Journal-Log.md'), fm(now, { type: 'log', agent: 'TALLY', tags: ['records', 'journal'] }) + `# Journal Log\n\nOne row per trade from [[THE TRADING FLOOR]]; the full record is in \`Journal/\`. ${closed.length} closed · win rate ${Math.round((s.winRate || 0) * 100)}% · ${(s.totalR || 0).toFixed(1)}R · max drawdown ${(s.maxDD || 0).toFixed(1)}R.\n\n| Trade | Day | Instrument | Dir | Setup | Grade | Outcome | R | Plan |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${lines.length ? lines.join('\n') : '| — | | | | | | | | |'}\n`, { write: true });
  return report;
}

/** THE VAULT → 05-Knowledge/Money.md: the months, the fixed costs, cash, the pots. */
export async function mirrorMoney(db, brain, now = new Date()) {
  const { moneySummary, history, monthOf } = await import('../../apps/facility/src/core/money.js');
  const [ledger, fixed, cash, pots] = await Promise.all([state.list(db, 'ledger_months'), state.list(db, 'fixed_costs'), state.list(db, 'cash_snapshots'), state.list(db, 'pots')]);
  const m = moneySummary({ ledger, fixed, cash, pots }, monthOf(now)); const h = history(ledger, fixed, 24);
  const gbp = (n) => (n === null || n === undefined ? '—' : `£${Math.round(n).toLocaleString('en-GB')}`);
  const body = `# Money\n\nThe treasury as typed in [[THE VAULT]]. This month (${m.month}): revenue ${gbp(m.revenue)} · fixed ${gbp(m.fixed)} · net ${gbp(m.net)} · cash ${m.cash ? `${gbp(m.cash.cash)} (${m.cash.day})` : '—'} · runway ${m.runway === null ? '—' : m.runway === Infinity ? 'covered' : `${m.runway.toFixed(1)} months`}.\n\n## Months\n\n| Month | ${VENTURES.map((v) => v.name).join(' | ')} | Revenue | Fixed | Net |\n| --- | ${VENTURES.map(() => '---').join(' | ')} | --- | --- | --- |\n${h.length ? h.map((r) => `| ${r.month} | ${VENTURES.map((v) => gbp(r.byVenture[v.id])).join(' | ')} | ${gbp(r.revenue)} | ${gbp(r.fixed)} | ${gbp(r.net)} |`).join('\n') : `| — | ${VENTURES.map(() => '—').join(' | ')} | — | — | — |`}\n\n## Fixed costs\n\n| Line | £ / month | Room |\n| --- | --- | --- |\n${fixed.filter((f) => f.active !== false).map((f) => `| ${cell(f.name)} | ${gbp(f.amount_gbp)} | ${cell(f.room || '—')} |`).join('\n') || '| — | — | — |'}\n\n## Cash\n\n| Day | Cash | Note |\n| --- | --- | --- |\n${cash.slice().sort((a, b) => String(b.day).localeCompare(String(a.day))).slice(0, 24).map((c) => `| ${c.day} | ${gbp(c.cash_gbp)} | ${cell(c.note || '—')} |`).join('\n') || '| — | — | — |'}\n\n## The split\n\n| Pot | % | This month |\n| --- | --- | --- |\n${m.pots.map((p) => `| ${cell(p.name)} | ${p.pct}% | ${gbp(p.amount)} |`).join('\n')}\n`;
  return writeGenerated(path.join(brain, '05-Knowledge', 'Money.md'), fm(now, { type: 'money', agent: 'TALLY', tags: ['knowledge', 'money', 'treasury'] }) + body, { write: true });
}
