#!/usr/bin/env node
/**
 * Put the Arcane Peptides catalogue into the database.
 *
 *   npm run products:import            # data/peptides/catalog.json → products (+ the settings, if unset)
 *   npm run products:import -- --dry   # say what would change
 *
 * The seed is local (gitignored: it carries supplier cost prices) and is
 * only the starting point; once imported, the database is the truth and
 * THE LAB is where a figure changes. A product already in the database
 * keeps whatever Leo has typed for its price, cost and note — only new
 * ids are added, unless --overwrite is given. Never deletes.
 *
 * Under ARCANE_DB=memory it fills the dev database instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, REPO } from '../packages/database/src/index.js';
import { openDb } from '../packages/database/src/dev.js';
import { state } from '../packages/database/src/state.js';

loadEnv();
const args = process.argv.slice(2);
const dry = args.includes('--dry'), overwrite = args.includes('--overwrite');
const file = path.join(REPO, 'data', 'peptides', 'catalog.json');
if (!fs.existsSync(file)) { console.error(`✗ no seed at data/peptides/catalog.json`); process.exit(1); }
const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
let db;
try { db = openDb(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }

const have = new Map((await state.list(db, 'products')).map((p) => [p.id, p]));
const settings = new Map((await state.list(db, 'settings')).map((s) => [s.key, s]));
let added = 0, updated = 0, kept = 0, setCount = 0;
for (const p of seed.products) {
  const row = { id: p.id, name: p.name, size: p.size || '', category: p.category || '', listed: !!p.listed, sell_gbp: p.sell_gbp ?? null, supplier_id: seed.supplier?.id || 'jx', supplier_code: p.supplier_code || '', supplier_section: p.supplier_section || '', kit_cost_usd: p.kit_cost_usd ?? null, kit_vials: p.kit_vials || seed.supplier?.kit_vials || 10, note: p.note || '' };
  if (have.has(p.id) && !overwrite) { kept++; continue; }
  if (!dry) await state.insert(db, 'products', row, { actor: 'tools/products-import.mjs' });
  if (have.has(p.id)) updated++; else added++;
}
for (const [key, value] of Object.entries(seed.settings || {})) {
  if (settings.has(key) && !overwrite) continue;
  if (!dry) await state.insert(db, 'settings', { key, value: String(value) }, { actor: 'tools/products-import.mjs' });
  setCount++;
}
console.log(`${dry ? 'would import' : '✓ imported'} — ${added} added, ${updated} overwritten, ${kept} kept as they are, ${setCount} setting${setCount === 1 ? '' : 's'} set · ${seed.products.length} in the seed (${seed.products.filter((p) => p.listed).length} on the store)`);
