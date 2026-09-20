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
const PERSIST = ['knowledge_sources', 'content_drafts', 'content_revisions', 'agent_runs', 'system_events', 'orders', 'list_items', 'decisions', 'counsel_turns', 'venture_focus', 'goal_progress', 'days', 'settings', 'products', 'stock_lots', 'dispatch', 'dispatch_items', 'ledger_months', 'fixed_costs', 'cash_snapshots', 'pots', 'protocol_items', 'protocol_ticks', 'entries', 'trades', 'setups', 'checkins', 'goals', 'projects', 'reviews', 'bottlenecks', 'capital_rules', 'capital_allocations'];

export function devDb({ file = FILE } = {}) {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const seed = {};
  for (const t of PERSIST) seed[t] = saved[t] || [];
  const modules = moduleRows();
  seed.archive_modules = modules.rows;
  if (!seed.knowledge_sources.length) seed.knowledge_sources = [{ id: 'vault', kind: 'obsidian-vault', location: modules.source, status: modules.rows.length ? 'ok' : 'idle', module_count: modules.rows.length, last_synced_at: modules.built, last_error: modules.rows.length ? '' : 'no data/archives/index.json — run npm run herald:index' }];
  // The rows the migrations seed, so the dev database starts where Postgres would.
  if (!seed.fixed_costs.length) seed.fixed_costs = [['stock', 'Stock & storage', 'apothecary'], ['shipping', 'Packaging & postage', 'apothecary'], ['testing', 'HPLC & COA testing', 'apothecary'], ['software', 'Software & hosting', 'forge'], ['ads', 'Ads & promotion', 'beacon'], ['personal', 'Personal fixed costs', 'sanctum']].map(([id, name, room]) => ({ id, name, room, amount_gbp: 0, active: true, note: '' }));
  if (!seed.pots.length) seed.pots = [['tax', 'Tax set-aside', 25, 'VAT and corporation tax. Untouchable.', 'breach'], ['reinvest', 'Reinvest', 35, 'Stock, build, ads — the compounding half.', 'arcane'], ['pay', 'Pay yourself', 25, 'The reason any of this exists.', 'vital'], ['reserve', 'War chest', 15, 'Runway. Lets you say no to bad deals.', 'gold']].map(([id, name, pct, note, accent], position) => ({ id, name, pct, note, accent, position }));
  if (!seed.protocol_items.length) seed.protocol_items = [['train', 'Train', 4, 'per week', 'week'], ['sleep', 'Sleep floor', 7.5, 'hours', 'day'], ['deep-work', 'Deep work block', 3, 'hours', 'day'], ['steps', 'Steps', 8000, 'per day', 'day'], ['read', 'Read', 20, 'pages', 'day']].map(([id, name, target, unit, cadence], position) => ({ id, name, target, unit, cadence, active: true, position }));
  if (!seed.settings.length) seed.settings = [{ key: 'fx_gbp_per_usd', value: '0.746' }, { key: 'landed_overhead_pct', value: '0' }, { key: 'low_stock_vials', value: '12' }];
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
