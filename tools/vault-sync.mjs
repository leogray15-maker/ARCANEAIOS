#!/usr/bin/env node
/**
 * Bring the site's decisions back into the vault.
 *
 *   npm run vault:sync
 *
 * On the site, moving a draft's status is stored in the operator's row in
 * Supabase (or only in that browser's localStorage, which this cannot
 * see). This reads the row with the service-role key — server-side only,
 * from .env, never in the bundle — and applies every status change to the
 * draft files: frontmatter `status` and the dated fields, the file moved
 * to the folder for its status, the Content-Log row updated, the board
 * regenerated. The vault stays the truth; the site is how it was decided.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. Without them
 * it says so and does nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { brainDir, REPO, parseFrontmatter, serializeFrontmatter, stamp } from './lib/brain.mjs';

try { for (const line of fs.readFileSync(path.join(REPO, '.env'), 'utf8').split('\n')) { const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch {}
const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_storage_SUPABASE_URL || 'https://pjdzdfmnfuneumzqoijn.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.storage_SUPABASE_SERVICE_ROLE_KEY || '';
if (!KEY) { console.log('· vault:sync skipped — no SUPABASE_SERVICE_ROLE_KEY in .env (copy it from the Vercel integration; it never leaves this machine)'); process.exit(0); }

const r = await fetch(`${URL}/rest/v1/arcane_state?id=eq.state&select=owner,body,updated`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
if (!r.ok) { console.error(`✗ Supabase ${r.status}: ${await r.text()}`); process.exit(1); }
const rows = await r.json();
if (!rows.length) { console.log('· vault:sync — no state row yet (sign in on the site once)'); process.exit(0); }
const marks = Object.assign({}, ...rows.map((row) => row.body?.drafts || {}));   // one operator; merge defensively

const brain = brainDir();
const FOLDER = { draft: 'Drafts', review: 'Drafts', approved: 'Approved', scheduled: 'Approved', posted: 'Posted', killed: 'Killed' };
const files = [];
for (const folder of ['Drafts', 'Approved', 'Posted', 'Killed']) { const dir = path.join(brain, '02-Content', folder); if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) files.push({ folder, f, p: path.join(dir, f) }); }
let changed = 0;
for (const { folder, f, p } of files) {
  const text = fs.readFileSync(p, 'utf8'); const { data, body } = parseFrontmatter(text);
  if (data?.type !== 'content-draft' || !marks[data.id]) continue;
  const next = marks[data.id].status;
  if (!FOLDER[next] || next === data.status) continue;
  const when = new Date(marks[data.id].ts || Date.now());
  const fm = { ...data, status: next, updated: stamp(when) };
  if (next === 'approved' && !fm.approved_by) fm.approved_by = 'Leo';
  if (next === 'posted' && !fm.posted_at) fm.posted_at = stamp(when);
  const dest = path.join(brain, '02-Content', FOLDER[next], f);
  fs.writeFileSync(p, serializeFrontmatter(fm) + body);
  if (dest !== p) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.renameSync(p, dest); }
  changed++;
  console.log(`  ${data.id}: ${data.status} → ${next}${FOLDER[next] !== folder ? ` (moved to ${FOLDER[next]}/)` : ''}`);
}
// Content-Log status column follows.
const logFile = path.join(brain, '02-Content', 'Content-Log.md');
if (changed && fs.existsSync(logFile)) {
  const lines = fs.readFileSync(logFile, 'utf8').split('\n').map((line) => {
    const c = line.split('|'); if (c.length < 10 || !c[1].trim().startsWith('HER-')) return line;
    const id = c[1].trim(); if (!marks[id]) return line; c[8] = ` ${marks[id].status} `; return c.join('|');
  });
  fs.writeFileSync(logFile, lines.join('\n'));
}
spawnSync('node', [path.join(REPO, 'tools', 'content-board.mjs')], { stdio: 'inherit' });
console.log(`✓ vault:sync — ${changed} draft${changed === 1 ? '' : 's'} updated from the site`);
