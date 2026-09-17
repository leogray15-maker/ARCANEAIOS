/**
 * Shared helpers for anything that writes into the brain.
 *
 * The brain is a folder of Markdown. Every writer in this repo goes through
 * these helpers so the rules are in one place: where the vault is, how
 * frontmatter is read and written, how a Trace entry is appended, and the
 * one guard that matters — a generated file is only ever replaced if it
 * says `generated: true` about itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Where the vault is. `ARCANE_BRAIN` may point outside the repo. */
export function brainDir() {
  const env = process.env.ARCANE_BRAIN;
  const dir = env ? path.resolve(REPO, env) : path.join(REPO, 'brain');
  if (!fs.existsSync(path.join(dir, 'CLAUDE.md'))) {
    throw new Error(`No brain at ${dir} (expected CLAUDE.md). Set ARCANE_BRAIN or run from the repo.`);
  }
  return dir;
}

/* ---------- time ---------- */

const pad = (n) => String(n).padStart(2, '0');
export const stampDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const stampTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const stamp = (d = new Date()) => `${stampDate(d)} ${stampTime(d)}`;
export const compact = (d = new Date()) => stampDate(d).replaceAll('-', '');

/* ---------- frontmatter ---------- */

/**
 * A small, honest YAML subset: scalars, quoted strings, flat lists in
 * `[a, b]` form, and comments. That is everything the templates use, and
 * refusing anything fancier keeps every file readable by eye.
 */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: null, body: text };
  const data = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    data[kv[1]] = parseScalar(kv[2]);
  }
  return { data, body: m[2] };
}

function parseScalar(v) {
  v = v.trim();
  if (v === '') return '';
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(',').map((s) => parseScalar(s)) : [];
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

export function serializeFrontmatter(data) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) lines.push(`${k}: ${serializeScalar(v)}`);
  lines.push('---');
  return lines.join('\n') + '\n';
}

function serializeScalar(v) {
  if (Array.isArray(v)) return `[${v.map(serializeScalar).join(', ')}]`;
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v ?? '');
  if (s === '') return '""';
  // Plain scalars are fine unless YAML would misread them: a ": " or " #"
  // inside, a leading indicator character, surrounding whitespace, or a
  // value that would parse as a number/boolean/null instead of text.
  if (/: | #|^[\[\]{}"'|>&*!%@`,#-]|^\s|\s$|^-?\d+(\.\d+)?$|^(true|false|null|yes|no)$/i.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

/* ---------- files ---------- */

export function readNote(file) {
  const text = fs.readFileSync(file, 'utf8');
  return { file, text, ...parseFrontmatter(text) };
}

/**
 * Write a generated note. Refuses to replace a file that does not carry
 * `generated: true` — a hand-written note is never clobbered. Returns
 * 'created' | 'updated' | 'unchanged' | 'kept'.
 */
export function writeGenerated(file, content, { write }) {
  const exists = fs.existsSync(file);
  if (exists) {
    const cur = readNote(file);
    if (cur.data?.generated !== true) return 'kept';
    if (stripUpdated(cur.text) === stripUpdated(content)) return 'unchanged';
  }
  if (write) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return exists ? 'updated' : 'created';
}

const stripUpdated = (t) => t.replace(/^updated: .*$/m, '').replace(/^created: .*$/m, '');

/** Append text to a file, creating it from `header` if it does not exist. */
export function appendTo(file, text, header = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, header);
  const cur = fs.readFileSync(file, 'utf8');
  fs.appendFileSync(file, (cur.endsWith('\n') || cur === '' ? '' : '\n') + text);
}

/** Bump `updated:` in a note's frontmatter without touching anything else. */
export function touchUpdated(file, when = stamp()) {
  const t = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, t.replace(/^updated: .*$/m, `updated: ${when}`));
}

/* ---------- the trace ---------- */

/**
 * Every run ends here. A Trace entry is appended to today's file in
 * 04-Records/Trace and a one-liner to today's Daily Log. This is the
 * "no trace, no run" rule from the doctrine, as a function.
 */
export function trace(brain, { agent, skill, run, action, inputs, outputs, result, notes }, now = new Date()) {
  const day = stampDate(now);
  const traceFile = path.join(brain, '04-Records', 'Trace', `${day}.md`);
  const header = serializeFrontmatter({
    type: 'trace', created: stamp(now), updated: stamp(now), status: 'active', agent: 'RELIC',
    log_date: day, tags: ['records', 'trace'],
  }) + `# Trace — ${day}\n\nEvery run, in order. Append-only.\n`;
  const entry = [
    '',
    `## ${stampTime(now)} · ${agent} · run ${run}`,
    '',
    `- **skill:** ${skill}`,
    `- **action:** ${action}`,
    `- **inputs:** ${inputs}`,
    `- **outputs:** ${outputs}`,
    `- **result:** ${result}`,
    `- **notes:** ${notes || '—'}`,
    '',
  ].join('\n');
  appendTo(traceFile, entry, header);
  touchUpdated(traceFile, stamp(now));

  const dailyFile = path.join(brain, '04-Records', 'Daily-Log', `${day}.md`);
  const dailyHeader = serializeFrontmatter({
    type: 'daily-log', created: stamp(now), updated: stamp(now), status: 'active', agent: 'RELIC',
    log_date: day, tags: ['records', 'daily'],
  }) + `# ${day}\n\n## Brief\n\n- Brief written: — [[Brief]]\n\n## Agent runs\n\n## Human\n\n- What Leo did:\n- What moved:\n\n## Signals raised\n\n## Decisions\n\n## Tomorrow\n\n-\n`;
  if (!fs.existsSync(dailyFile)) fs.writeFileSync(dailyFile, dailyHeader);
  const daily = fs.readFileSync(dailyFile, 'utf8');
  const line = `- ${stampTime(now)} · [[${agent}]] · ${skill} · ${result} · ${outputs} → [[04-Records/Trace/${day}#${stampTime(now)} · ${agent} · run ${run}|trace]]`;
  fs.writeFileSync(dailyFile, insertUnderHeading(daily, '## Agent runs', line));
  touchUpdated(dailyFile, stamp(now));
  return { traceFile, dailyFile };
}

/**
 * Append `line` at the end of the section under `heading`, keeping one
 * blank line between the section's list and the next heading. Creates the
 * section at the end of the file if it is missing.
 */
export function insertUnderHeading(text, heading, line) {
  const start = text.indexOf(heading + '\n');
  if (start < 0) return text.replace(/\s*$/, '') + `\n\n${heading}\n\n${line}\n`;
  const bodyStart = start + heading.length + 1;
  const nextH = text.slice(bodyStart).search(/^## /m);
  const end = nextH < 0 ? text.length : bodyStart + nextH;
  const section = text.slice(bodyStart, end).replace(/\s*$/, '');
  const rebuilt = (section ? section + '\n' : '\n') + line + '\n' + (nextH < 0 ? '' : '\n');
  return text.slice(0, bodyStart) + rebuilt + text.slice(end);
}

/* ---------- marked blocks ---------- */

/**
 * Replace the text between `<!-- name -->` and `<!-- /name -->` in a
 * hand-kept note, creating the block at the end of the file if it is
 * missing. This is how a tool writes into a file it does not own: the
 * block is the tool's, everything around it is the person's.
 */
export function replaceBlock(file, name, text) {
  const open = `<!-- ${name} -->`, close = `<!-- /${name} -->`;
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const block = `${open}\n${text.replace(/\s*$/, '')}\n${close}`;
  const a = cur.indexOf(open), b = cur.indexOf(close);
  const next = a >= 0 && b > a ? cur.slice(0, a) + block + cur.slice(b + close.length) : cur.replace(/\s*$/, '') + `\n\n${block}\n`;
  if (next === cur) return 'unchanged';
  fs.writeFileSync(file, next);
  return 'updated';
}

/** Replace the body of the section under `heading` (up to the next `## `). */
export function replaceSection(file, heading, body) {
  const cur = fs.readFileSync(file, 'utf8');
  const next = insertUnderHeading(cur.replace(new RegExp(`(${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n)[\\s\\S]*?(?=\\n## |$)`), '$1'), heading, body.replace(/\s*$/, ''));
  if (next === cur) return 'unchanged';
  fs.writeFileSync(file, next);
  return 'updated';
}
