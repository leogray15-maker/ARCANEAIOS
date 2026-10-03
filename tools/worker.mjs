#!/usr/bin/env node
/**
 * The worker: the one resident process in THE ARCANE.
 *
 *   npm run worker                          tick every 30 seconds until stopped
 *   npm run worker -- --once                one tick, then exit (launchd, cron, a test)
 *   npm run worker -- --interval 60
 *   npm run mission -- research "What are UK peptide suppliers charging this month?"
 *   npm run mission -- content --lane mindset
 *   npm run mission -- review --every "0 18 * * 0"      a standing mission: Sundays at six
 *
 * Vercel runs nothing between requests, and cannot reach a model on this
 * machine; so missions are queued from anywhere (the floor, this command)
 * and run here, against Ollama when ARCANE_PROVIDER=ollama, for nothing.
 * The floor sees every step as it happens because every step is a row.
 * `npm run dev` runs this same loop inside the dev API, so on a laptop
 * there is nothing extra to start.
 *
 * Reads .env at the repo root. Uses the dev database when ARCANE_DB=memory
 * (and then only one process should have it open — use `npm run dev`).
 */
import { loadEnv } from '../packages/database/src/index.js';
import { openDb } from '../packages/database/src/dev.js';
import { state } from '../packages/database/src/state.js';
import { workerContext, tickLine, loop } from '../packages/runtime/src/worker.js';
import { MISSION_TEMPLATE_BY_ID } from '../packages/config/src/index.js';
import { brainDir } from './lib/brain.mjs';

loadEnv();
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] ?? true) : d; };
const has = (k) => args.includes(k);
const say = (m) => console.log(`[worker ${new Date().toTimeString().slice(0, 8)}] ${m}`);

const db = openDb();

/* ---- queue a mission from the terminal ---- */
if (has('--queue')) {
  const rest = args.slice(args.indexOf('--queue') + 1);
  const template = rest[0];
  const tpl = MISSION_TEMPLATE_BY_ID[template];
  if (!tpl) { console.error(`✗ name a template: ${Object.keys(MISSION_TEMPLATE_BY_ID).join(', ')}`); process.exit(1); }
  const flags = new Set(['--lane', '--subject', '--module', '--days', '--every', '--priority']);
  const free = rest.slice(1).filter((a, i, all) => !a.startsWith('--') && !flags.has(all[i - 1]));
  const input = {};
  if (tpl.input.question) input.question = free.join(' ');
  for (const k of ['lane', 'subject', 'module', 'days']) if (opt(`--${k}`)) input[k] = opt(`--${k}`);
  try {
    const m = await state.insert(db, 'missions', { template, input, schedule: opt('--every', '') || '', priority: Number(opt('--priority', 2)), source: 'floor' }, { actor: 'leo' });
    say(m.state === 'standing' ? `${m.id} stands: ${m.title} — next ${new Date(m.next_run_at).toLocaleString()}` : `${m.id} queued: ${m.title} — the worker picks it up on its next tick`);
  } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
  // The dev database saves a moment after a write.
  await new Promise((r) => setTimeout(r, 300));
  process.exit(0);
}

/* ---- run ---- */
let brain = null;
try { brain = brainDir(); } catch {}
const ctx = workerContext({ brain, max: Number(opt('--max', 3)) });
say(`${db.kind} database · ${ctx.describe()}`);
if (ctx.provider === 'anthropic') say('note: the Anthropic provider costs money per token; ARCANE_PROVIDER=ollama runs free');

if (has('--once')) {
  const line = await tickLine(db, ctx);
  say(line || 'nothing to do');
  await new Promise((r) => setTimeout(r, 300));
  process.exit(0);
}
let stopping = false;
process.on('SIGINT', () => { stopping = true; say('stopping after this tick'); });
process.on('SIGTERM', () => { stopping = true; });
await loop(db, ctx, { everyMs: Math.max(5, Number(opt('--interval', 30))) * 1000, log: say, stopped: () => stopping });
