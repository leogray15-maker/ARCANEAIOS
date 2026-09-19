#!/usr/bin/env node
/**
 * Build HERALD's index of the Arcane Archives.
 *
 *   npm run herald:index                 # from the Obsidian vault (the brain) when it is present
 *   npm run herald:index -- --from export # from the Notion HTML export instead
 *   npm run herald:index -- --from notion # from Notion itself, over the API (needs NOTION_TOKEN)
 *   npm run herald:index -- --stats      # print the subject table only
 *
 * The vault is the source of truth: every Archives note in
 * `<vault>/Arcane ARCHIVES` is read, never written. Course pages are the
 * notes that link out to many others; a module's subject is the most
 * specific course that links to it. The HTML export is the fallback for a
 * machine without the vault, and `--from notion` is the one source that
 * needs no folder at all — it is what lets HERALD run somewhere other
 * than Leo's Mac. All three write:
 *   data/archives/index.json        — metadata for every module (gitignored)
 *   data/archives/modules/<id>.txt  — clean text per module (gitignored)
 *   brain/05-Knowledge/Archives-Map.md — the subject map (generated, committed)
 *
 * The Archives are never written to. The vault and export readers touch
 * only the filesystem; the Notion reader is read-only by construction
 * (see notion.mjs) and calls no write endpoint.
 */
import fs from 'node:fs';
import path from 'node:path';
import { exportDir, vaultDir, INDEX_FILE, MODULES_DIR, DATA_DIR, REPO, laneFor, countWords, slugify, scan } from './lib.mjs';
import { fetchArchives } from './notion.mjs';
import { brainDir, writeGenerated, serializeFrontmatter, stamp } from '../../../../tools/lib/brain.mjs';

const statsOnly = process.argv.includes('--stats');
const from = process.argv.includes('--from') ? process.argv[process.argv.indexOf('--from') + 1] : '';
if (from && !['vault', 'export', 'notion'].includes(from)) {
  console.error(`✗ Unknown source "${from}". Use --from vault, --from export or --from notion.`);
  process.exit(1);
}
const vaultArchives = path.join(vaultDir(), 'Arcane ARCHIVES');
const useVault = from === 'vault' || (!from && fs.existsSync(vaultArchives));
const useNotion = from === 'notion';
const sourceKind = useNotion ? 'notion' : useVault ? 'vault' : 'export';
const SOURCE_NAME = { notion: 'Notion, over the API (read only)', vault: 'the Obsidian vault (read only)', export: 'the local Notion export' };

// `.env` at the repo root carries NOTION_TOKEN on an unattended run.
if (useNotion) { try { for (const line of fs.readFileSync(path.join(REPO, '.env'), 'utf8').split('\n')) { const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch {} }

const src = useNotion ? 'notion' : useVault ? vaultArchives : exportDir();
if (!useNotion && !fs.existsSync(src)) {
  console.error(`✗ Archives not found.\n  vault:  ${vaultArchives}\n  export: ${exportDir()}\nSet ARCANE_VAULT (Obsidian vault) or ARCANE_ARCHIVES_EXPORT, or read Notion directly with --from notion.`);
  process.exit(1);
}

/* ---------- html → text (the export) ---------- */

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const unescape = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => entities[n.toLowerCase()] ?? m);

function extractHtml(html) {
  const title = unescape((/<title>([^<]*)<\/title>/.exec(html)?.[1] || '').trim());
  const bodyM = /<div class="page-body">([\s\S]*?)<\/div>\s*<\/article>/.exec(html);
  let b = bodyM ? bodyM[1] : html;
  const links = (b.match(/<a [^>]*href="[^"]*\.html"/g) || []).length;
  b = b.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  b = b.replace(/<figure[^>]*class="link-to-page"[\s\S]*?<\/figure>/gi, '\n');
  b = b.replace(/<\/(p|h[1-6]|li|blockquote|div|tr|figure)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  b = b.replace(/<[^>]+>/g, '');
  b = unescape(b).replace(/[ \t\u00a0]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, text: b, links: [] , linkCount: links };
}

/* ---------- markdown → text (the vault) ---------- */

const NOTION_ID = /\s([0-9a-f]{32})\.md$/i;
function extractMd(md) {
  let s = md.replace(/^---[\s\S]*?---\n/, '');
  const title = (/^#\s+(.+)$/m.exec(s)?.[1] || '').trim();
  const links = [];
  for (const m of s.matchAll(/\]\(([^)\s]+\.md)\)/g)) { try { links.push(decodeURIComponent(m[1])); } catch { links.push(m[1]); } }
  for (const m of s.matchAll(/\[\[([^\]|#]+)/g)) links.push(m[1] + '.md');
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, '')            // images
       .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')           // links → their text
       .replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (m, a, _, b) => b || a)
       .replace(/^#{1,6}\s+/gm, '').replace(/[*_`>]+/g, '').replace(/<[^>]+>/g, '')
       .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { title, text: s, links, linkCount: links.length };
}

/* ---------- walk ---------- */

const modules = [];
const subjectRows = [];

/**
 * The vault and Notion both arrive as a flat list of notes. Everything
 * after this point — which notes are courses, what subject a module
 * belongs to, its lane, whether it is sensitive — is the same work on the
 * same shape, so it is done once here rather than per source.
 */
function fromNotes(notes) {
  const byBase = new Map(notes.map((n) => [n.base, n]));
  const byId = new Map(notes.filter((n) => n.notionId).map((n) => [n.notionId, n]));
  // A link is either a note id (Notion) or a filename (the vault).
  const resolve = (l) => byId.get(String(l).replace(/-/g, '').toLowerCase()) || byBase.get(path.basename(String(l)).replace(/\.md$/, ''));
  for (const n of notes) n.out = [...new Set(n.links.map(resolve).filter((x) => x && x !== n))];
  const hubs = notes.filter((n) => n.out.length >= 4);
  const hubOf = new Map();
  for (const h of hubs.sort((a, b) => a.out.length - b.out.length)) for (const m of h.out) if (!hubOf.has(m)) hubOf.set(m, h);   // most specific course wins
  const bySubject = {};
  for (const n of notes) {
    const isIndex = n.out.length >= 4 || n.wc < 25;
    const subject = isIndex ? n.title : (hubOf.get(n)?.title || 'The Arcane Archives');
    // Reposted third-party pieces (the WSP archive and the like) are not Leo's to cut content from.
    const reposted = /WSPArchive|Reading Time:/i.test(n.text)
      || /\((January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\)/.test(n.title)
      || /Self Learning AI/i.test(subject) || /^https?:\/\//m.test(n.text.slice(0, 200));
    const lane = reposted ? { id: 'external', sensitive: true } : laneFor(subject);
    const hits = scan(n.text);
    const isSensitive = lane.sensitive || hits.hard.length > 0;
    const id = `${slugify(subject, 24)}--${slugify(n.title, 40)}--${n.notionId.slice(-6) || String(modules.length)}`;
    modules.push({ id, subject, lane: lane.id, title: n.title, parent: hubOf.get(n)?.title || null, depth: 1, kind: isIndex ? 'index' : 'module', words: n.wc, sensitive: isSensitive, flags: hits.hard.map((h) => h.id), notionId: n.notionId, path: n.file, note: n.base, excerpt: n.text.slice(0, 280).replace(/\s+/g, ' ').trim() });
    if (!statsOnly) { fs.mkdirSync(MODULES_DIR, { recursive: true }); fs.writeFileSync(path.join(MODULES_DIR, `${id}.txt`), n.text + '\n'); }
    if (!isIndex) { const r = bySubject[subject] || (bySubject[subject] = { subject, lane: lane.id, sensitive: lane.sensitive, modules: 0, pages: 0, words: 0, flagged: 0 }); r.modules++; r.words += n.wc; if (isSensitive) r.flagged++; }
    (bySubject[subject] || (bySubject[subject] = { subject, lane: lane.id, sensitive: lane.sensitive, modules: 0, pages: 0, words: 0, flagged: 0 })).pages++;
  }
  subjectRows.push(...Object.values(bySubject));
}

if (useNotion) {
  const say = (m) => process.stderr.write(`  notion: ${m}\n`);
  const { notes } = await fetchArchives({ onProgress: statsOnly ? () => {} : say });
  if (!notes.length) { console.error('✗ Notion returned no pages. Is the Archives page shared with the integration?'); process.exit(1); }
  fromNotes(notes);
} else if (useVault) {
  // One flat folder of notes. Read them all, then work out which are courses.
  const files = fs.readdirSync(src).filter((f) => f.endsWith('.md'));
  fromNotes(files.map((f) => {
    const md = fs.readFileSync(path.join(src, f), 'utf8');
    const { title, text, links } = extractMd(md);
    const notionId = NOTION_ID.exec(f)?.[1] || '';
    return { file: f, base: f.replace(/\.md$/, ''), title: title || f.replace(NOTION_ID, '').replace(/\.md$/, ''), text, links, notionId, wc: countWords(text) };
  }));
} else {
  const subjects = fs.readdirSync(src, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const NOTION_HTML = /\s([0-9a-f]{32})\.html$/i;
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
      const { title, text, linkCount } = extractHtml(html);
      const notionId = NOTION_HTML.exec(path.basename(p))?.[1] || '';
      const wc = countWords(text);
      const kind = (linkCount >= 3 && wc < 80) || wc < 25 ? 'index' : 'module';
      const rel = path.relative(src, p);
      const parent = depth > 1 ? path.basename(path.dirname(p)) : null;
      const id = `${slugify(subject, 24)}--${slugify(title || path.basename(p, '.html'), 40)}--${notionId.slice(-6) || String(modules.length)}`;
      const hits = scan(text);
      const isSensitive = lane.sensitive || hits.hard.length > 0;
      modules.push({ id, subject, lane: lane.id, title: title || path.basename(p, '.html').replace(NOTION_HTML, ''), parent, depth, kind, words: wc, sensitive: isSensitive, flags: hits.hard.map((h) => h.id), notionId, path: rel, excerpt: text.slice(0, 280).replace(/\s+/g, ' ').trim() });
      if (!statsOnly) { fs.mkdirSync(MODULES_DIR, { recursive: true }); fs.writeFileSync(path.join(MODULES_DIR, `${id}.txt`), text + '\n'); }
      if (kind === 'module') { count++; words += wc; if (isSensitive) sensitive++; }
    }
    subjectRows.push({ subject, lane: lane.id, sensitive: lane.sensitive, modules: count, pages: files.length, words, flagged: sensitive });
  }
}

/* ---------- write ---------- */

const usable = modules.filter((m) => m.kind === 'module');
const index = {
  built: stamp(), source: src, sourceKind, subjects: subjectRows,
  totals: { subjects: subjectRows.length, pages: modules.length, modules: usable.length, words: usable.reduce((a, m) => a + m.words, 0), sensitive: usable.filter((m) => m.sensitive).length },
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
  `Built ${index.built} by \`npm run herald:index\` from ${SOURCE_NAME[sourceKind]}. Regenerate after the Archives change. Full index at \`data/archives/index.json\` (not committed).`,
  '',
  '## Lanes',
  '',
  '| Lane | Modules | Handling |', '| --- | --- | --- |',
  ...Object.entries(laneCounts).sort((a, b) => b[1] - a[1]).map(([l, n]) => `| ${l} | ${n} | ${l === 'external' ? '**excluded** — reposted third-party writing; not a source' : ['health', 'trading'].includes(l) ? '**sensitive** — never picked unless named; compliance gate hard-fails dosing, compounds and claims' : 'open'} |`),
  '',
  '## Subjects',
  '',
  '| Subject | Lane | Modules | Words | Flagged |', '| --- | --- | --- | --- | --- |',
  ...subjectRows.sort((a, b) => b.modules - a.modules).map((r) => `| ${r.subject} | ${r.lane}${r.sensitive ? ' ⚠' : ''} | ${r.modules} | ${r.words.toLocaleString('en-GB')} | ${r.flagged || ''} |`),
  '',
].join('\n');
const status = writeGenerated(path.join(brain, '05-Knowledge', 'Archives-Map.md'), map, { write: !statsOnly });

/* ---------- report ---------- */
console.log(`Archives index ${statsOnly ? '(stats only)' : 'built'} from ${SOURCE_NAME[sourceKind]}: ${src}`);
console.log(`  ${index.totals.subjects} subjects · ${index.totals.modules} modules · ${index.totals.pages} pages · ${index.totals.words.toLocaleString('en-GB')} words · ${index.totals.sensitive} sensitive`);
console.log(`  lanes: ${Object.entries(laneCounts).map(([l, n]) => `${l} ${n}`).join(' · ')}`);
if (!statsOnly) console.log(`  → ${path.relative(REPO, INDEX_FILE)}\n  → ${path.relative(REPO, MODULES_DIR)}/*.txt\n  → brain/05-Knowledge/Archives-Map.md (${status})`);
