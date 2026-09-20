/**
 * Is the machine ready to work, and if not, exactly what is stopping it.
 *
 * Pure: everything it needs is handed in, so the same answer can be
 * computed in a test, in `/api/health` and anywhere else that has the
 * evidence. It never guesses — a check it cannot make says so rather than
 * reporting "ok", because a green light nobody earned is worse than an
 * amber one.
 *
 * Each item carries its own evidence (the counts, the table names, the
 * error the last run actually returned), so the operator can see why the
 * system says what it says instead of trusting it.
 */

export const READY_ORDER = { ok: 0, degraded: 1, blocked: 2 };
const worst = (a, b) => (READY_ORDER[b] > READY_ORDER[a] ? b : a);

/**
 * @param {object} e evidence
 * @param {object} e.env      { anthropic, service_key, operator_key, mock, dev_db, model }
 * @param {object} e.db       { kind, ok, error }
 * @param {Array}  e.tables   [{ table, ok, migration }]
 * @param {object} e.counts   { archive_modules, products, stock_lots, dispatch, orders, content_drafts }
 * @param {object} e.lastRun  the newest agent run, or null
 */
export function readiness({ env = {}, db = {}, tables = [], counts = {}, lastRun = null } = {}) {
  const items = [];
  const add = (id, level, title, detail, { fix = '', room = 'control', evidence = null } = {}) =>
    items.push({ id, level, title, detail, fix, room, evidence });
  const n = (k) => (typeof counts[k] === 'number' ? counts[k] : null);

  // 1. The door. Without it the API refuses everything, so nothing else matters.
  if (!env.operator_key) add('operator', 'blocked', 'The API is closed', 'ARCANE_OPERATOR_KEY is not set on the server, so every call is refused.', { fix: 'Set ARCANE_OPERATOR_KEY in the Vercel project (and .env for the dev server), then paste it into DEVICE in the bar.' });
  else add('operator', 'ok', 'The API is open', 'The server holds an operator key.');

  // 2. The database itself.
  if (!db.ok) add('database', 'blocked', 'The database does not answer', db.error || 'no connection', { fix: 'Check SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL.' });
  else if (db.kind === 'memory' || env.dev_db) add('database', 'degraded', 'The dev database', 'This is data/dev-db.json on this machine. Nothing written here reaches Supabase.', { fix: 'Run npm run dev (not dev:local) with the service key in .env to work against the real database.' });
  else add('database', 'ok', 'The database answers', `${db.kind} through the service key.`);

  // 3. Migrations, named by the file that supplies them.
  const missing = (tables || []).filter((t) => !t.ok);
  const files = [...new Set(missing.map((t) => t.migration))].sort();
  if (missing.length) add('migrations', 'blocked', `${files.length} migration${files.length === 1 ? '' : 's'} to run`, `${missing.length} table${missing.length === 1 ? ' is' : 's are'} missing: ${missing.map((t) => t.table).join(', ')}.`, { fix: `Run, in order, in the Supabase SQL editor: ${files.map((f) => `supabase/migrations/${f}`).join(', ')}`, evidence: { tables: missing.map((t) => t.table), files } });
  else if (tables.length) add('migrations', 'ok', 'Every table is there', `${tables.length} tables, migrations 0001–${(tables[tables.length - 1]?.migration || '').slice(0, 4) || '0008'}.`, { evidence: { tables: tables.length } });

  // 4. The two imports. Empty is not an error — it is work that has not been done.
  const mods = n('archive_modules');
  if (mods === 0) add('archives', 'blocked', 'THE LIBRARY is empty', 'No modules are indexed, so nothing can be searched and HERALD has nothing to cut from.', { fix: 'npm run herald:index && npm run archives:sync', room: 'archives' });
  else if (mods !== null) add('archives', 'ok', 'The Archives are indexed', `${mods.toLocaleString('en-GB')} modules.`, { room: 'archives', evidence: { archive_modules: mods } });

  const prods = n('products');
  if (prods === 0) add('catalogue', 'blocked', 'THE LAB has no catalogue', 'No products, so there is nothing to cost, stock or dispatch.', { fix: 'npm run products:import', room: 'apothecary' });
  else if (prods !== null) add('catalogue', 'ok', 'The catalogue is loaded', `${prods} products.`, { room: 'apothecary', evidence: { products: prods } });

  // 5. Stock. This one is a degradation, not a blocker: the room works, but
  //    every margin it shows is theoretical until a lot has been booked in.
  const lots = n('stock_lots');
  if (lots === 0 && prods) add('stock', 'degraded', 'No stock has been booked in', 'Margins are the catalogue\'s (price − landed cost), not realised. Dispatch cannot draw from a lot, so nothing decrements.', { fix: 'Book a lot into THE LAB: a batch, a count, the COA.', room: 'apothecary', evidence: { stock_lots: 0, products: prods } });

  // 6. The model. Presence of a key is not the same as a key that works, so
  //    the last run is the evidence — it is the only honest one available
  //    without spending money to find out.
  if (!env.anthropic) add('model', 'blocked', 'No Anthropic key', 'Counsel, the Council, HERALD and CIPHER cannot run.', { fix: 'Set ANTHROPIC_API_KEY in the Vercel project.' });
  else if (env.mock) add('model', 'degraded', 'The mock writer is on', 'HERALD_MOCK=1 — drafts are cut from the module\'s own sentences, not written by Claude.', { fix: 'Unset HERALD_MOCK to use the real writer.' });
  else if (lastRun && lastRun.status === 'failed' && /credit/i.test(lastRun.error || '')) add('model', 'blocked', 'The Anthropic account has no credits', `The last run (${lastRun.id}) failed: ${lastRun.error}`, { fix: 'Top up at console.anthropic.com → Plans & Billing. API credits are bought separately from a Claude subscription.', evidence: { run: lastRun.id, at: lastRun.finished_at || lastRun.started_at, error: lastRun.error } });
  else if (lastRun && lastRun.status === 'failed') add('model', 'degraded', 'The last agent run failed', `${lastRun.id}: ${lastRun.error || 'no reason recorded'}`, { fix: 'Look at the run in THE RECORDS.', room: 'records', evidence: { run: lastRun.id, error: lastRun.error } });
  else if (lastRun) add('model', 'ok', 'The model answered', `Last run ${lastRun.id} (${lastRun.agent}) ${lastRun.status}.`, { evidence: { run: lastRun.id } });
  else add('model', 'degraded', 'The model has not been used', 'A key is set but no agent has run, so nothing proves it works.', { fix: 'Run CIPHER\'s watch or generate one draft.' });

  const level = items.reduce((lv, i) => worst(lv, i.level), 'ok');
  const blocked = items.filter((i) => i.level === 'blocked');
  const degraded = items.filter((i) => i.level === 'degraded');
  return {
    level,
    blocked: blocked.length,
    degraded: degraded.length,
    // What the bar says in one line: the worst thing, named.
    summary: blocked.length ? blocked[0].title : degraded.length ? degraded[0].title : 'ready',
    items,
  };
}
