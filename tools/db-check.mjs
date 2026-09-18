#!/usr/bin/env node
/**
 * Which migrations has the database actually had?
 *
 *   npm run db:check
 *
 * Asks PostgREST for one row of every table the code expects and prints
 * what answered and what did not, naming the migration file for each gap.
 * This is the answer to "Could not find the table … in the schema cache":
 * the table was never created. Needs SUPABASE_SERVICE_ROLE_KEY in .env;
 * with only the anon key it can still see arcane_sync.
 */
import { loadEnv, createDb, config, checkSchema } from '../packages/database/src/index.js';

loadEnv();
const c = config();
const key = c.key || process.env.SUPABASE_ANON_KEY || '';
if (!key) { console.error('✗ no key in .env — set SUPABASE_SERVICE_ROLE_KEY (or at least SUPABASE_ANON_KEY)'); process.exit(1); }
const db = createDb({ url: c.url, key });
console.log(`${c.url} · ${c.key ? 'service key' : 'anon key only (service-role tables will look missing)'}\n`);
const rows = await checkSchema(db);
for (const r of rows) console.log(`${r.ok ? '✓' : '✗'} ${r.table.padEnd(20)} ${r.ok ? '' : `→ run supabase/migrations/${r.migration}`}${!r.ok && !/does not exist/.test(r.error) ? `  (${r.error})` : ''}`);
const missing = [...new Set(rows.filter((r) => !r.ok).map((r) => r.migration))];
console.log(missing.length ? `\n${missing.length} migration${missing.length === 1 ? '' : 's'} to run in the Supabase SQL editor: ${missing.join(', ')}` : '\n✓ every table the code expects is there');
process.exit(missing.length ? 2 : 0);
