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
  const rows = await state.list(db, 'orders');
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
