/**
 * The Archives index on disk, as archive_modules rows.
 *
 * `npm run herald:index` reads the Obsidian vault (or the Notion export)
 * and writes data/archives/index.json plus one clean text file per module.
 * This turns that into rows: the same fields, the module's text as `body`,
 * a content hash so a sync can skip what has not changed, and the gate —
 * allowed / open / never — from brain/05-Knowledge/Archives-Sources.md,
 * which is Leo's list of what HERALD may cut from. Used by the dev
 * database and by tools/archives-sync.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { REPO } from './index.js';
import { sourceGate } from '../../../.claude/skills/herald/scripts/lib.mjs';

export const INDEX_FILE = path.join(REPO, 'data', 'archives', 'index.json');
export const MODULES_DIR = path.join(REPO, 'data', 'archives', 'modules');

export function gateFor(subject, lane, gate) {
  const s = String(subject).toLowerCase();
  if (lane === 'external') return 'never';
  if (gate.never.some((n) => n && s.includes(n))) return 'never';
  if (gate.allowed.some((a) => a && s.includes(a))) return 'allowed';
  return 'open';
}

export const hashOf = (text) => createHash('sha1').update(String(text)).digest('hex');

/** Every module in the index as a row. Returns { rows, built, source } — empty rows when there is no index. */
export function moduleRows({ indexFile = INDEX_FILE, modulesDir = MODULES_DIR, brain = process.env.ARCANE_BRAIN ? path.resolve(REPO, process.env.ARCANE_BRAIN) : path.join(REPO, 'brain') } = {}) {
  if (!fs.existsSync(indexFile)) return { rows: [], built: null, source: '' };
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const gate = sourceGate(brain);
  const indexed = index.built ? new Date(index.built.replace(' ', 'T')).toISOString() : new Date().toISOString();
  const rows = index.modules.map((m) => {
    const f = path.join(modulesDir, `${m.id}.txt`);
    const body = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
    return {
      id: m.id, notion_id: m.notionId || '', source_id: index.sourceKind === 'export' ? 'export' : 'vault', source_path: m.path || '',
      source_url: m.notionId ? `https://www.notion.so/${m.notionId}` : '',
      title: m.title, subject: m.subject, parent: m.parent || '', lane: m.lane, kind: m.kind, words: m.words, sensitive: !!m.sensitive, flags: m.flags || [],
      gate: gateFor(m.subject, m.lane, gate), excerpt: m.excerpt || '', body, content_hash: hashOf(`${m.title}\n${m.subject}\n${body}`), indexed_at: indexed,
    };
  });
  return { rows, built: indexed, source: index.source || '' };
}
