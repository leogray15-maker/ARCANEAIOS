/**
 * The readiness check — the one piece of reasoning that decides whether
 * the bar tells Leo the truth. Every rule here is a claim the interface
 * will make about the system, so every rule is asserted.
 */
import { readiness } from '../packages/database/src/readiness.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const item = (r, id) => r.items.find((i) => i.id === id);

const full = {
  env: { operator_key: true, anthropic: true, service_key: true, mock: false, dev_db: false },
  db: { kind: 'postgrest', ok: true, error: '' },
  tables: [{ table: 'orders', ok: true, migration: '0004_operating_state.sql' }, { table: 'products', ok: true, migration: '0005_lab.sql' }],
  counts: { archive_modules: 1342, products: 138, stock_lots: 4, dispatch: 2 },
  lastRun: { id: 'CIP-R-1', agent: 'CIPHER', status: 'ok', error: '' },
};

/* ---- a healthy machine ---- */
let r = readiness(full);
ok(r.level === 'ok', 'a complete machine is ok');
ok(r.blocked === 0 && r.degraded === 0, 'nothing blocked or degraded');
ok(r.summary === 'ready', 'the summary says ready');
ok(item(r, 'archives').detail.includes('1,342'), 'the module count is the evidence, not a guess');

/* ---- no operator key: the API is shut ---- */
r = readiness({ ...full, env: { ...full.env, operator_key: false } });
ok(r.level === 'blocked' && item(r, 'operator').level === 'blocked', 'no operator key blocks');
ok(r.summary === 'The API is closed', 'the bar names the door first');
ok(/ARCANE_OPERATOR_KEY/.test(item(r, 'operator').fix), 'the fix names the variable');

/* ---- migrations: named by file, not by symptom ---- */
r = readiness({ ...full, tables: [{ table: 'orders', ok: true, migration: '0004_operating_state.sql' }, { table: 'trades', ok: false, migration: '0008_trading.sql' }, { table: 'setups', ok: false, migration: '0008_trading.sql' }] });
const mig = item(r, 'migrations');
ok(mig.level === 'blocked', 'a missing table blocks');
ok(mig.title === '1 migration to run', 'two tables from one file are one migration');
ok(mig.fix.includes('supabase/migrations/0008_trading.sql'), 'the fix names the file to run');
ok(mig.evidence.tables.join() === 'trades,setups', 'the evidence names the tables');

/* ---- the imports ---- */
r = readiness({ ...full, counts: { ...full.counts, archive_modules: 0 } });
ok(item(r, 'archives').level === 'blocked' && /herald:index/.test(item(r, 'archives').fix), 'an empty index blocks and names the command');
r = readiness({ ...full, counts: { ...full.counts, products: 0 } });
ok(item(r, 'catalogue').level === 'blocked' && /products:import/.test(item(r, 'catalogue').fix), 'an empty catalogue blocks and names the command');

/* ---- stock is a degradation, not a blocker: the room still works ---- */
r = readiness({ ...full, counts: { ...full.counts, stock_lots: 0 } });
ok(item(r, 'stock').level === 'degraded', 'no lots degrades rather than blocks');
ok(r.level === 'degraded' && r.blocked === 0, 'the machine is degraded, not blocked');
ok(/realised/.test(item(r, 'stock').detail), 'it says which numbers are theoretical');

/* ---- the model: presence of a key is not proof it works ---- */
r = readiness({ ...full, env: { ...full.env, anthropic: false } });
ok(item(r, 'model').level === 'blocked', 'no key blocks the model');
r = readiness({ ...full, lastRun: { id: 'HER-R-2', agent: 'HERALD', status: 'failed', error: 'the Anthropic account has no API credits — top up at console.anthropic.com' } });
ok(item(r, 'model').level === 'blocked', 'a credit failure on the last run blocks');
ok(item(r, 'model').evidence.run === 'HER-R-2', 'the run is the evidence');
r = readiness({ ...full, lastRun: { id: 'HER-R-3', agent: 'HERALD', status: 'failed', error: 'overloaded' } });
ok(item(r, 'model').level === 'degraded', 'another kind of failure degrades');
r = readiness({ ...full, lastRun: null });
ok(item(r, 'model').level === 'degraded' && /nothing proves it works/.test(item(r, 'model').detail), 'an unused key is not called ok');
r = readiness({ ...full, env: { ...full.env, mock: true } });
ok(item(r, 'model').level === 'degraded' && /MOCK|mock/.test(item(r, 'model').title + item(r, 'model').detail), 'the mock writer is declared');

/* ---- the dev database must never look like production ---- */
r = readiness({ ...full, db: { kind: 'memory', ok: true, error: '' } });
ok(item(r, 'database').level === 'degraded' && /Supabase/.test(item(r, 'database').detail), 'the dev database says nothing reaches Supabase');
r = readiness({ ...full, db: { kind: '', ok: false, error: 'no service key' } });
ok(item(r, 'database').level === 'blocked', 'an unreachable database blocks');

/* ---- an absent count is not a passing count ---- */
r = readiness({ ...full, counts: {} });
ok(!item(r, 'archives') && !item(r, 'catalogue'), 'a check that cannot be made is not reported as ok');

/* ---- every item can explain itself ---- */
r = readiness(full);
ok(r.items.every((i) => i.id && i.title && i.detail && i.room), 'every item names itself, says what it means and where it belongs');
ok(r.items.filter((i) => i.level !== 'ok').every((i) => i.fix), 'every item that is not ok says what to do');

if (fails.length) { console.error(`✗ readiness: ${fails.length} failed`); for (const f of fails) console.error('  · ' + f); process.exit(1); }
console.log('✓ readiness — the blockers the bar reports are the ones the evidence supports (24 checks)');
