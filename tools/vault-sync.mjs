#!/usr/bin/env node
/**
 * Bring the floor's decisions back into the vault.
 *
 *   npm run vault:sync
 *
 * The floor writes to the database (orders, moves, decisions, counsel,
 * the focus, drafts) and, for the parts not yet on tables, to one JSON
 * row per device (stock, protocol, the journal). This reads both with the
 * service-role key — server-side only, from .env, never in the bundle —
 * and lands each part where the vault keeps it:
 *
 *   drafts           ← content_drafts, as generated files in their status folders (hand-emitted files go up first)
 *   orders           ← orders, the two tables in 06-Orders/Orders.md (rows the vault had go up first, by number)
 *   lists, focus     ← list_items, venture_focus, days → 05-Knowledge/Lists.md, Focus.md
 *   decisions        ← decisions → 04-Records/Decisions/<id>.md + rows in Decision-Log.md
 *   counsel          ← counsel_turns → 04-Records/Counsel.md
 *   protocol         ← the blob → 04-Records/Protocol.md
 *   journal trades   ← the blob → 04-Records/Journal/<id>.md + Journal-Log.md
 *
 * then writes the brief. Needs SUPABASE_SERVICE_ROLE_KEY in .env; without it, says so.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOMS, ROOM_BY_ID, AGENT_BY_ID } from '../packages/config/src/index.js';
import { brainDir, REPO, parseFrontmatter, serializeFrontmatter, writeGenerated, stamp, stampDate } from './lib/brain.mjs';
import { floorState } from './lib/state.mjs';
import { derive, stats } from '../apps/facility/src/core/journal.js';
import { PROTOCOL } from '../apps/facility/src/config/roomdata.js';

import { loadEnv } from '../packages/database/src/index.js';
import { openDb } from '../packages/database/src/dev.js';
import { mirrorDrafts, importDrafts } from './lib/content-mirror.mjs';
import { importOrders, mirrorOrders, mirrorLists, mirrorDecisions, mirrorCounsel, mirrorFocus } from './lib/state-mirror.mjs';

loadEnv();
let db;
try { db = openDb(); } catch (e) { console.log(`· vault:sync skipped — ${e.message}`); process.exit(0); }
// The blob still carries stock, the protocol and the journal; without any rows those parts are skipped, not invented.
const { state, reason } = await floorState().catch((e) => ({ state: null, reason: e.message }));
if (!state) console.log(`· no floor blob (${reason}) — protocol and journal skipped`);
const brain = brainDir();
const now = new Date();
const W = { write: true };
const cell = (s) => String(s ?? '—').replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim() || '—';
const wiki = (room) => `[[${ROOM_BY_ID[room]?.name || room}]]`;
const fmt = (ts) => (ts ? stamp(new Date(ts)) : '—');
const fm = (o) => serializeFrontmatter({ created: stamp(now), updated: stamp(now), status: 'active', generated: true, source: 'tools/vault-sync.mjs', ...o });
const report = {};
const note = (k, r) => { report[k] = report[k] || {}; report[k][r] = (report[k][r] || 0) + 1; };

/* ---------- drafts: the database is the truth; the vault is its record ---------- */
let draftsChanged = 0;
{
  try {
    const imported = await importDrafts(db, brain);
    if (imported.length) console.log(`  imported into the database from the vault: ${imported.join(', ')}`);
    const r = await mirrorDrafts(db, brain);
    draftsChanged = r.written + r.moved + imported.length;
    note('drafts', `${r.written} written, ${r.moved} moved, ${r.unchanged} unchanged${r.kept ? `, ${r.kept} hand-kept` : ''}`);
  } catch (e) { console.error(`  ~ drafts not mirrored: ${e.message}`); note('drafts', 'skipped'); }
}
if (draftsChanged) spawnSync('node', [path.join(REPO, 'tools', 'content-board.mjs')], { stdio: 'inherit' });

/* ---------- orders, lists, the focus: from the tables ---------- */
{
  try {
    const made = await importOrders(db, brain);
    if (made.length) console.log(`  imported into the database from 06-Orders/Orders.md: ${made.length} row${made.length === 1 ? '' : 's'}`);
    note('orders', await mirrorOrders(db, brain, now));
    note('lists', await mirrorLists(db, brain, now));
    note('focus', await mirrorFocus(db, brain, now));
  } catch (e) { console.error(`  ~ orders/lists not mirrored: ${e.message}`); note('orders', 'skipped'); }
}

/* ---------- protocol ---------- */
if (state) {
  const days = Object.keys(state.protocol || {}).sort().slice(-30);
  const items = PROTOCOL.rows.map((r) => r.item);
  const rows = days.map((d) => `| ${d} | ${items.map((it) => (state.protocol[d]?.[it] ? 'x' : '·')).join(' | ')} | ${Object.values(state.protocol[d] || {}).filter(Boolean).length} / ${items.length} |`);
  const streak = (item) => { let n = 0; const d = new Date(now); for (;;) { const k = d.toISOString().slice(0, 10); if (!state.protocol?.[k]?.[item]) break; n++; d.setDate(d.getDate() - 1); } return n; };
  note('protocol', writeGenerated(path.join(brain, '04-Records', 'Protocol.md'), fm({ type: 'protocol', agent: 'PULSE', tags: ['records', 'protocol'] }) + `# Protocol\n\n${PROTOCOL.source} Ticked in [[SANCTUM]]; the last ${days.length} days.\n\n| Item | Target | Streak |\n| --- | --- | --- |\n${PROTOCOL.rows.map((r) => `| ${r.item} | ${r.target} ${r.unit} | ${streak(r.item)} |`).join('\n')}\n\n| Day | ${items.join(' | ')} | Done |\n| --- | ${items.map(() => '---').join(' | ')} | --- |\n${rows.length ? rows.join('\n') : `| — | ${items.map(() => '·').join(' | ')} | — |`}\n`, W));
}

/* ---------- journal ---------- */
if (state) {
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

/* ---------- decisions and counsel: from the tables ---------- */
{
  try {
    const r = await mirrorDecisions(db, brain, now);
    note('decisions', `${r.written} written, ${r.unchanged} unchanged`);
    note('counsel', await mirrorCounsel(db, brain, now));
  } catch (e) { console.error(`  ~ decisions/counsel not mirrored: ${e.message}`); note('decisions', 'skipped'); }
}

/* ---------- the brief, from all of it ---------- */
const b = spawnSync('node', [path.join(REPO, 'tools', 'brief.mjs')], { encoding: 'utf8' }); process.stdout.write(b.stdout); if (b.status !== 0) process.stderr.write(b.stderr);
const line = Object.entries(report).map(([k, v]) => `${k} ${Object.entries(v).map(([r, n]) => `${n} ${r}`).join(', ')}`).join(' · ');
console.log(`✓ vault:sync from the database${state ? ` and ${state.devices} device blob${state.devices === 1 ? '' : 's'}` : ''} — ${draftsChanged} draft${draftsChanged === 1 ? '' : 's'} · ${line}`);
