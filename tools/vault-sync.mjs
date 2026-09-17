#!/usr/bin/env node
/**
 * Bring the floor's decisions back into the vault.
 *
 *   npm run vault:sync
 *
 * On the site, everything the operator does is stored in that device's row
 * in Supabase, keyed by its sync code (or only in the browser, which this
 * cannot see). This reads every row with the service-role key — server-
 * side only, from .env, never in the bundle — folds them into one state,
 * and lands each part where the vault keeps it:
 *
 *   draft marks      → the draft's frontmatter, its folder, Content-Log, the board
 *   orders           → 06-Orders/Orders.md (new rows in Open; done rows move to Closed)
 *   lists            → 05-Knowledge/Lists.md            (generated)
 *   protocol         → 04-Records/Protocol.md           (generated)
 *   journal trades   → 04-Records/Journal/<id>.md + Journal-Log.md (generated)
 *   decisions        → 04-Records/Decisions/<id>.md + rows in Decision-Log.md
 *   counsel          → 04-Records/Counsel.md            (generated)
 *
 * then writes the brief. The vault stays the truth; the site is how it was
 * decided. Needs SUPABASE_SERVICE_ROLE_KEY in .env; without it, says so.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOMS, ROOM_BY_ID, AGENT_BY_ID } from '../packages/config/src/index.js';
import { brainDir, REPO, parseFrontmatter, serializeFrontmatter, writeGenerated, stamp, stampDate } from './lib/brain.mjs';
import { floorState } from './lib/state.mjs';
import { derive, stats } from '../apps/facility/src/core/journal.js';
import { PROTOCOL } from '../apps/facility/src/config/roomdata.js';

const { state, reason } = await floorState().catch((e) => ({ state: null, reason: e.message }));
if (!state) { console.log(`· vault:sync skipped — ${reason}`); process.exit(0); }
const brain = brainDir();
const now = new Date();
const W = { write: true };
const cell = (s) => String(s ?? '—').replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim() || '—';
const wiki = (room) => `[[${ROOM_BY_ID[room]?.name || room}]]`;
const fmt = (ts) => (ts ? stamp(new Date(ts)) : '—');
const fm = (o) => serializeFrontmatter({ created: stamp(now), updated: stamp(now), status: 'active', generated: true, source: 'tools/vault-sync.mjs', ...o });
const report = {};
const note = (k, r) => { report[k] = report[k] || {}; report[k][r] = (report[k][r] || 0) + 1; };

/* ---------- drafts ---------- */
const marks = state.drafts || {};
const FOLDER = { draft: 'Drafts', review: 'Drafts', approved: 'Approved', scheduled: 'Approved', posted: 'Posted', killed: 'Killed' };
const files = [];
for (const folder of ['Drafts', 'Approved', 'Posted', 'Killed']) { const dir = path.join(brain, '02-Content', folder); if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) files.push({ folder, f, p: path.join(dir, f) }); }
let draftsChanged = 0;
for (const { folder, f, p } of files) {
  const text = fs.readFileSync(p, 'utf8'); const { data, body } = parseFrontmatter(text);
  if (data?.type !== 'content-draft' || !marks[data.id]) continue;
  const next = marks[data.id].status;
  if (!FOLDER[next] || next === data.status) continue;
  const when = new Date(marks[data.id].ts || Date.now());
  const nfm = { ...data, status: next, updated: stamp(when) };
  if (next === 'approved' && !nfm.approved_by) nfm.approved_by = 'Leo';
  if (next === 'posted' && !nfm.posted_at) nfm.posted_at = stamp(when);
  const dest = path.join(brain, '02-Content', FOLDER[next], f);
  fs.writeFileSync(p, serializeFrontmatter(nfm) + body);
  if (dest !== p) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.renameSync(p, dest); }
  draftsChanged++;
  console.log(`  ${data.id}: ${data.status} → ${next}${FOLDER[next] !== folder ? ` (moved to ${FOLDER[next]}/)` : ''}`);
}
const logFile = path.join(brain, '02-Content', 'Content-Log.md');
if (draftsChanged && fs.existsSync(logFile)) {
  const lines = fs.readFileSync(logFile, 'utf8').split('\n').map((line) => {
    const c = line.split('|'); if (c.length < 10 || !c[1].trim().startsWith('HER-')) return line;
    const id = c[1].trim(); if (!marks[id]) return line; c[8] = ` ${marks[id].status} `; return c.join('|');
  });
  fs.writeFileSync(logFile, lines.join('\n'));
}
if (draftsChanged) spawnSync('node', [path.join(REPO, 'tools', 'content-board.mjs')], { stdio: 'inherit' });

/* ---------- orders ---------- */
// Orders.md is ARCANE's hand-kept file; only its two tables are touched.
{
  const file = path.join(brain, '06-Orders', 'Orders.md');
  const text = fs.readFileSync(file, 'utf8');
  const openAt = text.indexOf('## Open'), closedAt = text.indexOf('## Closed');
  const rowsOf = (chunk) => chunk.split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*(#|---)/.test(l));
  const openRows = rowsOf(text.slice(openAt, closedAt)), closedRows = rowsOf(text.slice(closedAt));
  const parse = (l) => l.split('|').slice(1, -1).map((c) => c.trim());
  const doneText = new Set(Object.values(state.orders).flat().filter((o) => o.done).map((o) => o.t));
  const known = new Set([...openRows, ...closedRows].map((l) => parse(l)[1]));
  let n = Math.max(0, ...[...openRows, ...closedRows].map((l) => Number(parse(l)[0]) || 0));
  const stillOpen = [], nowClosed = [];
  for (const l of openRows) { const c = parse(l); if (doneText.has(c[1])) nowClosed.push(`| ${c[0]} | ${c[1]} | ${c[2]} | done | ${stampDate(now)} |`); else stillOpen.push(l); }
  for (const [room, list] of Object.entries(state.orders)) for (const o of [...list].reverse()) {
    if (o.fromBrain || known.has(o.t)) continue;
    n++; const holder = o.holder === 'Leo' || !ROOM_BY_ID[room]?.agent ? 'Leo' : `[[${AGENT_BY_ID[ROOM_BY_ID[room].agent].name}]]`;
    if (o.done) nowClosed.push(`| ${n} | ${cell(o.t)} | ${wiki(room)} | done | ${stampDate(new Date(o.ts || now))} |`);
    else stillOpen.push(`| ${n} | ${cell(o.t)} | ${wiki(room)} | ${holder} | ${holder === 'Leo' ? 'human' : 'agent'} | P${o.p} | open | ${cell(o.blocked || '—')} |`);
  }
  const head = (chunk) => chunk.split('\n').filter((l) => !/^\|/.test(l) || /^\|\s*(#|---)/.test(l)).join('\n').replace(/\s*$/, '');
  const next = `${text.slice(0, openAt)}${head(text.slice(openAt, closedAt))}\n${stillOpen.join('\n')}\n\n${head(text.slice(closedAt))}\n${[...closedRows, ...nowClosed].join('\n')}\n`;
  if (next !== text) { fs.writeFileSync(file, next.replace(/^updated: .*$/m, `updated: ${stamp(now)}`)); note('orders', 'updated'); } else note('orders', 'unchanged');
}

/* ---------- lists ---------- */
{
  const NAMES = { watch: 'Watchlist', pipeline: 'Pipeline', ideas: 'Ideas', moves: 'Moves', stop: 'Stop doing' };
  const body = Object.entries(NAMES).map(([k, name]) => { const items = state.lists?.[k] || []; return `## ${name}\n\n${items.length ? items.map((it) => `- ${cell(it.text)}${it.tag ? ` \`${it.tag}\`` : ''} — ${stampDate(new Date(it.ts || now))}`).join('\n') : '- —'}`; }).join('\n\n');
  note('lists', writeGenerated(path.join(brain, '05-Knowledge', 'Lists.md'), fm({ type: 'lists', agent: 'ARCANE', tags: ['knowledge', 'lists'] }) + `# Lists\n\nThe boards from the floor — watchlist, pipeline, ideas, moves, stop-doing — as they stand. Edit them on the site; this file follows.\n\n${body}\n`, W));
}

/* ---------- protocol ---------- */
{
  const days = Object.keys(state.protocol || {}).sort().slice(-30);
  const items = PROTOCOL.rows.map((r) => r.item);
  const rows = days.map((d) => `| ${d} | ${items.map((it) => (state.protocol[d]?.[it] ? 'x' : '·')).join(' | ')} | ${Object.values(state.protocol[d] || {}).filter(Boolean).length} / ${items.length} |`);
  const streak = (item) => { let n = 0; const d = new Date(now); for (;;) { const k = d.toISOString().slice(0, 10); if (!state.protocol?.[k]?.[item]) break; n++; d.setDate(d.getDate() - 1); } return n; };
  note('protocol', writeGenerated(path.join(brain, '04-Records', 'Protocol.md'), fm({ type: 'protocol', agent: 'PULSE', tags: ['records', 'protocol'] }) + `# Protocol\n\n${PROTOCOL.source} Ticked in [[SANCTUM]]; the last ${days.length} days.\n\n| Item | Target | Streak |\n| --- | --- | --- |\n${PROTOCOL.rows.map((r) => `| ${r.item} | ${r.target} ${r.unit} | ${streak(r.item)} |`).join('\n')}\n\n| Day | ${items.join(' | ')} | Done |\n| --- | ${items.map(() => '---').join(' | ')} | --- |\n${rows.length ? rows.join('\n') : `| — | ${items.map(() => '·').join(' | ')} | — |`}\n`, W));
}

/* ---------- journal ---------- */
{
  const trades = state.journal?.trades || [];
  const dir = path.join(brain, '04-Records', 'Journal');
  for (const t of trades) {
    const d = derive(t);
    const body = fm({ type: 'trade', id: t.id, agent: 'TALLY', instrument: t.instrument || '', direction: t.direction || '', setup: t.setup || '', grade: t.grade || '', outcome: d.outcome, r: d.r === null ? '' : Number(d.r.toFixed(2)), pnl: d.pnl === null ? '' : Number(d.pnl.toFixed(2)), opened: t.opened || '', closed: t.closed || '', tags: ['records', 'journal', ...(t.example ? ['example'] : [])] })
      + `# ${t.id} — ${t.instrument || '—'} ${t.direction || ''} · ${d.outcome}\n\n`
      + `| Field | Value |\n| --- | --- |\n${[['Opened', t.opened], ['Closed', t.closed], ['Session', t.session], ['Killzone', t.killzone], ['Setup', t.setup], ['Bias', t.bias], ['Grade', t.grade], ['Conviction', t.conviction], ['Entry', t.entry], ['Stop', t.stop], ['Target', t.target], ['Exit', t.exit], ['Risk', t.risk], ['Size', t.size], ['Planned R', d.plannedR?.toFixed?.(2)], ['R', d.r?.toFixed?.(2)], ['P&L', d.pnl?.toFixed?.(2)], ['Hold (min)', d.hold], ['Plan followed', t.planFollowed ? 'yes' : 'no'], ['Rule breaks', (t.ruleBreaks || []).join(', ')], ['Emotion before', t.emotionBefore], ['Emotion after', t.emotionAfter], ['Energy', t.energy], ['Sleep', t.sleep], ['Process', t.process]].map(([k, v]) => `| ${k} | ${cell(v)} |`).join('\n')}\n\n`
      + `## Before\n\n${cell(t.thesis || '—')}\n\n## During\n\n${cell(t.execution || '—')}${t.emotionDuring ? ` (${cell(t.emotionDuring)})` : ''}\n\n## After\n\n${cell(t.review || '—')}${t.lesson ? `\n\n**Lesson:** ${cell(t.lesson)}` : ''}${t.chart ? `\n\nChart: ${cell(t.chart)}` : ''}\n`;
    note('trades', writeGenerated(path.join(dir, `${t.id}.md`), body, W));
  }
  const closed = trades.filter((t) => derive(t).r !== null), s = stats(closed);
  const rows = [...trades].sort((a, b) => (b.opened || '').localeCompare(a.opened || '')).map((t) => { const d = derive(t); return `| [[04-Records/Journal/${t.id}\\|${t.id}]] | ${(t.opened || '').slice(0, 10)} | ${cell(t.instrument)} | ${cell(t.direction)} | ${cell(t.setup)} | ${cell(t.grade)} | ${d.outcome} | ${d.r === null ? '—' : d.r.toFixed(2)} | ${t.planFollowed ? 'yes' : 'no'} |`; });
  note('journal-log', writeGenerated(path.join(brain, '04-Records', 'Journal-Log.md'), fm({ type: 'log', agent: 'TALLY', tags: ['records', 'journal'] }) + `# Journal Log\n\nOne row per trade from [[THE TRADING FLOOR]]; the full record is in \`Journal/\`. ${closed.length} closed · win rate ${Math.round(s.winRate * 100)}% · ${s.totalR.toFixed(1)}R · max drawdown ${s.maxDD.toFixed(1)}R.\n\n| Trade | Day | Instrument | Dir | Setup | Grade | Outcome | R | Plan |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.length ? rows.join('\n') : '| — | | | | | | | | |'}\n`, W));
}

/* ---------- decisions ---------- */
{
  const dir = path.join(brain, '04-Records', 'Decisions');
  const logF = path.join(brain, '04-Records', 'Decision-Log.md');
  let log = fs.readFileSync(logF, 'utf8');
  for (const d of [...(state.decisions || [])].reverse()) {
    const body = fm({ type: 'decision', id: d.id, agent: 'ARCANE', verdict: d.verdict || '', outcome: d.outcome || '', decided: fmt(d.ts), tags: ['records', 'decision', 'council'] })
      + `# ${d.id} — ${cell(d.question)}\n\n**Verdict:** ${d.verdict || '—'}\n\n${cell(d.summary)}\n\n## Positions\n\n${(d.positions || []).length ? `| Seat | Lean | Position |\n| --- | --- | --- |\n${d.positions.map((p) => `| [[${cell(p.seat || p.agent)}]] | ${cell(p.lean)} | ${cell(p.position || p.text)} |`).join('\n')}` : '—'}\n\n## Conditions\n\n${(d.conditions || []).length ? d.conditions.map((c) => `- ${cell(c)}`).join('\n') : '- —'}\n\n## Dissent\n\n${cell(d.dissent || '—')}\n\n## Outcome\n\n${d.outcome ? `${cell(d.outcome)} — reviewed ${fmt(d.reviewed)}` : '— (fill in later; that is the point)'}\n`;
    note('decisions', writeGenerated(path.join(dir, `${d.id}.md`), body, W));
    const row = `| ${stampDate(new Date(d.ts || now))} | [[04-Records/Decisions/${d.id}\\|${cell(d.question)}]] | ${d.verdict || '—'} | Council | ${cell(d.outcome || '—')} |`;
    if (!log.includes(d.id)) log = log.replace(/\s*$/, '') + `\n${row}\n`;
    else log = log.split('\n').map((l) => (l.includes(d.id) ? row : l)).join('\n');
  }
  if (log !== fs.readFileSync(logF, 'utf8')) { fs.writeFileSync(logF, log.replace(/^updated: .*$/m, `updated: ${stamp(now)}`)); note('decision-log', 'updated'); }
}

/* ---------- counsel ---------- */
{
  const turns = state.counsel || [];
  note('counsel', writeGenerated(path.join(brain, '04-Records', 'Counsel.md'), fm({ type: 'counsel', agent: 'ARCANE', tags: ['records', 'counsel'] }) + `# Counsel\n\nThe last ${turns.length} turns with ARCANE on the [[BRIDGE]]. Rolling; older turns fall off the site and stay only here if they were synced in time.\n\n${turns.length ? turns.map((c) => `**${c.who === 'leo' ? 'Leo' : 'ARCANE'}** · ${fmt(c.ts)}${c.specialist ? ` · via [[${c.specialist}]]` : ''}\n\n${String(c.text || '').trim()}${c.order ? `\n\n> order → ${wiki(c.order.room)}: ${cell(c.order.text)} (P${c.order.priority ?? 2})` : ''}`).join('\n\n---\n\n') : '—'}\n`, W));
}

/* ---------- the brief, from all of it ---------- */
const b = spawnSync('node', [path.join(REPO, 'tools', 'brief.mjs')], { encoding: 'utf8' }); process.stdout.write(b.stdout); if (b.status !== 0) process.stderr.write(b.stderr);
const line = Object.entries(report).map(([k, v]) => `${k} ${Object.entries(v).map(([r, n]) => `${n} ${r}`).join(', ')}`).join(' · ');
console.log(`✓ vault:sync from ${state.devices} device${state.devices === 1 ? '' : 's'} — ${draftsChanged} draft${draftsChanged === 1 ? '' : 's'} · ${line}`);
