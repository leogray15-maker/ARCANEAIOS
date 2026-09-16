#!/usr/bin/env node
/**
 * Build HERALD's index of the Arcane Archives from the local Notion export.
 *
 *   npm run herald:index            # build
 *   npm run herald:index -- --stats # print the subject table only
 *
 * Walks every subject folder, extracts the page body as plain text, and
 * writes:
 *   data/archives/index.json        — metadata for every module (gitignored)
 *   data/archives/modules/<id>.txt  — clean text per module (gitignored)
 *   brain/05-Knowledge/Archives-Map.md — the subject map (generated, committed)
 *
 * Notion is never touched. This reads a folder on disk. The Notion
 * connector is the way to *refresh* the export; it is not called here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { exportDir, INDEX_FILE, MODULES_DIR, DATA_DIR, REPO, laneFor, countWords, slugify, scan } from './lib.mjs';
import { brainDir, writeGenerated, serializeFrontmatter, stamp } from '../../../../tools/lib/brain.mjs';

const statsOnly = process.argv.includes('--stats');
const src = exportDir();
if (!fs.existsSync(src)) {
  console.error(`✗ Archives export not found at:\n  ${src}\nSet ARCANE_ARCHIVES_EXPORT to the "The Arcane Archives" folder of a Notion HTML export.`);
  process.exit(1);
}

/* ---------- html → text ---------- */

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const unescape = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => entities[n.toLowerCase()] ?? m);

function extract(html) {
  const title = unescape((/<title>([^<]*)<\/title>/.exec(html)?.[1] || '').trim());
  const bodyM = /<div class="page-body">([\s\S]*?)<\/div>\s*<\/article>/.exec(html);
  let b = bodyM ? bodyM[1] : html;
  const links = (b.match(/<a [^>]*href="[^"]*\.html"/g) || []).length;
  b = b.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  b = b.replace(/<figure[^>]*class="link-to-page"[\s\S]*?<\/figure>/gi, '\n'); // child-page links are navigation, not prose
  b = b.replace(/<\/(p|h[1-6]|li|blockquote|div|tr|figure)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  b = b.replace(/<[^>]+>/g, '');
  b = unescape(b).replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, text: b, links };
}

/* ---------- walk ---------- */

const NOTION_ID = /\s([0-9a-f]{32})\.html$/i;
const subjects = fs.readdirSync(src, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

const modules = [];
const subjectRows = [];
for (const subject of subjects) {
  const lane = laneFor(subject);
  const files = [];
  (function walk(dir, depth) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile() && e.name.endsWith('.html')) files.push({ p, depth });
    }
  })(path.join(src, subject), 1);

  let words = 0, count = 0, sensitive = 0;
  for (const { p, depth } of files) {
    const html = fs.readFileSync(p, 'utf8');
    const { title, text, links } = extract(html);
    const notionId = NOTION_ID.exec(path.basename(p))?.[1] || '';
    const wc = countWords(text);
    // An index page is mostly links and little prose. It is still recorded so a
    // parent's children can be found, but it is never picked as a source.
    const kind = (links >= 3 && wc < 80) || wc < 25 ? 'index' : 'module';
    const rel = path.relative(src, p);
    const parent = depth > 1 ? path.basename(path.dirname(p)) : null;
    const id = `${slugify(subject, 24)}--${slugify(title || path.basename(p, '.html'), 40)}--${notionId.slice(-6) || String(modules.length)}`;
    const hits = scan(text);
    const isSensitive = lane.sensitive || hits.hard.length > 0;
    modules.push({
      id, subject, lane: lane.id, title: title || path.basename(p, '.html').replace(NOTION_ID, ''),
      parent, depth, kind, words: wc, sensitive: isSensitive,
      flags: hits.hard.map((h) => h.id), notionId, path: rel,
      excerpt: text.slice(0, 280).replace(/\s+/g, ' ').trim(),
    });
    if (!statsOnly) { fs.mkdirSync(MODULES_DIR, { recursive: true }); fs.writeFileSync(path.join(MODULES_DIR, `${id}.txt`), text + '\n'); }
    if (kind === 'module') { count++; words += wc; if (isSensitive) sensitive++; }
  }
  subjectRows.push({ subject, lane: lane.id, sensitive: lane.sensitive, modules: count, pages: files.length, words, flagged: sensitive });
}

/* ---------- write ---------- */

const usable = modules.filter((m) => m.kind === 'module');
const index = {
  built: stamp(), source: src, subjects: subjectRows,
  totals: { subjects: subjects.length, pages: modules.length, modules: usable.length, words: usable.reduce((a, m) => a + m.words, 0), sensitive: usable.filter((m) => m.sensitive).length },
  modules,
};
if (!statsOnly) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 1));
}

/* ---------- the map, into the brain ---------- */

const brain = brainDir();
const laneCounts = {};
for (const r of subjectRows) laneCounts[r.lane] = (laneCounts[r.lane] || 0) + r.modules;
const map = [
  serializeFrontmatter({ type: 'knowledge', created: stamp(), updated: stamp(), status: 'active', agent: 'HERALD', generated: true, card: 'archives-map', tags: ['knowledge', 'archives'] }),
  '# The Archives, mapped',
  '',
  `${index.totals.subjects} subjects · ${index.totals.modules} modules (${index.totals.pages} pages incl. indexes) · ${index.totals.words.toLocaleString('en-GB')} words · ${index.totals.sensitive} modules gated as sensitive.`,
  '',
  `Built ${index.built} by \`npm run herald:index\` from the local Notion export. Regenerate after any export refresh. Full index at \`data/archives/index.json\` (not committed).`,
  '',
  '## Lanes',
  '',
  '| Lane | Modules | Handling |', '| --- | --- | --- |',
  ...Object.entries(laneCounts).sort((a, b) => b[1] - a[1]).map(([l, n]) => `| ${l} | ${n} | ${['health', 'trading'].includes(l) ? '**sensitive** — never picked unless named; compliance gate hard-fails dosing, compounds and claims' : 'open'} |`),
  '',
  '## Subjects',
  '',
  '| Subject | Lane | Modules | Words | Flagged |', '| --- | --- | --- | --- | --- |',
  ...subjectRows.sort((a, b) => b.modules - a.modules).map((r) => `| ${r.subject} | ${r.lane}${r.sensitive ? ' ⚠' : ''} | ${r.modules} | ${r.words.toLocaleString('en-GB')} | ${r.flagged || ''} |`),
  '',
].join('\n');
const status = writeGenerated(path.join(brain, '05-Knowledge', 'Archives-Map.md'), map, { write: !statsOnly });

/* ---------- report ---------- */
console.log(`Archives index ${statsOnly ? '(stats only)' : 'built'} from ${src}`);
console.log(`  ${index.totals.subjects} subjects · ${index.totals.modules} modules · ${index.totals.pages} pages · ${index.totals.words.toLocaleString('en-GB')} words · ${index.totals.sensitive} sensitive`);
console.log(`  lanes: ${Object.entries(laneCounts).map(([l, n]) => `${l} ${n}`).join(' · ')}`);
if (!statsOnly) console.log(`  → ${path.relative(REPO, INDEX_FILE)}\n  → ${path.relative(REPO, MODULES_DIR)}/*.txt\n  → brain/05-Knowledge/Archives-Map.md (${status})`);
