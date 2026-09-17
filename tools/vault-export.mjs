#!/usr/bin/env node
/**
 * Export the brain for the facility.
 *
 *   npm run vault:export        → apps/facility/public/brain.json
 *
 * The facility is a static site; it cannot read the vault at runtime. So
 * at build time this reads the Markdown that matters to a dashboard and
 * writes one JSON file: the brief, open orders, the drafts queue, goals,
 * today's trace, signals, decisions, the Archives map, and a file index
 * per brain folder. Everything is derived; nothing is edited. Regenerate
 * and it is correct again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { brainDir, REPO, parseFrontmatter, stamp } from './lib/brain.mjs';

const brain = brainDir();
const out = path.join(REPO, 'apps', 'facility', 'public', 'brain.json');
const read = (rel) => { const f = path.join(brain, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; };

/** Markdown tables → arrays of objects keyed by the header cells. */
function tables(md) {
  const found = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\|/.test(lines[i]) || !/^\|\s*-+/.test(lines[i + 1])) continue;
    const head = cells(lines[i]);
    const rows = [];
    for (let j = i + 2; j < lines.length && /^\|/.test(lines[j]); j++) {
      const c = cells(lines[j]);
      if (c.every((x) => !x)) continue;
      rows.push(Object.fromEntries(head.map((h, k) => [slug(h), c[k] ?? ''])));
    }
    // the nearest heading above names the table
    let heading = '';
    for (let k = i - 1; k >= 0; k--) if (/^#{1,3} /.test(lines[k])) { heading = lines[k].replace(/^#+\s*/, ''); break; }
    found.push({ heading, rows });
  }
  return found;
}
const cells = (line) => line.replace(/^\||\|$/g, '').split('|').map((s) => s.trim());
const slug = (s) => s.toLowerCase().replace(/\[\[|\]\]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const unwiki = (s) => String(s).replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1');

/* ---------- brief ---------- */
const briefMd = read('03-Memory/Brief.md');
const briefFm = parseFrontmatter(briefMd).data || {};
const brief = { date: briefFm.brief_date || '', updated: briefFm.updated || '', blocks: {} };
for (const t of tables(briefMd)) brief.blocks[slug(t.heading)] = t.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, unwiki(v)])));

/* ---------- orders ---------- */
const ordersMd = read('06-Orders/Orders.md');
const orders = { open: [], closed: [] };
for (const t of tables(ordersMd)) {
  const key = /closed/i.test(t.heading) ? 'closed' : 'open';
  orders[key] = t.rows.map((r) => ({ n: Number(r['']) || Number(r.n) || 0, order: r.order, room: unwiki(r.room), holder: unwiki(r.holder), actor: r.actor, priority: r.priority, state: r.state, blocked: r.blocked_on === '—' ? '' : r.blocked_on, outcome: r.outcome, closed: r.closed }));
}

/* ---------- drafts ---------- */
const drafts = [];
for (const folder of ['Drafts', 'Approved', 'Posted', 'Killed']) {
  const dir = path.join(brain, '02-Content', folder);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    const { data, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!data) continue;
    drafts.push({ file: `02-Content/${folder}/${f}`, folder, ...pick(data, ['id', 'title', 'format', 'platform', 'status', 'run', 'source_subject', 'source_module', 'source_url', 'angle', 'hook', 'cta', 'tags', 'word_count', 'compliance', 'compliance_notes', 'created', 'updated', 'approved_by', 'scheduled_for', 'posted_at']), body: body.replace(/<!--[\s\S]*?-->/g, '').trim() });
  }
}

/* ---------- goals, memory, signals, decisions ---------- */
const goals = (tables(read('05-Knowledge/Goals.md'))[0]?.rows || []).map((r) => ({ id: r.id, goal: r.goal, room: unwiki(r.room), kind: r.kind, target: r.target, progress: r.progress === '—' ? '' : r.progress }));
const memoryMd = read('03-Memory/Shared-Memory.md');
const memory = {};
for (const m of memoryMd.matchAll(/^- ([^:]+): (.*)$/gm)) memory[slug(m[1])] = m[2].trim();
memory.ventures = (tables(memoryMd).find((t) => /venture/i.test(t.heading))?.rows || []).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, unwiki(v)])));
const signals = (tables(read('03-Memory/Signals.md'))[0]?.rows || []).slice(0, 30);
const decisions = (tables(read('04-Records/Decision-Log.md'))[0]?.rows || []);
const doctrine = (read('01-System/Doctrine.md').match(/^## Current intent[\s\S]*$/m)?.[0] || '').split('\n').filter((l) => l.startsWith('>')).map((l) => l.replace(/^>\s?/, '').trim()).join(' ');
const rules = (read('01-System/Doctrine.md').match(/## Standing rules\n\n([\s\S]*?)\n\n## /)?.[1] || '').split('\n').map((l) => l.replace(/^\d+\.\s*/, '')).filter(Boolean);
const principles = (read('01-System/Doctrine.md').match(/## Decision principles[^\n]*\n\n([\s\S]*?)\n\n## /)?.[1] || '').split('\n').map((l) => l.replace(/^\d+\.\s*\*\*([^*]+)\*\*\s*/, '$1 — ')).filter(Boolean);

/* ---------- trace: the latest day ---------- */
const traceDir = path.join(brain, '04-Records', 'Trace');
const traceFiles = fs.existsSync(traceDir) ? fs.readdirSync(traceDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort() : [];
const trace = [];
for (const f of traceFiles.slice(-3)) {
  const md = fs.readFileSync(path.join(traceDir, f), 'utf8');
  for (const section of md.split(/\n(?=## )/)) {
    const head = /^## (\d{2}:\d{2}) · ([A-Z]+) · run (\S+)/.exec(section);
    if (!head) continue;
    const fields = Object.fromEntries([...section.matchAll(/^- \*\*([a-z]+):\*\* (.*)$/gm)].map((x) => [x[1], unwiki(x[2])]));
    trace.push({ day: f.replace('.md', ''), time: head[1], agent: head[2], run: head[3], ...fields });
  }
}

/* ---------- archives map ---------- */
const mapMd = read('05-Knowledge/Archives-Map.md');
const archives = { summary: (mapMd.match(/^(\d+ subjects[^\n]*)$/m)?.[1] || ''), lanes: tables(mapMd).find((t) => /lane/i.test(t.heading))?.rows || [], subjects: (tables(mapMd).find((t) => /subject/i.test(t.heading))?.rows || []).slice(0, 12) };

/* ---------- file index per folder ---------- */
const files = {};
for (const folder of fs.readdirSync(brain).filter((d) => /^\d\d-/.test(d))) {
  const list = [];
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.name.endsWith('.md')) { const fm = parseFrontmatter(fs.readFileSync(p, 'utf8')).data || {}; list.push({ path: `${folder}/${r}`, name: e.name.replace(/\.md$/, ''), type: fm.type || '', status: fm.status || '', agent: fm.agent || '', updated: fm.updated || '' }); }
    }
  })(path.join(brain, folder), '');
  list.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  files[folder] = list.slice(0, 40);
}

/* ---------- write ---------- */
const json = { built: stamp(), brief, orders, drafts, goals, memory, signals, decisions, doctrine, rules, principles, trace, archives, files };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(json, null, 1));
console.log(`✓ brain exported → ${path.relative(REPO, out)} — brief ${brief.date} (${Object.keys(brief.blocks).length} blocks), ${orders.open.length} open orders, ${drafts.length} drafts, ${goals.length} goals, ${trace.length} trace entries, ${Object.keys(files).length} folders`);

function pick(o, keys) { return Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]])); }
