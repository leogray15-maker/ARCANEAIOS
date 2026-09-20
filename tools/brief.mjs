#!/usr/bin/env node
/**
 * ARCANE writes the brief.
 *
 *   npm run brief            write 03-Memory/Brief.md and VIGIL's live block in Signals.md
 *   npm run brief -- --dry   print it instead
 *
 * Four blocks, same order every time: VENTURES, MONEY, GOALS, ROOMS. Every
 * figure comes from somewhere you can point at — the config, the vault's
 * Goals and Orders, and the floor's state in Supabase (when the service
 * key is in .env; without it the brief is written from the vault alone and
 * says so). Nothing is invented: a number nobody has typed is "—".
 *
 * The brief file is generated. To change what it says, change what it
 * reads: Shared-Memory, Goals, Orders, or the figures on the floor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { VENTURES, ROOMS, ROOM_BY_ID, AGENT_BY_ID, BRIEF_BLOCKS } from '../packages/config/src/index.js';
import { brainDir, REPO, writeGenerated, replaceBlock, replaceSection, serializeFrontmatter, stamp, stampDate, parseFrontmatter } from './lib/brain.mjs';
import { floorState, money, ventureRevenue, monthlyRevenue, monthlyFixed, runwayMonths } from './lib/state.mjs';
import { signals } from '../apps/facility/src/core/vigil.js';
import { loadEnv } from '../packages/database/src/index.js';
import { openDb } from '../packages/database/src/dev.js';
import { aggregate } from '../packages/database/src/bridge.js';

const dry = process.argv.includes('--dry');
const brain = brainDir();
const now = new Date();
const DAY = 86400000;
const wiki = (room) => `[[${ROOM_BY_ID[room]?.name || room}]]`;
const cell = (s) => String(s ?? '—').replace(/\|/g, '/').replace(/\n/g, ' ') || '—';

// The vault's export is the same JSON the site reads; build it fresh so the
// brief and the site agree on drafts and goals.
spawnSync('node', [path.join(REPO, 'tools', 'vault-export.mjs')], { stdio: 'ignore' });
const exportFile = path.join(REPO, 'apps', 'facility', 'public', 'brain.json');
const vault = JSON.parse(fs.readFileSync(exportFile, 'utf8'));

const { state, reason } = await floorState().catch((e) => ({ state: null, reason: e.message }));
const s = state || { orders: {}, ledger: {}, goals: {}, budget: { cash: 0, fixed: {}, split: {} }, stock: [], drafts: {}, log: [], journal: { trades: [] }, protocol: {} };
const from = state ? `the vault and the floor (${state.devices} device${state.devices === 1 ? '' : 's'})` : `the vault alone (${reason})`;

/* ---------- orders: the database when it answers, else the vault's rows plus the blob's ---------- */
const PR = ['P0', 'P1', 'P2', 'P3'];
let agg = null, aggReason = '';
loadEnv();
try { agg = await aggregate(openDb(), { now }); } catch (e) { aggReason = e.message; }
const open = [];
if (agg) {
  const seen = new Set();
  const take = (o) => { if (seen.has(o.id)) return; seen.add(o.id); open.push({ room: o.room, text: o.text, p: o.priority, holder: o.holder_name || o.holder, blocked: o.blocked_on || '', ts: new Date(o.created_at).getTime(), state: o.state }); };
  for (const o of [...agg.today.orders, ...agg.waiting.blocked, ...agg.waiting.review, ...agg.waiting.stale, ...agg.today.due]) take(o);
  for (const r of agg.active.rooms) take(r.top);
} else {
  for (const o of vault.orders.open) if (!/done|killed/.test(o.state)) open.push({ room: ROOMS.find((r) => r.name === o.room)?.id || 'bridge', text: o.order, p: PR.indexOf(o.priority) < 0 ? 2 : PR.indexOf(o.priority), holder: o.holder, blocked: o.blocked, ts: 0 });
  for (const [room, list] of Object.entries(s.orders)) for (const o of list) if (!o.done && !o.fromBrain && !open.some((x) => x.text === o.t)) open.push({ room, text: o.t, p: o.p, holder: o.holder || AGENT_BY_ID[ROOM_BY_ID[room]?.agent]?.name || 'Leo', blocked: o.blocked || '', ts: o.ts || 0 });
}
// Done flags set in the blob apply to the vault's rows too (the pre-table path).
const doneText = new Set(Object.values(s.orders).flat().filter((o) => o.done).map((o) => o.t));
const live = open.filter((o) => !doneText.has(o.text)).sort((a, b) => a.p - b.p || a.ts - b.ts);
const openCount = agg ? agg.active.open : live.length;
const recent = (s.log || []).filter((l) => now - l.ts < 7 * DAY);
const focusOf = (id) => agg?.ventures.find((v) => v.id === id) || null;

/* ---------- MONEY: the Vault's tables when they answer, else the old blob (read first: VENTURES cites it) ---------- */
const M = agg?.money || null;

/* ---------- VENTURES ---------- */
const ventures = VENTURES.map((v) => {
  const roomName = ROOM_BY_ID[v.room]?.name || '';
  const mentions = recent.filter((l) => l.text.includes(roomName) || (v.id === 'archives' && /^Draft /.test(l.text)) || (v.id === 'peptides' && /^COA /.test(l.text)));
  const moved = mentions.length ? mentions[mentions.length - 1].text : (v.id === 'archives' && vault.drafts.length ? `${vault.drafts.length} drafts in the pipeline` : '—');
  const stuck = live.find((o) => o.room === v.room && o.p <= 1);
  const l = s.ledger?.[v.id];
  const mv = M?.ventures.find((x) => x.id === v.id);
  let number = mv && mv.revenue !== null ? `${mv.units !== null ? `${mv.units} ${v.unitLabel} · ` : ''}${money(mv.revenue)} / mo` : l?.calibrated ? (v.price ? `${l.units} ${v.unitLabel} · ${money(ventureRevenue(s, v))} / mo` : `${money(l.mrr)} / mo`) : `— ${v.unitLabel}`;
  if (v.id === 'peptides' && agg?.lab) number = `${agg.lab.vials} vials in ${agg.lab.live} lines · COA ${agg.lab.coaPct === null ? '—' : `${agg.lab.coaPct}%`} · stock ${money(agg.lab.valueCost)} at cost · ${agg.lab.dispatch.packing + agg.lab.dispatch.ready} to dispatch${l?.calibrated ? ` · ${number}` : ''}`;
  const f = focusOf(v.id);
  return `| ${v.name} | ${f ? `${f.rank || '—'} · ${f.allocation}${f.why ? ` — ${cell(f.why)}` : ''}` : '—'} | ${cell(moved)} | ${stuck ? cell(`${stuck.text}${stuck.ts ? ` (${Math.floor((now - stuck.ts) / DAY)}d)` : ''}`) : '—'} | ${number} |`;
});

/* ---------- MONEY ---------- */
const cash = M ? (M.cash?.cash ?? 0) : Number(s.budget?.cash) || 0;
const rev = M ? (M.revenue ?? 0) : monthlyRevenue(s, VENTURES), fixed = M ? M.fixed : monthlyFixed(s);
const split = M ? M.pots.map((p) => p.pct).join(' / ') : Object.entries(s.budget?.split || {}).map(([, p]) => p).join(' / ') || '—';
const runway = M ? (M.runway === null ? Infinity : M.runway) : runwayMonths(s, VENTURES);
const moneyRow = `| ${cash ? `${money(cash)}${M?.cash ? ` (${M.cash.day})` : ''}` : '—'} | ${rev ? money(rev) : '—'} | ${fixed ? money(fixed) : '—'} | ${split} | ${cash ? (runway === Infinity ? 'covered' : `${runway.toFixed(1)} months`) : '—'} |`;

/* ---------- GOALS ---------- */
const liveStock = (s.stock || []).filter((r) => r.vials > 0);
const coaPct = agg?.lab ? agg.lab.coaPct : liveStock.length ? Math.round(liveStock.filter((r) => r.coa === 'published').length / liveStock.length * 100) : null;
const draftStatus = (d) => s.drafts?.[d.id]?.status || d.status;
const typed = Object.fromEntries((agg?.goals || []).map((g) => [g.goal_id, Number(g.value)]));
const goalValue = (g) => g.id === 'g-coa' ? coaPct : g.id === 'g-mrr' ? rev : g.id === 'g-posts' ? vault.drafts.filter((d) => draftStatus(d) === 'posted').length : g.id === 'g-members' && M ? (M.ventures.find((x) => x.id === 'archives')?.units ?? typed[g.id] ?? null) : g.id === 'g-track' && M ? (M.ventures.find((x) => x.id === 'track')?.units ?? typed[g.id] ?? null) : (typed[g.id] ?? s.goals?.[g.id]?.progress ?? null);
// The goals table, once it has rows, is the truth; the vault's flat list is the fallback before migration 0011 has run.
const { fmt: fmtGoal } = await import('../apps/facility/src/core/goals.js');
const goals = agg?.targets?.length ? agg.targets.filter((g) => g.status === 'active').map((g) => `| ${'↳ '.repeat(Math.min(g.depth || 0, 3))}${cell(g.title)} | ${g.actual === null ? '—' : fmtGoal(g.actual, g.unit)} / ${g.target === null ? '—' : fmtGoal(g.target, g.unit)}${g.pct !== null ? ` (${g.pct}%)` : ''} | ${g.trend ? g.trend : agg.goals_behind?.includes(g.id) ? 'behind' : '—'} |`) : vault.goals.map((g) => {
  const v = goalValue(g);
  const shown = v === null || v === undefined ? (g.progress || '—') : g.id === 'g-mrr' ? money(v) : /%/.test(g.target) ? `${v}%` : String(v);
  const moved = recent.filter((l) => (g.id === 'g-posts' && /→ posted/.test(l.text)) || (g.id === 'g-coa' && /^COA /.test(l.text))).length;
  return `| ${g.goal} | ${shown} / ${g.target} | ${moved ? `${moved} this week` : '—'} |`;
});

/* ---------- ROOMS ---------- */
const rooms = [];
for (const r of ROOMS) { const top = live.find((o) => o.room === r.id); if (!top) continue; const n = live.filter((o) => o.room === r.id).length; rooms.push(`| ${wiki(r.id)} | ${cell(top.text)}${n > 1 ? ` (+${n - 1})` : ''} | ${/^\[\[/.test(top.holder) ? top.holder : AGENT_BY_ID[top.holder?.toLowerCase?.()] ? `[[${top.holder}]]` : cell(top.holder)} | ${cell(top.blocked || '—')} |`); }

/* ---------- signals ---------- */
const sig = signals(s, vault, now.getTime());
const worst = sig.some((x) => x.severity === 'breach') ? 'breach' : sig.some((x) => x.severity === 'warn') ? 'warn' : 'quiet';

/* ---------- the file ---------- */
const day = stampDate(now);
const briefFile = path.join(brain, '03-Memory', 'Brief.md');
const prev = fs.existsSync(briefFile) ? parseFrontmatter(fs.readFileSync(briefFile, 'utf8')).data : null;
const fm = { type: 'brief', created: prev?.created || stamp(now), updated: stamp(now), status: 'active', agent: 'ARCANE', brief_date: day, generated: true, source: 'tools/brief.mjs', tags: ['brief'] };
const blocks = { ventures: ['| Venture | Focus | Moved | Stuck | The number |', '| --- | --- | --- | --- | --- |', ...ventures], money: ['| Cash | Revenue this month | Fixed costs | Split | Runway |', '| --- | --- | --- | --- | --- |', moneyRow], goals: ['| Goal | Progress | Moved |', '| --- | --- | --- |', ...goals], rooms: ['| Room | Open | Holder | Blocked on |', '| --- | --- | --- | --- |', ...(rooms.length ? rooms : ['| — | nothing open | — | — |'])] };
const text = serializeFrontmatter(fm) + `# Brief — ${day}

> Four blocks, same order every time. Read all four before acting.
> Written by [[ARCANE]] at ${stamp(now)} from ${from}${agg ? ' and the database' : ` (database: ${aggReason})`}. ${openCount} open order${openCount === 1 ? '' : 's'}, ${agg?.drafts ? (agg.drafts.draft || 0) + (agg.drafts.review || 0) : vault.drafts.filter((d) => draftStatus(d) === 'draft').length} drafts waiting, ${sig.length} signal${sig.length === 1 ? '' : 's'} (${worst}) → [[Signals]].${agg?.today?.focus ? `\n> Today's focus: ${agg.today.focus}` : ''}

${BRIEF_BLOCKS.map((b) => `## ${b.name}\n\n${blocks[b.id].join('\n')}`).join('\n\n')}
`;

if (dry) { process.stdout.write(text); process.exit(0); }
const wrote = writeGenerated(briefFile, text, { write: true });
if (wrote === 'kept') { console.error('✗ 03-Memory/Brief.md is hand-written (no generated: true). Add `generated: true` to its frontmatter once to hand it to ARCANE.'); process.exit(1); }

// VIGIL's live block in Signals.md; the hand-kept rows below it stay.
const tone = { breach: 'breach', warn: 'warn', info: 'info' };
const liveRows = sig.length ? ['| Room | Signal | Severity | Clears when |', '| --- | --- | --- | --- |', ...sig.map((x) => `| ${wiki(x.room)} | ${cell(x.text)} | ${tone[x.severity]} | ${cell(x.clear)} |`)] : ['Nothing moved that needs you.'];
replaceBlock(path.join(brain, '03-Memory', 'Signals.md'), 'vigil:live', `## Live — ${stamp(now)}\n\nComputed by [[VIGIL]] from the floor's state; regenerated by \`npm run brief\`.\n\n${liveRows.join('\n')}`);

// Shared-Memory's Content and Treasury lines are ARCANE's to keep.
const memFile = path.join(brain, '03-Memory', 'Shared-Memory.md');
const waiting = vault.drafts.filter((d) => draftStatus(d) === 'draft').length, approved = vault.drafts.filter((d) => draftStatus(d) === 'approved').length;
const postedWeek = vault.drafts.filter((d) => draftStatus(d) === 'posted' && (s.drafts?.[d.id]?.ts || 0) > now - 7 * DAY).length;
const lastRun = (vault.trace || []).filter((t) => /HERALD/.test(t.agent || '')).pop();
replaceSection(memFile, '## Content', `- Drafts waiting: ${waiting}\n- Approved, unscheduled: ${approved}\n- Posted this week: ${postedWeek}\n- Last HERALD run: ${lastRun ? `${lastRun.day || ''} ${lastRun.time || ''} (${lastRun.run || ''})`.trim() : '—'}`);
replaceSection(memFile, '## Treasury', `- Cash: ${cash ? money(cash) : '—'}\n- Runway (months): ${cash ? (runway === Infinity ? 'covered' : runway.toFixed(1)) : '—'}\n- Tax reserve: ${s.budget?.split?.tax ? `${s.budget.split.tax}% of revenue` : '—'}`);
const memText = fs.readFileSync(memFile, 'utf8').replace(/^updated: .*$/m, `updated: ${stamp(now)}`); fs.writeFileSync(memFile, memText);

// Today's daily log notes the brief was written.
const dailyFile = path.join(brain, '04-Records', 'Daily-Log', `${day}.md`);
if (fs.existsSync(dailyFile)) { const t = fs.readFileSync(dailyFile, 'utf8'); fs.writeFileSync(dailyFile, t.replace(/^- Brief written: .*$/m, `- Brief written: ${stamp(now).slice(11)} [[Brief]]`)); }

// Re-export so the site reads the brief it just got.
spawnSync('node', [path.join(REPO, 'tools', 'vault-export.mjs')], { stdio: 'ignore' });
console.log(`✓ brief ${day} ${wrote} from ${from}${agg ? ' and the database' : ''} — ${openCount} open orders, ${rooms.length} rooms with work, ${sig.length} signals (${worst})`);
