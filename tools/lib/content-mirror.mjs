/**
 * Content, between the database and the vault.
 *
 * The database is where a draft lives while it is being decided on (the
 * floor writes there); the vault is the durable record a person reads in
 * Obsidian. Two directions, both explicit:
 *
 *   mirrorDrafts   database → vault   every draft as a generated file in
 *                                     02-Content/<Drafts|Approved|Posted|Killed>,
 *                                     moved when its status moves, never deleted
 *   importDrafts   vault → database   hand-emitted drafts (the CLI path) the
 *                                     database has not seen, with their status
 *
 * Files written here carry `generated: true` and `source: supabase`, so
 * the guard in brain.mjs will regenerate them and nobody edits them by
 * hand — edit on the floor. A draft that was emitted by hand keeps its
 * file as it was; once imported, the database copy is the one that moves.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, serializeFrontmatter, writeGenerated, stamp, appendTo, touchUpdated } from './brain.mjs';
import { drafts as draftsTable, runs as runsTable, events } from '../../packages/database/src/content.js';
import { slugify } from '../../.claude/skills/herald/scripts/lib.mjs';

export const FOLDER = { draft: 'Drafts', review: 'Drafts', approved: 'Approved', scheduled: 'Approved', posted: 'Posted', killed: 'Killed' };
const FOLDERS = ['Drafts', 'Approved', 'Posted', 'Killed'];
const fmt = (iso) => (iso ? stamp(new Date(iso)) : '');

/** Every draft file in the vault, with its frontmatter. */
export function vaultDrafts(brain) {
  const out = [];
  for (const folder of FOLDERS) {
    const dir = path.join(brain, '02-Content', folder); if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const { data, body } = parseFrontmatter(text);
      if (data?.type === 'content-draft' && data.id) out.push({ folder, file: f, path: path.join(dir, f), data, body: body.trim() });
    }
  }
  return out;
}

/** The frontmatter a database draft gets in the vault: the skill's contract, plus where it came from. */
function frontmatterFor(d) {
  return {
    type: 'content-draft', id: d.id, title: d.title, format: d.format, platform: d.platform, status: d.status, agent: d.agent || 'HERALD', run: d.run_id || '',
    source_subject: d.source_subject, source_module: d.source_module, source_ref: d.source_ref || d.module_id || '', source_url: d.source_url || '', source_note: d.source_note || '',
    angle: d.angle || '', hook: d.hook || '', cta: d.cta || 'none', tags: d.tags || [], word_count: d.word_count || 0,
    compliance: d.compliance || 'pass', compliance_notes: d.compliance_notes || '',
    created: fmt(d.created_at), updated: fmt(d.updated_at), approved_by: d.approved_at ? 'Leo' : '', scheduled_for: fmt(d.scheduled_for), posted_at: fmt(d.published_at), posted_url: d.published_url || '',
    revision: d.revision || 1, model: d.model || '', parent: d.parent_id || '',
    generated: true, source: 'supabase',
  };
}

/** Database → vault. Returns { written, moved, unchanged, kept }. */
export async function mirrorDrafts(db, brain) {
  const rows = await db.get('content_drafts', { select: '*', order: 'created_at.asc', limit: 10000 });
  const existing = new Map(vaultDrafts(brain).map((v) => [v.data.id, v]));
  const report = { written: 0, moved: 0, unchanged: 0, kept: 0 };
  const logFile = path.join(brain, '02-Content', 'Content-Log.md');
  const logged = new Set(fs.existsSync(logFile) ? [...fs.readFileSync(logFile, 'utf8').matchAll(/^\|\s*(HER-\d{8}-\d{3})\s*\|/gm)].map((m) => m[1]) : []);
  const newRows = [];
  for (const d of rows) {
    const folder = FOLDER[d.status] || 'Drafts';
    const cur = existing.get(d.id);
    const file = cur ? cur.file : `${d.id}-${d.format}-${slugify(d.title || d.hook || d.id)}.md`;
    const dest = path.join(brain, '02-Content', folder, file);
    if (cur && cur.data.generated !== true) { report.kept++; continue; }        // a hand-emitted file stays as it is until imported
    if (cur && cur.path !== dest) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.renameSync(cur.path, dest); report.moved++; }
    const content = serializeFrontmatter(frontmatterFor(d)) + (d.body || '').trim() + '\n';
    const r = writeGenerated(dest, content, { write: true });
    if (r === 'unchanged') report.unchanged++; else report.written++;
    if (!logged.has(d.id)) newRows.push(`| ${d.id} | ${fmt(d.created_at)} | ${d.format} | ${d.platform} | ${cell(d.hook)} | ${cell(d.source_module)} | ${cell(d.source_subject)} | ${d.status} | ${d.run_id || ''} |`);
  }
  if (newRows.length && fs.existsSync(logFile)) { appendTo(logFile, newRows.join('\n') + '\n'); touchUpdated(logFile); }
  // Status in the log follows the database.
  if (fs.existsSync(logFile)) {
    const status = Object.fromEntries(rows.map((d) => [d.id, d.status]));
    const lines = fs.readFileSync(logFile, 'utf8').split('\n').map((line) => { const c = line.split('|'); if (c.length < 10) return line; const id = c[1].trim(); if (!status[id]) return line; c[8] = ` ${status[id]} `; return c.join('|'); });
    fs.writeFileSync(logFile, lines.join('\n'));
  }
  return report;
}

/** Vault → database: hand-emitted drafts the database has not seen. Returns the ids imported. */
export async function importDrafts(db, brain) {
  const have = new Set((await db.get('content_drafts', { select: 'id', limit: 10000 })).map((r) => r.id));
  const runsSeen = new Set((await db.get('agent_runs', { select: 'id', limit: 10000 })).map((r) => r.id));
  const imported = [];
  for (const v of vaultDrafts(brain)) {
    const d = v.data;
    if (have.has(d.id) || d.generated === true) continue;
    const created = d.created ? new Date(String(d.created).replace(' ', 'T')).toISOString() : new Date().toISOString();
    if (d.run && !runsSeen.has(d.run)) {
      await runsTable.start(db, { id: d.run, agent: d.agent || 'HERALD', skill: 'herald', objective: `imported from the vault: ${d.source_module}`, model: 'vault', input: { imported: true }, sources: [`${d.source_subject} / ${d.source_module}`] });
      await db.patch('agent_runs', { id: `eq.${d.run}` }, { status: 'ok', started_at: created, finished_at: created }, { returning: false });
      runsSeen.add(d.run);
    }
    const row = {
      id: d.id, run_id: d.run || '', module_id: null, agent: d.agent || 'HERALD', format: d.format, platform: d.platform, status: d.status || 'draft',
      title: d.title || '', hook: d.hook || '', body: v.body, angle: d.angle || '', cta: d.cta || 'none', tags: Array.isArray(d.tags) ? d.tags.map(String) : [], word_count: d.word_count || 0,
      compliance: d.compliance || 'pass', compliance_notes: d.compliance_notes || '', source_subject: d.source_subject || '', source_module: d.source_module || '', source_ref: d.source_ref || '', source_url: d.source_url || '', source_note: d.source_note || '',
      model: 'vault', created_at: created, approved_at: d.approved_by ? created : null, published_at: d.posted_at ? new Date(String(d.posted_at).replace(' ', 'T')).toISOString() : null, published_url: d.posted_url || '',
    };
    // The module id in the index may be a real archive_modules id; link it if the row exists, else keep provenance in source_ref only.
    if (d.source_ref) { const m = await db.get('archive_modules', { select: 'id', id: `eq.${d.source_ref}` }, { single: true }); if (m) row.module_id = m.id; }
    const [landed] = await draftsTable.create(db, [row], { actor: 'HERALD', note: `imported from ${v.folder}/${v.file}` });
    await events.add(db, { kind: 'draft.imported', actor: 'tools/vault-sync.mjs', subject_type: 'draft', subject_id: landed.id, summary: `${landed.id} imported from the vault as ${landed.status}` });
    // The file now belongs to the database: mark it generated so the mirror keeps it in step from here on.
    fs.writeFileSync(v.path, serializeFrontmatter({ ...d, generated: true, source: 'supabase' }) + v.body + '\n');
    imported.push(landed.id);
  }
  return imported;
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 90);
