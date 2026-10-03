/**
 * The worker's loop, shared by the standalone worker (tools/worker.mjs,
 * for launchd) and the dev API (tools/dev-api.mjs), which runs it in the
 * same process so the dev database is never written by two processes at
 * once. Claims are atomic, so two workers on one Supabase are safe too.
 */
import os from 'node:os';
import { modelClient, modelName, providerName, notWired } from './model.js';
import { tick } from './missions.js';

/** What a tick needs from this machine: the model, who this worker is, where the brain is. */
export function workerContext({ env = process.env, brain = null, max = 3 } = {}) {
  const provider = providerName(env);
  return {
    client: modelClient(env), model: modelName(env), provider,
    worker: `${os.hostname()}:${process.pid}`, brain, env, mock: env.HERALD_MOCK === '1', max,
    describe: () => `${provider ? `${provider} (${modelName(env)})` : notWired()} · brain ${brain ? 'found' : 'absent'}`,
  };
}

/** One tick, as a line for a log, or '' when nothing happened. */
export async function tickLine(db, ctx) {
  const r = await tick(db, ctx);
  const parts = [];
  if (r.recovered.length) parts.push(`recovered ${r.recovered.join(', ')}`);
  if (r.reaped) parts.push(`reaped ${r.reaped} stalled run${r.reaped === 1 ? '' : 's'}`);
  if (r.scheduled.length) parts.push(`queued ${r.scheduled.join(', ')} on schedule`);
  for (const m of r.resumed) parts.push(`${m.id} resumed → ${m.state}`);
  for (const m of r.ran) parts.push(`${m.id} → ${m.state}${m.error ? ` (${m.error})` : ''}`);
  return parts.join(' · ');
}

/**
 * Tick every `everyMs` until `stopped()` says so. A tick never overlaps the
 * one before it: a mission that takes ten minutes on a local model simply
 * delays the next look.
 */
export async function loop(db, ctx, { everyMs = 30_000, log = console.log, stopped = () => false } = {}) {
  while (!stopped()) {
    try { const line = await tickLine(db, ctx); if (line) log(line); }
    catch (e) { if (!/does not exist yet/.test(e.message)) log(`tick failed: ${e.message}`); else { log(`missions are not in this database yet — ${e.message}`); return; } }
    for (let t = 0; t < everyMs && !stopped(); t += 500) await new Promise((r) => setTimeout(r, 500));
  }
}
