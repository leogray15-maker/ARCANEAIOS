#!/usr/bin/env node
/**
 * The Archives indexer, over its sources.
 *
 *   node .claude/skills/herald/scripts/archives.test.mjs
 *
 * The point of these is the contract *between* sources: a module indexed
 * from Notion must come out the same shape as one indexed from the vault,
 * because everything downstream — pick, the compliance gate, emit, the
 * map — reads that shape and not the source. So the fixture describes one
 * small Archives twice, and the test asserts the two indexes agree on
 * subjects, lanes, hubs, ids and sensitivity.
 *
 * Notion is stubbed at `fetch`, so this needs no token and no network.
 * Every run works in a temp dir (HERALD_DATA, ARCANE_BRAIN) and can never
 * touch a real index or a real brain.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { COURSES, MODULES_PER, ROOT, pages, writeVault, stubFetch } from './archives-fixture.test.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEXER = path.join(HERE, 'index-archives.mjs');
const STUB = path.join(HERE, 'notion-stub.test.mjs');
let failures = 0;

const ok = (name, cond, detail = '') => {
  if (cond) console.log(`✓ ${name}`);
  else { console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`); failures++; }
};

/** Run the real indexer as a child process and read back what it wrote. */
function runIndexer(args, env) {
  const r = spawnSync(process.execPath, [INDEXER, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`indexer failed: ${(r.stderr || r.stdout || '').trim()}`);
  return JSON.parse(fs.readFileSync(path.join(env.HERALD_DATA, 'index.json'), 'utf8'));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arcane-archives-'));
const vault = writeVault(path.join(tmp, 'vault'));
const brain = path.join(tmp, 'brain');
fs.mkdirSync(path.join(brain, '05-Knowledge'), { recursive: true });
fs.writeFileSync(path.join(brain, 'CLAUDE.md'), '# a throwaway brain, so the map has somewhere to land\n');

/* ---------- 1. the vault, as the baseline ---------- */

const vaultEnv = { HERALD_DATA: path.join(tmp, 'data-vault'), ARCANE_BRAIN: brain, ARCANE_VAULT: vault };
const fromVault = runIndexer(['--from', 'vault'], vaultEnv);
const expectedModules = COURSES.length * MODULES_PER + 1;   // the reposted piece is a module too

ok('vault: every page is indexed', fromVault.totals.pages === pages.length, `${fromVault.totals.pages} of ${pages.length}`);
ok('vault: courses are indexes, not modules', fromVault.totals.modules === expectedModules, `${fromVault.totals.modules}, expected ${expectedModules}`);
ok('vault: each course became a subject', COURSES.every((c) => fromVault.subjects.some((s) => s.subject === c.title)), fromVault.subjects.map((s) => s.subject).join(', '));
ok('vault: lanes follow the subject', COURSES.every((c) => fromVault.modules.some((m) => m.subject === c.title && m.lane === c.lane)));
ok('vault: the health course is sensitive', fromVault.modules.filter((m) => m.subject === 'Biohacking' && m.kind === 'module').every((m) => m.sensitive));
ok('vault: the reposted piece is external', fromVault.modules.some((m) => /Why You Are Poor/.test(m.title) && m.lane === 'external'));
ok('vault: module text is written out', fs.existsSync(path.join(vaultEnv.HERALD_DATA, 'modules', `${fromVault.modules.find((m) => m.kind === 'module').id}.txt`)));

/* ---------- 2. the Notion reader, in isolation ---------- */

const calls = stubFetch();
const { fetchArchives, __test } = await import('./notion.mjs');
const { notes, source } = await fetchArchives({ token: 'test-token', onProgress: () => {} });

ok('notion: every page is walked', notes.length === pages.length, `${notes.length} of ${pages.length}`);
ok('notion: the root is found by title', source === `notion:${ROOT.id}`, source);
ok('notion: prose survives the block walk', !!notes.find((n) => n.title === 'Mindset Mastery 1')?.text.includes('The feeling arrives after.'));
ok('notion: sub-pages become links, not text', !notes.find((n) => n.notionId === ROOT.id)?.text.includes('Mindset Mastery'));
ok('notion: a course links to its modules', notes.find((n) => n.title === 'Online Sales')?.links.length === MODULES_PER);
ok('notion: only reads were issued', calls.length > 0 && calls.every((c) => c === 'POST /v1/search' || /^GET \/v1\/blocks\//.test(c)), calls.join(' · '));

/* ---------- 3. Notion, through the real indexer, against the vault ---------- */

const notionEnv = { HERALD_DATA: path.join(tmp, 'data-notion'), ARCANE_BRAIN: brain, NOTION_TOKEN: 'test-token', NODE_OPTIONS: `--import=${pathToUrl(STUB)}` };
let fromNotion = null;
try {
  fromNotion = runIndexer(['--from', 'notion'], notionEnv);
  ok('notion: the indexer runs end to end', true);
} catch (e) {
  ok('notion: the indexer runs end to end', false, e.message);
}

if (fromNotion) {
  const subjects = (ix) => ix.subjects.map((s) => `${s.subject}:${s.lane}:${s.modules}`).sort().join(' | ');
  const ids = (ix) => ix.modules.map((m) => m.id).sort().join(',');
  ok('notion: same page count as the vault', fromNotion.totals.pages === fromVault.totals.pages, `${fromNotion.totals.pages} vs ${fromVault.totals.pages}`);
  ok('notion: same module count as the vault', fromNotion.totals.modules === fromVault.totals.modules, `${fromNotion.totals.modules} vs ${fromVault.totals.modules}`);
  ok('notion: same subjects, lanes and counts', subjects(fromNotion) === subjects(fromVault), `\n    notion: ${subjects(fromNotion)}\n    vault:  ${subjects(fromVault)}`);
  ok('notion: module ids match the vault exactly', ids(fromNotion) === ids(fromVault));
  ok('notion: the index records its source', fromNotion.sourceKind === 'notion', fromNotion.sourceKind);

  // The cache is what makes this affordable to run on a schedule: an
  // unchanged tree must cost the search sweep and no block reads at all.
  const cached = runIndexer(['--from', 'notion'], notionEnv);
  ok('notion: a second run agrees with the first', ids(cached) === ids(fromNotion));
  ok('notion: the second run is served from cache', fs.readdirSync(path.join(notionEnv.HERALD_DATA, 'notion-cache')).length === pages.length);
}

/* ---------- 4. the read-only guarantee ---------- */

for (const [method, p] of [['PATCH', '/pages/abc'], ['DELETE', '/blocks/abc'], ['POST', '/pages/abc'], ['PUT', '/blocks/abc/children']]) {
  let refused = false;
  try { await __test.api(p, { method, token: 'x' }); } catch (e) { refused = /refused/.test(e.message); }
  ok(`notion: ${method} ${p} is refused before it is sent`, refused);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `\n✗ archives: ${failures} failed` : `\n✓ archives: ${pages.length}-page fixture, vault and Notion agree`);
process.exit(failures ? 1 : 0);

/** NODE_OPTIONS --import wants a URL on every platform. */
function pathToUrl(p) { return new URL(`file://${p}`).href; }
