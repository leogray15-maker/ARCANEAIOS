/**
 * The one process that runs between requests, the only way it can on
 * Vercel: a scheduled hit rather than a resident scheduler. `vercel.json`
 * fires this on a timer; it does the things nothing else would ever get
 * around to doing if every call were only ever a person asking for a page.
 *
 *   GET /api/tick
 *
 * Vercel Cron calls this itself and does not send the operator key, so it
 * is authorised separately, by a header only Vercel's own scheduler sets
 * (`x-vercel-cron`) or by the operator key for a manual/local trigger —
 * never open to the public internet undecorated.
 *
 * `vercel.json` asks for every 15 minutes; Vercel's Hobby plan runs a cron
 * at most once a day regardless of what the file says, so on that plan
 * this only actually fires nightly until the project is on Pro. Nothing
 * breaks either way — a stale run just waits longer to be reaped, and the
 * bar's own readiness check is unaffected, since it never depended on
 * this endpoint.
 *
 * What it does, every time, cheaply:
 *   1. reap stalled runs — a `running` row whose heartbeat has gone quiet
 *      past the window is marked failed, atomically (packages/database/src/content.js `runs.reap`)
 *   2. nothing else yet — HERALD's own schedule stays where it is
 *      (`tools/herald-schedule.sh`, launchd) until it is worth moving here too
 */
import { json } from './_auth.js';
import { db } from './_lib.js';
import { runs } from '../packages/database/src/content.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'use GET or POST' });
  const fromVercelCron = !!req.headers['x-vercel-cron'];
  const key = process.env.ARCANE_OPERATOR_KEY || '';
  const given = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1] || '';
  if (!fromVercelCron && (!key || given !== key)) return json(res, 401, { error: 'tick is for Vercel Cron or the operator key' });
  let d;
  try { d = db(); } catch (e) { return json(res, 503, { error: e.message }); }
  try {
    const recovered = await runs.reap(d);
    return json(res, 200, { at: new Date().toISOString(), reaped: recovered.map((r) => r.id) });
  } catch (e) { return json(res, e.status || 500, { error: e.message }); }
}
