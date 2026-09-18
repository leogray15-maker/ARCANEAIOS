#!/usr/bin/env node
/**
 * Put the Archives index into the database.
 *
 *   npm run archives:sync            # index on disk → archive_modules, only what changed
 *   npm run archives:sync -- --full  # every row, even unchanged (after a schema change)
 *   npm run archives:sync -- --dry   # say what would change
 *
 * Reads data/archives (built by `npm run herald:index` from the Obsidian
 * vault, read-only) and brain/05-Knowledge/Archives-Sources.md (the gate),
 * compares each module's content hash with what the database holds, and
 * upserts only the modules that are new or changed. Nothing is deleted:
 * a module that has left the index is marked kind `retired` so drafts cut
 * from it keep their provenance. Needs SUPABASE_SERVICE_ROLE_KEY in .env.
 *
 * This is the ingestion step of the Content Machine. A Notion API source
 * would land in the same table through the same call: build rows, hash,
 * upsert the difference.
 */
import { loadEnv, createDb, config, DatabaseError } from '../packages/database/src/index.js';
import { modules, sources, events } from '../packages/database/src/content.js';
import { moduleRows } from '../packages/database/src/modules-from-index.js';

loadEnv();
const args = process.argv.slice(2);
const full = args.includes('--full'), dry = args.includes('--dry');
const say = (m) => console.log(`[archives ${new Date().toISOString().slice(11, 19)}] ${m}`);

const { rows, built, source } = moduleRows();
if (!rows.length) { console.error('✗ no index at data/archives/index.json — run: npm run herald:index'); process.exit(1); }
say(`index: ${rows.length} pages (${rows.filter((r) => r.kind === 'module').length} modules) built ${built} from ${source}`);
say(`gate: ${rows.filter((r) => r.gate === 'allowed').length} allowed · ${rows.filter((r) => r.gate === 'open').length} open · ${rows.filter((r) => r.gate === 'never').length} never`);

let db;
try { db = createDb(config()); } catch (e) { console.error(`✗ ${e.message}${e.hint ? `\n  ${e.hint}` : ''}`); process.exit(1); }

let have;
try { have = await modules.hashes(db); }
catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }

const changed = full ? rows : rows.filter((r) => have[r.id] !== r.content_hash);
const gone = Object.keys(have).filter((id) => !rows.some((r) => r.id === id));
say(`database: ${Object.keys(have).length} rows · ${changed.length} to write · ${gone.length} no longer in the index`);
if (dry) { for (const r of changed.slice(0, 20)) say(`  ~ ${r.id}`); if (changed.length > 20) say(`  … ${changed.length - 20} more`); process.exit(0); }

const sourceId = rows[0].source_id;
await sources.mark(db, sourceId, { kind: sourceId === 'export' ? 'notion-html-export' : 'obsidian-vault', location: source, status: 'syncing' });
try {
  let n = 0;
  for (let i = 0; i < changed.length; i += 100) { n += await modules.upsert(db, changed.slice(i, i + 100)); if (changed.length > 200) say(`  ${n}/${changed.length}`); }
  for (const id of gone) await db.patch('archive_modules', { id: `eq.${id}` }, { kind: 'retired' }, { returning: false });
  await sources.mark(db, sourceId, { status: 'ok', last_synced_at: new Date().toISOString(), module_count: rows.filter((r) => r.kind === 'module').length, last_error: '' });
  await events.add(db, { kind: 'sync.modules', actor: 'tools/archives-sync.mjs', subject_type: 'source', subject_id: sourceId, summary: `${n} modules written, ${gone.length} retired, ${rows.length} in the index`, data: { written: n, retired: gone.length, total: rows.length, built } });
  say(`✓ ${n} written · ${gone.length} retired · source ${sourceId} marked ok`);
} catch (e) {
  await sources.mark(db, sourceId, { status: 'error', last_error: e.message }).catch(() => {});
  console.error(`✗ ${e.message}`);
  process.exit(e instanceof DatabaseError ? 2 : 1);
}
