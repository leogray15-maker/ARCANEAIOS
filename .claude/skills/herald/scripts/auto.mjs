#!/usr/bin/env node
/**
 * HERALD, unattended.
 *
 *   npm run herald:auto                      # one run: pick a module, write five cuts, lint, emit
 *   npm run herald:auto -- --push            # …then regenerate the board and exports, commit, push (the site redeploys)
 *   npm run herald:auto -- --lane sales --formats short,thread --count 2
 *   npm run herald:auto -- --dry             # write to staging and lint, but do not emit
 *   npm run herald:auto -- --mock            # skip the API: stage the last run's bodies to test the plumbing
 *
 * The same pipeline a person runs through /herald, with the writing step
 * done by Claude through the API: the module text, the voice, format and
 * compliance references and the frontmatter contract go in; five drafts
 * come out as structured JSON; they are staged, linted (the gate never
 * moves), repaired once if the gate refuses, and emitted — which copies
 * the source note first. Every run is traced by emit.mjs like any other.
 *
 * Needs ANTHROPIC_API_KEY in the environment or in .env at the repo root.
 * Nothing here touches the vault's Archives notes; the brain is the only
 * thing written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { SKILL_DIR, REPO, STAGING_DIR, FORMATS, FORMAT_IDS, PLATFORMS, loadIndex, moduleText, sourceGate, subjectAllowed } from './lib.mjs';
import { lintPath } from './lint.mjs';
import { brainDir } from '../../../../tools/lib/brain.mjs';

/* ---------- env ---------- */
try { for (const line of fs.readFileSync(path.join(REPO, '.env'), 'utf8').split('\n')) { const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch {}
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] ?? true) : d; };
const has = (k) => args.includes(k);
const MODEL = process.env.HERALD_MODEL || 'claude-opus-5';
const formats = String(opt('--formats', FORMAT_IDS.join(','))).split(',').map((s) => s.trim()).filter((f) => FORMAT_IDS.includes(f));
const count = Number(opt('--count', 1));
const dry = has('--dry'), push = has('--push'), mock = has('--mock');
if (!mock && !process.env.ANTHROPIC_API_KEY) { console.error('✗ ANTHROPIC_API_KEY is not set (put it in .env at the repo root).'); process.exit(1); }

const brain = brainDir();
const index = loadIndex();
const gate = sourceGate(brain);
const ref = (f) => fs.readFileSync(path.join(SKILL_DIR, 'references', f), 'utf8');
const say = (m) => console.log(`[herald ${new Date().toISOString().slice(11, 19)}] ${m}`);

/* ---------- pick ---------- */
const used = new Set();
try { for (const line of fs.readFileSync(path.join(brain, '02-Content', 'Content-Log.md'), 'utf8').split('\n')) { const c = line.split('|').map((s) => s.trim()); if (c.length > 6 && c[1].startsWith('HER-')) used.add(c[6]); } } catch {}
let pool = index.modules.filter((m) => m.kind === 'module' && m.words >= 350 && m.words <= 6000 && !['meta', 'external'].includes(m.lane) && !m.sensitive && subjectAllowed(m.subject, gate) && !used.has(m.title));
if (opt('--lane')) pool = pool.filter((m) => m.lane === opt('--lane'));
if (opt('--subject')) pool = pool.filter((m) => m.subject.toLowerCase().includes(String(opt('--subject')).toLowerCase()));
if (!pool.length) { console.error('✗ nothing left to pick — loosen the filters or widen Archives-Sources.md'); process.exit(1); }
const picks = [];
for (let i = 0; i < count && pool.length; i++) { const w = pool.map((m) => Math.log(m.words) * (0.6 + Math.random())); const j = w.indexOf(Math.max(...w)); picks.push(pool.splice(j, 1)[0]); }

/* ---------- write ---------- */
const client = new Anthropic();
const system = [
  'You are HERALD, the content creator inside THE ARCANE. You write as Leo. You produce post-ready drafts from one module of his Archives, and nothing else.',
  'Read the three references below and obey them exactly. The compliance rules are enforced by a lint after you write; a draft that trips one is thrown away, so write inside the rules rather than near them.',
  '\n## VOICE\n' + ref('voice.md'), '\n## FORMATS\n' + ref('formats.md'), '\n## COMPLIANCE\n' + ref('compliance.md'),
  '\nHard requirements for every draft: the `hook` field is exactly the first line of the body. Threads are 5–9 posts, each starting "1/", "2/" … on its own paragraph, each under 280 characters after the number. Emails start with a "Subject: …" line then a "Preview: …" line, then a blank line, then the body, and end with "Leo" on its own line. Word counts: ' + FORMAT_IDS.map((f) => `${f} ${FORMATS[f].words[0]}–${FORMATS[f].words[1]}`).join(', ') + '. No hashtags, no emojis, no preamble. Never name a compound, a dose, or a treatment. Never promise a return.',
].join('\n');

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    angle: { type: 'string', description: 'One line: what the reader believes walking in, what they believe walking out.' },
    drafts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      format: { type: 'string', enum: FORMAT_IDS }, platform: { type: 'string', enum: PLATFORMS }, title: { type: 'string' }, hook: { type: 'string' },
      cta: { type: 'string', enum: ['none', 'archives', 'reply', 'follow', 'link'] }, tags: { type: 'array', items: { type: 'string' } }, body: { type: 'string' },
    }, required: ['format', 'platform', 'title', 'hook', 'cta', 'tags', 'body'] } },
  }, required: ['angle', 'drafts'],
};

async function write(mod, repair = null) {
  if (mock) return mockDrafts(mod);
  const text = moduleText(mod);
  const ask = `Module: "${mod.title}" from the course "${mod.subject}" (${mod.words} words).\n\nWrite one draft for each of these formats: ${formats.join(', ')}. Choose the platform each belongs on. Same idea, one cut per surface.\n\n<module>\n${text.slice(0, 40000)}\n</module>` + (repair ? `\n\nYour previous drafts failed the gate. Fix every one of these and return the full set again:\n${repair}` : '');
  let r;
  try {
    r = await client.messages.create({
      model: MODEL, max_tokens: 16000, system, thinking: { type: 'adaptive' }, output_config: { effort: 'high', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: ask }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('the API key was rejected — check ANTHROPIC_API_KEY in .env');
    if (e instanceof Anthropic.RateLimitError) throw new Error('rate limited — try again in a minute');
    if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message)) throw new Error('the Anthropic account has no credits — top up at console.anthropic.com → Plans & Billing, then run again');
    if (e instanceof Anthropic.APIError) throw new Error(`API error ${e.status}: ${e.message}`);
    throw e;
  }
  if (r.stop_reason === 'refusal') throw new Error(`refused: ${r.stop_details?.category || ''} ${r.stop_details?.explanation || ''}`);
  const out = r.content.find((b) => b.type === 'text')?.text || '';
  const parsed = JSON.parse(out);
  say(`${MODEL}: ${parsed.drafts.length} drafts · ${r.usage.input_tokens} in / ${r.usage.output_tokens} out`);
  return parsed;
}

function stage(mod, parsed) {
  fs.rmSync(STAGING_DIR, { recursive: true, force: true }); fs.mkdirSync(STAGING_DIR, { recursive: true });
  parsed.drafts.forEach((d, i) => {
    const fm = { type: 'content-draft', id: 'HER-YYYYMMDD-NNN', title: d.title.slice(0, 60), format: d.format, platform: d.platform, status: 'draft', agent: 'HERALD', run: '', source_subject: mod.subject, source_module: mod.title, source_ref: mod.id, source_url: mod.notionId ? `https://www.notion.so/${mod.notionId}` : '', angle: parsed.angle, hook: d.hook, cta: d.cta, tags: [...new Set([mod.lane, ...d.tags.map((t) => t.toLowerCase().replace(/[^a-z0-9-]/g, ''))])].filter(Boolean).slice(0, 5), word_count: 0, compliance: 'pass', compliance_notes: '', created: '', updated: '', approved_by: '', scheduled_for: '', posted_at: '', posted_url: '' };
    const yaml = Object.entries(fm).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : JSON.stringify(String(v))}`).join('\n');
    fs.writeFileSync(path.join(STAGING_DIR, `${String(i + 1).padStart(2, '0')}-${d.format}.md`), `---\n${yaml}\n---\n${d.body.trim()}\n`);
  });
}

/** A stand-in for the model, for testing the plumbing: the bodies of drafts already in the brain, re-titled for this module. */
function mockDrafts(mod) {
  const dir = path.join(brain, '02-Content', 'Drafts');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
  const drafts = [];
  for (const f of formats) {
    const src = files.find((x) => x.includes(`-${f}-`)); if (!src) continue;
    const txt = fs.readFileSync(path.join(dir, src), 'utf8'); const body = txt.replace(/^---[\s\S]*?---\n/, '').trim();
    const hook = f === 'email' ? /^Subject:\s*(.*)$/m.exec(body)?.[1] : body.split('\n').find((l) => l.trim());
    drafts.push({ format: f, platform: FORMATS[f].platforms[0], title: `Mock ${f} for ${mod.title.slice(0, 30)}`, hook: hook.replace(/^\d+\/\s*/, ''), cta: f === 'short' ? 'none' : 'archives', tags: ['mock'], body });
  }
  return { angle: `Mock run for "${mod.title}" — bodies borrowed from earlier drafts to test the pipeline.`, drafts };
}

/* ---------- run ---------- */
let emitted = 0;
for (const mod of picks) {
  say(`source: ${mod.title} · ${mod.subject} · ${mod.words}w${mock ? ' · MOCK' : ''}`);
  let parsed;
  try { parsed = await write(mod); } catch (e) { console.error(`✗ ${e.message}`); process.exit(2); }
  stage(mod, parsed);
  let results = lintPath(STAGING_DIR);
  let bad = results.filter((r) => !r.ok);
  if (bad.length) {
    say(`gate refused ${bad.length}: repairing once`);
    try { parsed = await write(mod, bad.map((r) => `${r.data?.format || r.name}: ${r.errors.join('; ')}`).join('\n')); } catch (e) { console.error(`✗ ${e.message}`); process.exit(2); }
    stage(mod, parsed);
    results = lintPath(STAGING_DIR); bad = results.filter((r) => !r.ok);
  }
  if (bad.length) { say(`still refused after repair — skipping this module: ${bad.map((r) => r.errors[0]).join(' | ')}`); continue; }
  say(`gate: ${results.length} pass${results.some((r) => r.warnings.length) ? ` (${results.filter((r) => r.warnings.length).length} with notes)` : ''}`);
  if (dry) { say(`dry run — staged in ${path.relative(REPO, STAGING_DIR)}`); continue; }
  const e = spawnSync('node', [path.join(SKILL_DIR, 'scripts', 'emit.mjs'), '--note', `auto run (${MODEL}) from "${mod.title}"`], { encoding: 'utf8' });
  process.stdout.write(e.stdout); if (e.status !== 0) { process.stderr.write(e.stderr); continue; }
  emitted += results.length;
}

/* ---------- after ---------- */
if (emitted && !dry) {
  const run = (cmd, argv) => { const r = spawnSync(cmd, argv, { cwd: REPO, encoding: 'utf8' }); if (r.status !== 0) say(`${cmd} ${argv.join(' ')} → ${r.stderr.trim().split('\n').pop()}`); return r.status === 0; };
  run('node', ['tools/content-board.mjs']);
  run('node', ['tools/brief.mjs']);   // the brief, then the export the site reads
  if (push) {
    run('git', ['add', 'brain', 'apps/facility/public/brain.json']);
    const msg = `HERALD: ${emitted} draft${emitted === 1 ? '' : 's'} from ${picks.map((m) => `"${m.title}"`).join(', ')}`;
    if (run('git', ['commit', '-q', '-m', msg])) { run('git', ['push', '-q', 'origin', 'HEAD']) ? say('pushed — the site will redeploy with the new drafts') : say('push failed — commit is local; push by hand'); }
  }
}
say(`done — ${emitted} draft${emitted === 1 ? '' : 's'} emitted`);
