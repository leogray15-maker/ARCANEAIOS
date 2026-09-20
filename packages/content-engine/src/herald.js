/**
 * HERALD's generation core.
 *
 * One module in, up to five linted drafts out, landed in the database with
 * a run record and a system event. This is the same pipeline the skill
 * runs by hand (SKILL.md) and `herald:auto` runs unattended: the module
 * text, the voice, format and compliance references and the frontmatter
 * contract go to Claude; drafts come back as structured JSON; they are
 * staged as the Markdown the lint understands, gated, repaired once if the
 * gate refuses, and only then written. The gate (`lint.mjs`) is imported,
 * never re-implemented, so there is exactly one set of patterns.
 *
 * Nothing here reads a vault or a Notion page: the module comes from the
 * caller (the database, or the local index). Nothing here moves a status:
 * every draft lands as `draft`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMATS, FORMAT_IDS, PLATFORMS, CTAS, countWords } from '../../../.claude/skills/herald/scripts/lib.mjs';
import { lintText } from '../../../.claude/skills/herald/scripts/lint.mjs';
import { drafts as draftsTable, runs as runsTable, nextId } from '../../database/src/content.js';
import { mockDrafts } from './mock.js';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const SKILL_DIR = path.join(REPO, '.claude', 'skills', 'herald');
export const DEFAULT_MODEL = 'claude-opus-5';
export const AGENT = 'HERALD';
export const SKILL = 'herald';
export const MAX_MODULE_CHARS = 40000;
export { FORMATS, FORMAT_IDS, PLATFORMS, CTAS };

const ref = (f) => fs.readFileSync(path.join(SKILL_DIR, 'references', f), 'utf8');

/** The system prompt: who HERALD is, the three references, and the hard shape rules the lint will check. Built once per process. */
let SYSTEM = null;
export function systemPrompt() {
  if (SYSTEM) return SYSTEM;
  SYSTEM = [
    'You are HERALD, the content creator inside THE ARCANE. You write as Leo. You produce post-ready drafts from one module of his Archives, and nothing else.',
    'Read the three references below and obey them exactly. The compliance rules are enforced by a lint after you write; a draft that trips one is thrown away, so write inside the rules rather than near them.',
    '\n## VOICE\n' + ref('voice.md'), '\n## FORMATS\n' + ref('formats.md'), '\n## COMPLIANCE\n' + ref('compliance.md'),
    '\nHard requirements for every draft: the `hook` field is exactly the first line of the body. Threads are 5–9 posts, each starting "1/", "2/" … on its own paragraph, each under 280 characters after the number. Emails start with a "Subject: …" line then a "Preview: …" line, then a blank line, then the body, and end with "Leo" on its own line. Word counts: ' + FORMAT_IDS.map((f) => `${f} ${FORMATS[f].words[0]}–${FORMATS[f].words[1]}`).join(', ') + '. No hashtags, no emojis, no preamble. Never name a compound, a dose, or a treatment. Never promise a return. Never invent an experience Leo did not have: if the module does not say it happened, it did not.',
  ].join('\n');
  return SYSTEM;
}

export const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    angle: { type: 'string', description: 'One line: what the reader believes walking in, what they believe walking out.' },
    drafts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      format: { type: 'string', enum: FORMAT_IDS }, platform: { type: 'string', enum: PLATFORMS }, title: { type: 'string' }, hook: { type: 'string' },
      cta: { type: 'string', enum: CTAS }, tags: { type: 'array', items: { type: 'string' } }, body: { type: 'string' },
    }, required: ['format', 'platform', 'title', 'hook', 'cta', 'tags', 'body'] } },
  }, required: ['angle', 'drafts'],
};

/** Turn an API error into the sentence the operator needs. */
export function explain(e) {
  const msg = e?.message || String(e);
  if (e?.status === 401) return 'the API key was rejected — check ANTHROPIC_API_KEY';
  if (e?.status === 429) return 'rate limited by the API — try again in a minute';
  if (/credit balance/i.test(msg)) return 'the Anthropic account has no API credits — top up at console.anthropic.com → Plans & Billing (API credits are separate from a Claude subscription)';
  if (e?.status) return `API error ${e.status}: ${msg}`;
  return msg;
}

/**
 * Ask Claude for the drafts. `client` is an Anthropic client; `repair` is
 * the lint's complaint from a previous attempt, if any.
 */
export async function writeDrafts({ client, model = DEFAULT_MODEL, effort = 'high', module, formats = FORMAT_IDS, repair = null, variantOf = null }) {
  const text = String(module.body || '').slice(0, MAX_MODULE_CHARS);
  const ask = [
    `Module: "${module.title}" from the course "${module.subject}" (${module.words} words).`,
    '',
    `Write one draft for each of these formats: ${formats.join(', ')}. Choose the platform each belongs on. Same idea, one cut per surface.`,
    variantOf ? `\nThis is an alternate take. A draft already exists with this hook: "${variantOf.hook}". Find a different angle or a different line from the module — do not restate that one.` : '',
    '',
    `<module>\n${text}\n</module>`,
    repair ? `\nYour previous drafts failed the gate. Fix every one of these and return the full set again:\n${repair}` : '',
  ].join('\n');
  let r;
  try {
    r = await client.messages.create({
      model, max_tokens: 16000, system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }],
      thinking: { type: 'adaptive' }, output_config: { effort, format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: ask }],
    });
  } catch (e) { throw new Error(explain(e)); }
  if (r.stop_reason === 'refusal') throw new Error(`refused: ${r.stop_details?.category || ''} ${r.stop_details?.explanation || ''}`.trim());
  const out = r.content.find((b) => b.type === 'text')?.text || '';
  let parsed;
  try { parsed = JSON.parse(out); } catch { throw new Error('the model returned something that is not the draft set'); }
  parsed.drafts = (parsed.drafts || []).filter((d) => formats.includes(d.format));
  return { ...parsed, usage: { in: r.usage.input_tokens, out: r.usage.output_tokens, cached: r.usage.cache_read_input_tokens || 0 } };
}

/** The frontmatter + body the lint reads, for one generated draft. Ids are placeholders; the landing step mints real ones. */
export function stageText(module, parsed, d) {
  const fm = {
    type: 'content-draft', id: 'HER-YYYYMMDD-NNN', title: String(d.title || '').slice(0, 60), format: d.format, platform: d.platform, status: 'draft', agent: AGENT, run: '',
    source_subject: module.subject, source_module: module.title, source_ref: module.id, source_url: module.source_url || (module.notion_id ? `https://www.notion.so/${module.notion_id}` : ''),
    angle: parsed.angle, hook: d.hook, cta: d.cta, tags: [...new Set([module.lane, ...(d.tags || []).map((t) => String(t).toLowerCase().replace(/[^a-z0-9-]/g, ''))])].filter(Boolean).slice(0, 5),
    word_count: 0, compliance: 'pass', compliance_notes: '', created: '', updated: '', approved_by: '', scheduled_for: '', posted_at: '', posted_url: '',
  };
  const yaml = Object.entries(fm).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : JSON.stringify(String(v))}`).join('\n');
  return `---\n${yaml}\n---\n${String(d.body || '').trim()}\n`;
}

/** Lint a parsed set. Returns one result per draft, in order. */
export function gate(module, parsed) {
  return parsed.drafts.map((d, i) => ({ ...lintText(stageText(module, parsed, d), `${String(i + 1).padStart(2, '0')}-${d.format}`), draft: d }));
}

/** Lint a single edited body against its draft's format — used when Leo edits on the floor. */
export function lintEdit(draft, body) {
  const module = { id: draft.source_ref || draft.module_id || 'x', title: draft.source_module || 'x', subject: draft.source_subject || 'x', lane: (draft.tags || [])[0] || 'mindset', source_url: draft.source_url || '' };
  const first = body.split('\n').map((l) => l.trim()).find(Boolean) || '';
  const hook = draft.format === 'email' ? first.replace(/^Subject:\s*/i, '') : first.replace(/^\d+\/\s*/, '');
  return lintText(stageText(module, { angle: draft.angle || 'x' }, { ...draft, hook, body }), draft.id);
}

/**
 * The whole run: mint a run id, write, gate, repair once, land what passed,
 * record the run. Returns { run, drafts, refused, warnings }. Throws only
 * when nothing could be attempted (no module, no client); a run that the
 * gate refuses ends with status `refused` and an explanation, not a throw.
 */
export async function generate({ db, client, model = DEFAULT_MODEL, effort = 'high', module, formats = FORMAT_IDS, device = '', note = '', mock = false, parent = null }) {
  if (!module?.body) throw new Error('module has no text to write from');
  formats = formats.filter((f) => FORMAT_IDS.includes(f));
  if (!formats.length) throw new Error('no valid formats asked for');
  if (!mock && !client) throw new Error('no Anthropic client — set ANTHROPIC_API_KEY');
  const now = new Date();
  const runId = await nextId(db, 'agent_runs', 'HER-R', now);
  const objective = `${parent ? 'regenerate' : 'write'} ${formats.join(', ')} from "${module.title}"`;
  await runsTable.start(db, { id: runId, agent: AGENT, skill: SKILL, objective, model: mock ? 'mock' : model, input: { module_id: module.id, formats, parent_id: parent?.id || null, note }, sources: [`${module.subject} / ${module.title}`], device });

  const write = (repair) => (mock ? Promise.resolve(mockDrafts(module, formats)) : writeDrafts({ client, model, effort, module, formats, repair, variantOf: parent }));
  let parsed, results, bad, usage = { in: 0, out: 0, cached: 0 }, repaired = false;
  try {
    parsed = await write(null); usage = add(usage, parsed.usage);
    results = gate(module, parsed); bad = results.filter((r) => !r.ok);
    if (bad.length) {
      repaired = true;
      parsed = await write(bad.map((r) => `${r.draft.format}: ${r.errors.join('; ')}`).join('\n')); usage = add(usage, parsed.usage);
      results = gate(module, parsed); bad = results.filter((r) => !r.ok);
    }
  } catch (e) {
    await runsTable.finish(db, runId, { status: 'failed', error: e.message, usage });
    return { run: runId, status: 'failed', error: e.message, drafts: [], refused: [], warnings: [] };
  }

  const good = results.filter((r) => r.ok);
  const refused = bad.map((r) => ({ format: r.draft.format, errors: r.errors }));
  if (!good.length) {
    const error = `the gate refused every draft${repaired ? ' even after one repair' : ''}: ${refused.map((r) => `${r.format} — ${r.errors[0]}`).join(' | ')}`;
    await runsTable.finish(db, runId, { status: 'refused', error, usage, output: { refused } });
    return { run: runId, status: 'refused', error, drafts: [], refused, warnings: [] };
  }

  const rows = [];
  for (const r of good) {
    const id = await nextId(db, 'content_drafts', 'HER', now);
    const d = r.data;
    const row = {
      id, run_id: runId, module_id: module.id, parent_id: parent?.id || null, agent: AGENT, format: d.format, platform: d.platform, status: 'draft',
      title: d.title, hook: d.hook, body: r.body, angle: d.angle, cta: d.cta, tags: d.tags, word_count: r.words,
      compliance: 'pass', compliance_notes: r.warnings.join('; '),
      source_subject: d.source_subject, source_module: d.source_module, source_ref: d.source_ref, source_url: d.source_url || '',
      source_note: module.source_path ? `[[${String(module.source_path).replace(/\.md$/, '')}]]` : '', model: mock ? 'mock' : model,
    };
    // Mint sequentially: nextId reads the table, and the previous insert must be visible to it. Insert one at a time.
    const [landed] = await draftsTable.create(db, [row], { note: note || objective });
    rows.push(landed || row);
  }
  const warnings = good.filter((r) => r.warnings.length).map((r) => ({ format: r.draft.format, warnings: r.warnings }));
  await runsTable.finish(db, runId, { status: 'ok', usage, output: { drafts: rows.map((r) => r.id), refused, warnings, repaired } });
  return { run: runId, status: 'ok', drafts: rows, refused, warnings, usage, repaired };
}

const add = (a, b) => ({ in: (a.in || 0) + (b?.in || 0), out: (a.out || 0) + (b?.out || 0), cached: (a.cached || 0) + (b?.cached || 0) });

/** How many words a body has, as the lint counts them. */
export { countWords };
