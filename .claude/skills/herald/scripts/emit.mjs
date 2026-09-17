#!/usr/bin/env node
/**
 * Emit staged drafts into the brain, and log the run.
 *
 *   npm run herald:emit                              # everything in .herald-staging
 *   npm run herald:emit -- --note "one module, five cuts"
 *   npm run herald:emit -- --dry                     # show what would land
 *
 * The only script that writes into 02-Content. It:
 *   1. lints every staged draft — any HARD failure refuses the whole batch
 *   2. assigns ids (HER-YYYYMMDD-NNN), the run id, timestamps, word_count,
 *      compliance = pass and compliance_notes = the warnings
 *   3. writes each draft to 02-Content/Drafts/<id>-<format>-<slug>.md
 *   4. appends one row per draft to 02-Content/Content-Log.md
 *   5. updates the two content lines in 03-Memory/Shared-Memory.md
 *   6. appends a Trace entry (04-Records/Trace) and a Daily-Log line
 *   7. removes the staged files — the vault copy is now the truth
 *
 * If anything fails after step 3 the drafts are already in the vault and
 * the error says so; nothing is silently half-done. Nothing is ever deleted
 * from the vault.
 */
import fs from 'node:fs';
import path from 'node:path';
import { STAGING_DIR, REPO, AGENT, SKILL, ID_PREFIX, INDEX_FILE, slugify, nextId, archivesNote, vaultDir } from './lib.mjs';
import { lintPath } from './lint.mjs';
import { brainDir, serializeFrontmatter, appendTo, touchUpdated, trace, stamp, compact } from '../../../../tools/lib/brain.mjs';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const noteI = args.indexOf('--note');
const note = noteI >= 0 ? args[noteI + 1] : '';
const staging = args.find((a) => !a.startsWith('--') && a !== note) || STAGING_DIR;

if (!fs.existsSync(staging)) { console.error(`✗ no staging dir at ${staging}. Write drafts there first (see SKILL.md step 5).`); process.exit(1); }
const brain = brainDir();
const draftsDir = path.join(brain, '02-Content', 'Drafts');
const logFile = path.join(brain, '02-Content', 'Content-Log.md');
const memoryFile = path.join(brain, '03-Memory', 'Shared-Memory.md');

/* ---------- 1. gate ---------- */
const results = lintPath(staging);
if (!results.length) { console.error(`✗ nothing staged in ${staging}`); process.exit(1); }
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`✗ refused — ${failed.length} of ${results.length} drafts fail the gate. Nothing was written.\n`);
  for (const r of failed) { console.error(`  ${r.name}`); for (const e of r.errors) console.error(`    ✗ ${e}`); }
  console.error(`\nFix and re-run. A batch lands whole or not at all.`);
  process.exit(1);
}
if (results.length > 10) {
  console.error(`✗ refused — ${results.length} drafts in one run. HERALD must ask before emitting more than 10 (see its card). Split the batch.`);
  process.exit(1);
}

/* ---------- 2. ids ---------- */
const now = new Date();
const day = compact(now);
const taken = new Set();
for (const f of fs.existsSync(draftsDir) ? fs.readdirSync(draftsDir) : []) { const m = /^(HER-\d{8}-\d{3})/.exec(f); if (m) taken.add(m[1]); }
for (const line of fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n') : []) { const m = /^\|\s*(HER-\d{8}-\d{3})\s*\|/.exec(line); if (m) taken.add(m[1]); }
const runsToday = new Set();
const traceFile = path.join(brain, '04-Records', 'Trace', `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}.md`);
if (fs.existsSync(traceFile)) for (const m of fs.readFileSync(traceFile, 'utf8').matchAll(/run (HER-R-\d{8}-\d{3})/g)) runsToday.add(m[1]);
const run = nextId(`${ID_PREFIX}-R`, day, runsToday);

/** The Archives note in the Obsidian vault is named `<title> <notionId>`; link the draft to it so the graph connects them. */
let modulesById = {};
try { modulesById = Object.fromEntries(JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')).modules.map((m) => [m.id, m])); } catch {}
const noteFor = (ref) => archivesNote(modulesById[ref]);

const landed = [];
for (const r of results) {
  const id = nextId(ID_PREFIX, day, taken); taken.add(id);
  const d = r.data;
  const fm = {
    type: 'content-draft', id, title: d.title, format: d.format, platform: d.platform, status: 'draft', agent: AGENT, run,
    source_subject: d.source_subject, source_module: d.source_module, source_ref: d.source_ref, source_url: d.source_url || '', source_note: noteFor(d.source_ref),
    angle: d.angle, hook: d.hook, cta: d.cta, tags: d.tags, word_count: r.words,
    compliance: 'pass', compliance_notes: r.warnings.join('; '),
    created: stamp(now), updated: stamp(now), approved_by: '', scheduled_for: '', posted_at: '', posted_url: '',
  };
  const file = `${id}-${d.format}-${slugify(d.title)}.md`;
  landed.push({ id, file, fm, body: r.body, src: path.join(staging, r.name), warnings: r.warnings });
}

/* ---------- 3–7. write ---------- */
if (dry) {
  console.log(`Dry run — ${landed.length} drafts would land as run ${run}:\n`);
  for (const l of landed) console.log(`  ${l.file}  (${l.fm.word_count}w${l.warnings.length ? `, ${l.warnings.length} warning${l.warnings.length > 1 ? 's' : ''}` : ''})`);
  process.exit(0);
}

/* ---------- 3a. copy first: the source notes, verbatim ---------- */
const sourcesDir = path.join(brain, '02-Content', 'Sources');
fs.mkdirSync(sourcesDir, { recursive: true });
const copied = [];
for (const ref of new Set(landed.map((l) => l.fm.source_ref))) {
  const m = modulesById[ref]; if (!m?.note) continue;
  const src = path.join(vaultDir(), 'Arcane ARCHIVES', `${m.note}.md`);
  const dest = path.join(sourcesDir, `${m.note}.md`);
  if (!fs.existsSync(src) || fs.existsSync(dest)) continue;
  const original = fs.readFileSync(src, 'utf8');
  const head = serializeFrontmatter({ type: 'source-copy', copied_from: `[[${m.note}]]`, copied_at: stamp(now), agent: AGENT, subject: m.subject, status: 'archived', tags: ['content', 'source'] });
  fs.writeFileSync(dest, head + `> Copied verbatim from the Archives by HERALD before any content was cut from it. The original is never edited; this copy is the working reference.\n\n` + original.replace(/^---[\s\S]*?---\n/, ''));
  copied.push(m.note);
}

fs.mkdirSync(draftsDir, { recursive: true });
for (const l of landed) fs.writeFileSync(path.join(draftsDir, l.file), serializeFrontmatter(l.fm) + l.body + '\n');

const rows = landed.map((l) => `| ${l.id} | ${stamp(now)} | ${l.fm.format} | ${l.fm.platform} | ${cell(l.fm.hook)} | ${cell(l.fm.source_module)} | ${cell(l.fm.source_subject)} | draft | ${run} |`).join('\n') + '\n';
appendTo(logFile, rows);
touchUpdated(logFile, stamp(now));

try {
  const waiting = fs.readdirSync(draftsDir).filter((f) => f.endsWith('.md')).length;
  let mem = fs.readFileSync(memoryFile, 'utf8');
  mem = mem.replace(/^- Drafts waiting: .*$/m, `- Drafts waiting: ${waiting}`).replace(/^- Last HERALD run: .*$/m, `- Last HERALD run: ${stamp(now)} (${run}, ${landed.length} drafts)`);
  fs.writeFileSync(memoryFile, mem);
  touchUpdated(memoryFile, stamp(now));
} catch (e) { console.error(`~ drafts landed but Shared-Memory was not updated: ${e.message}`); }

const sources = [...new Set(landed.map((l) => `${l.fm.source_subject} / ${l.fm.source_module}`))];
const { traceFile: tf } = trace(brain, {
  agent: AGENT, skill: SKILL, run,
  action: `emit ${landed.length} draft${landed.length === 1 ? '' : 's'} (${landed.map((l) => l.fm.format).join(', ')})`,
  inputs: sources.join('; '),
  outputs: landed.map((l) => `[[${l.file.replace(/\.md$/, '')}]]`).join(', '),
  result: 'ok',
  notes: [note, copied.length ? `copied ${copied.length} source note${copied.length === 1 ? '' : 's'} to 02-Content/Sources` : '', landed.some((l) => l.warnings.length) ? `${landed.filter((l) => l.warnings.length).length} with warnings for review` : ''].filter(Boolean).join(' · '),
}, now);

for (const l of landed) fs.unlinkSync(l.src);

console.log(`✓ run ${run} — ${landed.length} draft${landed.length === 1 ? '' : 's'} landed in 02-Content/Drafts\n`);
for (const l of landed) console.log(`  ${l.file}${l.warnings.length ? `\n     ~ ${l.warnings.join('\n     ~ ')}` : ''}`);
console.log(`\n  logged → 02-Content/Content-Log.md, 03-Memory/Shared-Memory.md, ${path.relative(brain, tf)}, 04-Records/Daily-Log${copied.length ? `\n  copied → 02-Content/Sources/ (${copied.length})` : ''}`);

function cell(s) { return String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 90); }
