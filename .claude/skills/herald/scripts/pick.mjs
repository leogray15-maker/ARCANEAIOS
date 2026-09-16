#!/usr/bin/env node
/**
 * Pick source modules from the Archives index.
 *
 *   npm run herald:pick                          # 5 random open-lane candidates
 *   npm run herald:pick -- --subject "Mindset"   # from one subject (substring match)
 *   npm run herald:pick -- --keyword stress      # title/excerpt/body contains
 *   npm run herald:pick -- --lane philosophy --count 3
 *   npm run herald:pick -- --show <id>           # print the full module text
 *   npm run herald:pick -- --allow-sensitive     # include health/trading lanes (the lint gate still runs)
 *   npm run herald:pick -- --json                # machine output
 *
 * Modules already used as a source (per 02-Content/Content-Log.md) are
 * excluded unless --include-used. Index pages are never candidates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadIndex, moduleText, REPO } from './lib.mjs';
import { brainDir } from '../../../../tools/lib/brain.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] ?? true) : d; };
const has = (k) => args.includes(k);

const index = loadIndex();

if (has('--show')) {
  const id = opt('--show');
  const m = index.modules.find((x) => x.id === id || x.id.endsWith(id));
  if (!m) { console.error(`✗ no module "${id}"`); process.exit(1); }
  console.log(`# ${m.title}\n\nsubject: ${m.subject} · lane: ${m.lane} · ${m.words} words · id: ${m.id}${m.sensitive ? ' · ⚠ SENSITIVE ' + m.flags.join(',') : ''}\n${m.notionId ? `notion: https://www.notion.so/${m.notionId}\n` : ''}\n---\n\n${moduleText(m)}`);
  process.exit(0);
}

/* ---------- already used ---------- */
const used = new Set();
try {
  const log = fs.readFileSync(path.join(brainDir(), '02-Content', 'Content-Log.md'), 'utf8');
  for (const line of log.split('\n')) {
    const cells = line.split('|').map((s) => s.trim());
    if (cells.length > 6 && cells[1].startsWith('HER-')) used.add(cells[6]);
  }
} catch {}

/* ---------- filter ---------- */
const count = Number(opt('--count', 5));
const subject = opt('--subject', '');
const keyword = opt('--keyword', '');
const lane = opt('--lane', '');
const minWords = Number(opt('--min-words', 120));
const allowSensitive = has('--allow-sensitive') || !!subject;
const includeUsed = has('--include-used');

let pool = index.modules.filter((m) => m.kind === 'module' && m.words >= minWords && m.lane !== 'meta');
if (!allowSensitive) pool = pool.filter((m) => !m.sensitive);
if (subject) pool = pool.filter((m) => m.subject.toLowerCase().includes(String(subject).toLowerCase()));
if (lane) pool = pool.filter((m) => m.lane === lane);
if (!includeUsed) pool = pool.filter((m) => !used.has(m.title) && !used.has(m.id));
if (keyword) {
  const k = String(keyword).toLowerCase();
  pool = pool.filter((m) => m.title.toLowerCase().includes(k) || m.excerpt.toLowerCase().includes(k) || moduleText(m).toLowerCase().includes(k));
}

/* ---------- choose ---------- */
// Prefer substance: weight by log(words) so a 2,000-word module is not
// drowned out by fifty 150-word ones, but is not automatically first either.
const weighted = pool.map((m) => ({ m, w: Math.log(m.words) * (0.6 + Math.random()) }));
weighted.sort((a, b) => b.w - a.w);
const picks = weighted.slice(0, count).map((x) => x.m);

if (has('--json')) { console.log(JSON.stringify(picks, null, 1)); process.exit(0); }

if (!picks.length) { console.log(`No candidates (pool ${pool.length}). Loosen the filter, or --allow-sensitive / --include-used.`); process.exit(0); }
console.log(`${picks.length} of ${pool.length} candidates${subject ? ` in "${subject}"` : ''}${lane ? ` · lane ${lane}` : ''}${keyword ? ` · "${keyword}"` : ''}${used.size ? ` · ${used.size} already used` : ''}\n`);
for (const m of picks) {
  console.log(`${m.sensitive ? '⚠ ' : '  '}${m.id}`);
  console.log(`   ${m.title}  ·  ${m.subject}  ·  ${m.lane}  ·  ${m.words}w${m.flags.length ? '  ·  flags: ' + m.flags.join(',') : ''}`);
  console.log(`   ${m.excerpt.slice(0, 160)}…\n`);
}
console.log(`Full text:  npm run herald:pick -- --show <id>`);
