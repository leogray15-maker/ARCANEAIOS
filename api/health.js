/**
 * The machine's own state, for THE CONTROL ROOM.
 *
 *   GET /api/health → { env: { anthropic, service_key, operator_key, model }, db: { kind, ok, error }, tables: [...], sources: [...], runtime }
 *
 * Which keys the server has (never their values), whether the database
 * answers, which migrations it has had, and the knowledge sources' sync
 * state. Behind the operator key like everything else.
 */
import { json, guard, db } from './_lib.js';
import { checkSchema } from '../packages/database/src/index.js';
import { sources, runs } from '../packages/database/src/content.js';
import { readiness } from '../packages/database/src/readiness.js';

/** How many rows a table holds, or null when it cannot be asked. Never throws: a missing table is evidence, not an error. */
async function count(d, table) {
  try { const r = await d.get(table, { select: 'id', limit: 1 }, { count: true }); return r.count; } catch { return null; }
}

export default guard(['GET'], async (req, res) => {
  const env = { anthropic: !!process.env.ANTHROPIC_API_KEY, service_key: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.storage_SUPABASE_SERVICE_ROLE_KEY), operator_key: !!process.env.ARCANE_OPERATOR_KEY, model: process.env.HERALD_MODEL || process.env.ARCANE_MODEL || 'claude-opus-5', mock: process.env.HERALD_MOCK === '1', dev_db: process.env.ARCANE_DB === 'memory' };
  let d = null, dbInfo = { kind: '', ok: false, error: '' }, tables = [], srcs = [], counts = {}, lastRun = null;
  try { d = db(); dbInfo = { kind: d.kind, ok: true, error: '' }; } catch (e) { dbInfo = { kind: '', ok: false, error: e.message }; }
  if (d) {
    tables = await checkSchema(d);
    try { srcs = await sources.list(d); } catch {}
    // The evidence the readiness check reasons over: what is in the tables,
    // and what the last agent run actually returned.
    const names = ['archive_modules', 'products', 'stock_lots', 'dispatch', 'orders', 'content_drafts'];
    const got = await Promise.all(names.map((t) => count(d, t)));
    counts = Object.fromEntries(names.map((t, i) => [t, got[i]]));
    // The last run that reached the model — a dry reading proves nothing about it either way.
    try { lastRun = (await runs.list(d, { limit: 20 })).find((r) => ['ok', 'failed', 'refused'].includes(r.status)) || null; } catch {}
  }
  const ready = readiness({ env, db: dbInfo, tables, counts, lastRun });
  return json(res, 200, { env, db: dbInfo, tables, sources: srcs, counts, ready, runtime: { vercel: process.env.VERCEL === '1', region: process.env.VERCEL_REGION || '', node: process.version, at: new Date().toISOString() } });
});
