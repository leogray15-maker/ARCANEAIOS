/**
 * The one process that runs between requests, the only way it can on
 * Vercel: a scheduled hit rather than a resident scheduler. `vercel.json`
 * fires this on a timer; it does the things nothing else would ever get
 * around to doing if every call were only ever a person asking for a page.
 *
 *   GET /api/tick
 *
 * Vercel Cron calls this itself and does not send the operator key, so it
 * is authorised separately: by `Authorization: Bearer $CRON_SECRET`, which
 * Vercel sends when CRON_SECRET is set on the project, or by the operator
 * key for a manual/local trigger (`_auth.js` `cronAuthorized`).
 *
 * `vercel.json` asks for once a day (03:00). A first attempt at every 15
 * minutes was wrong, not just wasteful: on the Hobby plan a cron more
 * frequent than daily does not get silently throttled, it fails the
 * whole deployment (Vercel checks `vercel.json` at deploy time and
 * rejects it — this is what actually broke the first push of this
 * feature). Once a day means a stale run can wait up to 24 hours to be
 * reaped; nothing else depends on this endpoint, so nothing breaks in
 * the meantime — an agent shows as `stalled` on the Bridge and in THE
 * CONTROL ROOM either way, reaped or not. Raise the frequency only on a
 * plan that allows it.
 *
 * What it does, every time, cheaply:
 *   1. reap stalled runs — a `running` row whose heartbeat has gone quiet
 *      past the window is marked failed, atomically (packages/database/src/content.js `runs.reap`)
 *   2. run the AI agents that are switched on and whose schedule has had a
 *      tick since they last ran (packages/agents), one after another, each
 *      only if its time limit still fits inside this function's 300 s —
 *      what does not fit waits for the next wake and says so
 *   HERALD's own schedule stays where it is (`tools/herald-schedule.sh`, launchd).
 *
 * Also reachable as /api/cron (a rewrite in vercel.json), the path the
 * GitHub Actions scheduler calls when Vercel's daily limit is too coarse.
 */
import { json, cronAuthorized } from './_auth.js';
import { db } from './_lib.js';
import { runs } from '../packages/database/src/content.js';
import { agentsTable } from '../packages/database/src/ai.js';
import { runAgent, AGENT_DEFS, publicDef, isDue } from '../packages/agents/src/index.js';

/** The function's limit (vercel.json maxDuration), less a margin to write the answer. */
const BUDGET_MS = 280_000;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'use GET or POST' });
  if (!cronAuthorized(req)) return json(res, 401, { error: 'tick needs CRON_SECRET (as Vercel Cron sends it) or the operator key' });
  let d;
  try { d = db(); } catch (e) { return json(res, 503, { error: e.message }); }
  try {
    const t0 = Date.now();
    const recovered = await runs.reap(d);
    const rows = await agentsTable.ensure(d, AGENT_DEFS.map((x) => ({ id: x.id, schedule: x.schedule, config: publicDef(x) })));
    const ran = [], deferred = [];
    for (const [i, def] of AGENT_DEFS.entries()) {
      const row = rows[i];
      if (!row?.enabled || !row.schedule || def.disabled || !isDue(row.schedule, row.last_run_at)) continue;
      if (Date.now() - t0 + def.maxDurationMs > BUDGET_MS) { deferred.push(def.id); continue; }
      const r = await runAgent(def.id, { trigger: 'cron' }, { db: d });
      ran.push({ agent: def.id, run: r.runId, status: r.status, error: r.error, outputs: r.outputs.length });
    }
    return json(res, 200, { at: new Date().toISOString(), reaped: recovered.map((r) => r.id), ran, deferred });
  } catch (e) { return json(res, e.status || 500, { error: e.message }); }
}
