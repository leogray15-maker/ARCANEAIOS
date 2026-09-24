#!/usr/bin/env node
// @ts-check
/**
 * Run one agent once, from the terminal, and print what it stored.
 *
 *   npm run agent -- library-summariser
 *   npm run agent -- scriptorium-drafter
 *   npm run agent -- council --question "Should I raise the Archives price this month?"
 *   npm run agent -- --list
 *
 * Uses .env: the provider keys, NOTION_TOKEN, and the database — Supabase
 * with SUPABASE_SERVICE_ROLE_KEY, or the dev database with ARCANE_DB=memory.
 * The agent must be switched on (THE AGENT GARAGE, or --enable here). Same
 * runner, same limits and the same record as a run from the floor.
 */
import { loadEnv } from '../packages/database/src/index.js';
import { openDb } from '../packages/database/src/dev.js';
import { agentsTable, outputs } from '../packages/database/src/ai.js';
import { runAgent, allDefs, publicDef } from '../packages/agents/src/index.js';

loadEnv();
const args = process.argv.slice(2);
const flag = (/** @type {string} */ name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] || '' : ''; };
const db = /** @type {import('../packages/database/src/ai.js').Db} */ (openDb());
const defs = await allDefs(db);

if (!args.length || args.includes('--list')) {
  const rows = await agentsTable.ensure(db, defs.map((d) => ({ id: d.id, schedule: d.schedule, config: publicDef(d) })));
  for (const [i, d] of defs.entries()) console.log(`${d.id.padEnd(24)} ${rows[i].enabled ? 'on ' : 'off'} ${(rows[i].schedule || 'manual').padEnd(12)} ${d.disabled ? `stub: ${d.disabled.slice(0, 60)}…` : d.description.slice(0, 70)}`);
  if (db.kind === 'dev') await new Promise((res) => setTimeout(res, 300));
  process.exit(0);
}
const id = args[0];
if (args.includes('--enable')) { await agentsTable.ensure(db, defs.filter((d) => d.id === id).map((d) => ({ id: d.id, schedule: d.schedule, config: publicDef(d) }))); await agentsTable.set(db, id, { enabled: true }, 'tools/agent-run.mjs'); }
const question = flag('--question'), task = flag('--task');
const input = question ? { question, ...(flag('--context') ? { context: flag('--context') } : {}) } : task ? { task } : {};

console.log(`running ${id} (${db.kind} database)…`);
const r = await runAgent(id, { trigger: 'manual', input, device: 'cli' }, { db, defs });
console.log(`\n${r.status.toUpperCase()}  run ${r.runId || '—'} · ${r.model || 'no model'} · ${r.steps} steps · ${r.tokens.in + r.tokens.out} tokens · £${r.costGbp.toFixed(4)} · ${(r.durationMs / 1000).toFixed(1)}s`);
if (r.summary) console.log(r.summary);
if (r.error) console.log(`error: ${r.error}`);
for (const oid of r.outputs.filter((x) => x.startsWith('OUT-'))) {
  const o = await outputs.get(db, oid);
  if (o) console.log(`\n--- ${o.id} · ${o.type} · ${o.room} · ${o.status}\n${o.title}\n\n${o.content}`);
}
for (const did of r.outputs.filter((x) => x.startsWith('HER-'))) {
  const d = /** @type {Record<string, unknown> | null} */ (await db.get('content_drafts', { select: 'id,format,platform,status,title,body', id: `eq.${did}` }, { single: true }));
  if (d) console.log(`\n--- ${d.id} · ${d.format} for ${d.platform} · ${d.status}\n${d.title}\n\n${d.body}`);
}
// The dev database writes data/dev-db.json 100 ms after the last change; let it land before exiting.
if (db.kind === 'dev') await new Promise((res) => setTimeout(res, 300));
process.exit(r.ok ? 0 : 1);
