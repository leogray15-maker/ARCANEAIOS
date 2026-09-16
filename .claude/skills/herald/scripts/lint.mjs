#!/usr/bin/env node
/**
 * Lint a draft, or a folder of drafts. This is the gate.
 *
 *   npm run herald:lint -- .herald-staging          # everything staged
 *   npm run herald:lint -- path/to/draft.md --json
 *   npm run herald:lint -- --self-test              # prove the patterns still bite
 *
 * A draft passes when its frontmatter is complete and valid, its body has
 * the shape its format demands, and the compliance scan finds no HARD hit.
 * WARN hits do not fail the draft; they are returned so emit.mjs can write
 * them into `compliance_notes`, where a human will read that line twice.
 *
 * Exit 1 on any hard failure. emit.mjs refuses the whole batch on exit 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { FORMATS, FORMAT_IDS, PLATFORMS, STATUSES, CTAS, scan, countWords, firstLine, ID_PREFIX } from './lib.mjs';
import { parseFrontmatter } from '../../../../tools/lib/brain.mjs';

const REQUIRED = ['type', 'title', 'format', 'platform', 'status', 'agent', 'source_subject', 'source_module', 'source_ref', 'angle', 'hook', 'cta', 'tags'];

/** Lint one draft's text. Returns { ok, errors, warnings, data, body, words }. */
export function lintText(text, name = 'draft') {
  const errors = [];
  const warnings = [];
  const { data, body } = parseFrontmatter(text);
  if (!data) return { ok: false, errors: ['no frontmatter block'], warnings, data: null, body, words: 0 };

  for (const k of REQUIRED) if (data[k] === undefined) errors.push(`missing frontmatter: ${k}`);
  if (data.type !== 'content-draft') errors.push(`type must be content-draft (got ${data.type})`);
  if (!FORMAT_IDS.includes(data.format)) errors.push(`format must be one of ${FORMAT_IDS.join('|')} (got ${data.format})`);
  if (!PLATFORMS.includes(data.platform)) errors.push(`platform must be one of ${PLATFORMS.join('|')} (got ${data.platform})`);
  if (data.status !== 'draft') errors.push(`status must be draft when emitted (got ${data.status}) — only a human moves it`);
  if (data.agent !== 'HERALD') errors.push(`agent must be HERALD (got ${data.agent})`);
  if (!CTAS.includes(data.cta)) errors.push(`cta must be one of ${CTAS.join('|')} (got ${data.cta})`);
  if (!Array.isArray(data.tags)) errors.push('tags must be a list');
  if (data.id && data.id !== `${ID_PREFIX}-YYYYMMDD-NNN` && !new RegExp(`^${ID_PREFIX}-\\d{8}-\\d{3}$`).test(data.id)) errors.push(`id must be ${ID_PREFIX}-YYYYMMDD-NNN (got ${data.id})`);
  for (const k of ['title', 'source_subject', 'source_module', 'source_ref', 'angle', 'hook']) if (data[k] === '') errors.push(`${k} is empty`);
  if (data.compliance && data.compliance !== 'pass') warnings.push('compliance field is set by lint, not by hand — it will be overwritten');

  const clean = body.replace(/<!--[\s\S]*?-->/g, '').trim();
  const words = countWords(clean);
  if (!clean) errors.push('body is empty');

  const spec = FORMATS[data.format];
  if (spec) {
    const [lo, hi] = spec.words;
    if (words < lo) errors.push(`${data.format} is ${words} words; minimum ${lo}`);
    if (words > hi) errors.push(`${data.format} is ${words} words; maximum ${hi}`);
    if (!spec.platforms.includes(data.platform)) warnings.push(`${data.format} is unusual on ${data.platform} (expected ${spec.platforms.join('/')})`);
  }

  const hook = firstLine(clean);
  if (data.hook && hook && norm(hook) !== norm(data.hook)) errors.push(`hook in frontmatter does not match the first line of the body`);
  if (hook.length > 140 && data.format !== 'email') warnings.push(`hook is ${hook.length} chars — a hook should land in one breath`);

  if (data.format === 'thread') {
    const posts = clean.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    if (posts.length < 5 || posts.length > 9) errors.push(`thread has ${posts.length} posts; needs 5–9`);
    posts.forEach((p, i) => {
      if (!new RegExp(`^${i + 1}/`).test(p)) errors.push(`thread post ${i + 1} must start with "${i + 1}/"`);
      const len = p.replace(/^\d+\/\s*/, '').length;
      if (len > 280) errors.push(`thread post ${i + 1} is ${len} chars; max 280`);
    });
  }
  if (data.format === 'email') {
    const ls = clean.split('\n');
    if (!/^Subject:\s*\S/.test(ls[0] || '')) errors.push('email must start with "Subject: …"');
    if (!/^Preview:\s*\S/.test(ls[1] || '')) errors.push('email second line must be "Preview: …"');
    if (!/\bLeo\s*$/m.test(clean)) warnings.push('email is not signed "Leo"');
    if (data.cta === 'none') warnings.push('email has cta: none — an email usually earns one');
  }
  if (data.format === 'teaser' && !/[?…]\s*$|\.{3}\s*$/.test(clean) && !/\b(archives|module|inside|full)\b/i.test(clean)) {
    warnings.push('teaser should end on an open loop or point at the Archives');
  }

  const hits = scan(data.format === 'email' ? clean.replace(/^Subject:.*\n|^Preview:.*\n/gm, '') : clean);
  for (const h of hits.hard) errors.push(`COMPLIANCE ${h.id}: ${h.why} — ${h.where}`);
  for (const h of hits.warn) warnings.push(`${h.id}: ${h.why} — ${h.where}`);

  return { ok: errors.length === 0, errors, warnings, data, body: clean, words, name };
}

const norm = (s) => s.replace(/^\d+\/\s*/, '').replace(/^(Subject:)\s*/i, '').replace(/[\s"“”'’.!?,]+/g, ' ').trim().toLowerCase();

/** Lint every .md in a dir (or one file). */
export function lintPath(p) {
  const files = fs.statSync(p).isDirectory()
    ? fs.readdirSync(p).filter((f) => f.endsWith('.md') && !f.startsWith('.')).sort().map((f) => path.join(p, f))
    : [p];
  return files.map((f) => lintText(fs.readFileSync(f, 'utf8'), path.basename(f)));
}

/* ---------- self-test ---------- */
function selfTest() {
  const base = (body, over = {}) => {
    const d = { type: 'content-draft', id: 'HER-YYYYMMDD-NNN', title: 'T', format: 'short', platform: 'X', status: 'draft', agent: 'HERALD',
      run: '', source_subject: 'Mindset Mastery', source_module: 'M', source_ref: 'r', source_url: '', angle: 'a', hook: firstLine(body), cta: 'none', tags: ['x'], word_count: 0, compliance: 'pass', compliance_notes: '', created: '', updated: '', ...over };
    return `---\n${Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : JSON.stringify(String(v))}`).join('\n')}\n---\n${body}\n`;
  };
  const pad = 'One idea. Then the turn. Then the close. '.repeat(3);
  const cases = [
    ['clean short passes',               base(`There is never a hater doing better than you.\n\n${pad}`), true],
    ['dose unit blocks',                  base(`Take 250mcg every morning.\n\n${pad}`), false],
    ['named compound blocks',             base(`BPC-157 changed my life.\n\n${pad}`), false],
    ['claim verb + condition blocks',     base(`This heals your gut in a week.\n\n${pad}`), false],
    ['metaphorical heal passes',          base(`Heal your relationship with money first.\n\n${pad}`), true],
    ['guaranteed returns blocks',         base(`Guaranteed returns if you follow this.\n\n${pad}`), false],
    ['hook mismatch blocks',              base(`Real first line.\n\n${pad}`, { hook: 'Different hook' }), false],
    ['status not draft blocks',           base(`Hook.\n\n${pad}`, { status: 'approved' }), false],
    ['short over 120 words blocks',       base(`Hook.\n\n${'word '.repeat(130)}`), false],
    ['thread needs numbering',            base(`1/ Hook here.\n\nSecond without number.\n\n3/ x\n\n4/ x\n\n5/ ${pad}`, { format: 'thread' }), false],
    ['thread well-formed passes',         base(`1/ Hook here and a bit more.\n\n2/ ${pad}\n\n3/ ${pad}\n\n4/ ${pad}\n\n5/ ${pad}\n\n6/ ${pad}\n\n7/ Close it. ${pad}`, { format: 'thread', hook: 'Hook here and a bit more.' }), true],
    ['email needs subject/preview',       base(`Just a body.\n\n${pad.repeat(2)}`, { format: 'email', platform: 'Email', cta: 'archives' }), false],
    ['email well-formed passes',          base(`Subject: The hater map\nPreview: Envy below, fear above.\n\n${pad.repeat(8)}\n\nLeo`, { format: 'email', platform: 'Email', cta: 'archives', hook: 'The hater map' }), true],
  ];
  let bad = 0;
  for (const [name, text, expect] of cases) {
    const r = lintText(text, name);
    const pass = r.ok === expect;
    if (!pass) bad++;
    console.log(`${pass ? '✓' : '✗'} ${name}${pass ? '' : ` — expected ${expect ? 'pass' : 'fail'}, got ${r.ok ? 'pass' : 'fail'}: ${r.errors.join('; ') || 'no errors'}`}`);
  }
  console.log(bad ? `\n✗ ${bad} self-test${bad > 1 ? 's' : ''} failed` : `\n✓ lint self-test: ${cases.length}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

/* ---------- cli ---------- */
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) selfTest();
  const target = args.find((a) => !a.startsWith('--')) || path.resolve(process.cwd(), '.herald-staging');
  if (!fs.existsSync(target)) { console.error(`✗ nothing at ${target}`); process.exit(1); }
  const results = lintPath(target);
  if (args.includes('--json')) { console.log(JSON.stringify(results.map(({ body, ...r }) => r), null, 1)); process.exit(results.every((r) => r.ok) ? 0 : 1); }
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name}  ${r.data?.format || '?'} · ${r.words}w`);
    for (const e of r.errors) console.log(`    ✗ ${e}`);
    for (const w of r.warnings) console.log(`    ~ ${w}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n✗ ${failed} of ${results.length} failed — nothing will be emitted until they pass` : `\n✓ ${results.length} draft${results.length === 1 ? '' : 's'} pass`);
  process.exit(failed ? 1 : 0);
}
