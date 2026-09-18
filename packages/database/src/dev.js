/**
 * The development database: the in-memory twin, seeded with the real
 * Archives index from disk and persisted to data/dev-db.json between
 * restarts. It is what `ARCANE_DB=memory` gives the dev API server so the
 * whole loop — Library → HERALD → BEACON — runs on a laptop with no
 * Supabase and no credits (with HERALD_MOCK=1). Modules are re-read from
 * data/archives at every start; only content, runs and events are saved.
 *
 * Never used on Vercel: the API refuses to build it there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { memoryDb } from './memory.js';
import { REPO, createDb, config } from './index.js';
import { moduleRows } from './modules-from-index.js';

const FILE = path.join(REPO, 'data', 'dev-db.json');
const PERSIST = ['knowledge_sources', 'content_drafts', 'content_revisions', 'agent_runs', 'system_events', 'orders', 'list_items', 'decisions', 'counsel_turns', 'venture_focus', 'goal_progress', 'days'];

export function devDb({ file = FILE } = {}) {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const seed = {};
  for (const t of PERSIST) seed[t] = saved[t] || [];
  const modules = moduleRows();
  seed.archive_modules = modules.rows;
  if (!seed.knowledge_sources.length) seed.knowledge_sources = [{ id: 'vault', kind: 'obsidian-vault', location: modules.source, status: modules.rows.length ? 'ok' : 'idle', module_count: modules.rows.length, last_synced_at: modules.built, last_error: modules.rows.length ? '' : 'no data/archives/index.json — run npm run herald:index' }];
  const db = memoryDb(seed);
  let timer = null;
  const save = () => { clearTimeout(timer); timer = setTimeout(() => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(Object.fromEntries(PERSIST.map((t) => [t, db.tables[t] || []])))); } catch (e) { console.error(`dev db: could not save: ${e.message}`); } }, 100); };
  for (const verb of ['post', 'patch', 'delete']) { const fn = db[verb]; db[verb] = async (...a) => { const r = await fn(...a); save(); return r; }; }
  db.kind = 'dev';
  db.file = file;
  db.modules = modules.rows.length;
  return db;
}

/** The database this process should use: the dev database under ARCANE_DB=memory (never on Vercel), else Supabase with the service key. */
export function openDb() {
  if (process.env.ARCANE_DB === 'memory' && process.env.VERCEL !== '1') return devDb();
  return createDb(config());
}
