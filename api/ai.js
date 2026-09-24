// @ts-check
/**
 * The AI layer and the record, for THE AGENT GARAGE, SCRIPTORIUM, BEACON,
 * THE COUNCIL, THE CONTROL ROOM and THE RECORDS. Behind the operator key
 * like every route (`_auth.js`).
 *
 * The record (what /api/runs answered before; vercel.json rewrites that path here):
 *   GET  /api/ai?limit=&agent=               → { runs }
 *   GET  /api/ai?events=1&limit=&kind=       → { events }
 *   GET  /api/ai?schema=1                    → { tables }
 *
 * The agents:
 *   GET  /api/ai?view=agents                 → { agents: [definition + switches + last run], usage, paid }
 *   GET  /api/ai?view=runs&agent=<id>        → { runs } for one agent's history
 *   GET  /api/ai?view=outputs&room=&type=&status=&agent= → { outputs }
 *   GET  /api/ai?view=usage                  → { usage } this month, by model and by agent
 *   POST /api/ai { action: 'run', id, input? }            → the run report   (also POST /api/agents/<id>/run)
 *   POST /api/ai { action: 'set', id, enabled?, schedule? } → { agent }
 *   POST /api/ai { action: 'review', id, status, content? } → { output }
 *
 * One file rather than several: the Hobby plan allows 12 functions and
 * this is the twelfth.
 */
import { z } from 'zod';
import { json, guard, db } from './_lib.js';
import { runs, events } from '../packages/database/src/content.js';
import { checkSchema } from '../packages/database/src/index.js';
import { agentsTable, outputs, usage, OUTPUT_TYPES, OUTPUT_STATUSES } from '../packages/database/src/ai.js';
import { runAgent, AGENT_DEFS, publicDef, parseCron } from '../packages/agents/src/index.js';
import { paidAllowed, budgetGbp } from '../packages/ai/src/index.js';

/**
 * @typedef {{ method: string, query?: Record<string, string | string[] | undefined>, body?: unknown, headers: Record<string, string | undefined> }} ApiRequest
 * @typedef {import('../packages/database/src/ai.js').Db} Db
 */

const AGENT_IDS = /** @type {[string, ...string[]]} */ (AGENT_DEFS.map((d) => d.id).length ? AGENT_DEFS.map((d) => d.id) : ['(none)']);
const Id = z.enum(AGENT_IDS);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('run'), id: Id, input: z.record(z.string(), z.unknown()).optional(), code: z.string().optional() }),
  z.object({ action: z.literal('set'), id: Id, enabled: z.boolean().optional(), schedule: z.string().max(100).refine((s) => s.trim() === '' || !!parseCron(s), 'not a 5-field cron expression').optional(), code: z.string().optional() }),
  z.object({ action: z.literal('review'), id: z.string().regex(/^OUT-\d{8}-\d{3}$/), status: z.enum(OUTPUT_STATUSES), content: z.string().max(20_000).optional(), code: z.string().optional() }),
]);

/** @param {ApiRequest} req @param {string} k */
const q = (req, k) => { const v = req.query?.[k]; return String(Array.isArray(v) ? v[0] : v ?? ''); };

/** Every agent: its definition, the operator's switches, its last few runs. @param {Db} d */
async function agentsView(d) {
  const rows = await agentsTable.ensure(d, AGENT_DEFS.map((x) => ({ id: x.id, schedule: x.schedule, config: publicDef(x) })));
  const recent = /** @type {Array<Record<string, unknown>>} */ (await d.get('agent_runs', { select: 'id,agent,skill,status,model,error,started_at,finished_at,cost_gbp,steps,duration_ms,trigger,output_ref,usage', skill: `in.(${AGENT_DEFS.map((x) => x.id).join(',')})`, order: 'started_at.desc', limit: 200 }));
  return AGENT_DEFS.map((x, i) => {
    const mine = recent.filter((r) => r.skill === x.id);
    const row = rows[i];
    return { ...publicDef(x), enabled: row.enabled, schedule: row.schedule, lastRunAt: row.last_run_at, lastStatus: row.last_status, running: !!row.lock_run_id && !!row.lock_until && new Date(row.lock_until).getTime() > Date.now(), lastRun: mine[0] || null, recent: mine.slice(0, 5) };
  });
}

export default guard(['GET', 'POST'], async (/** @type {ApiRequest} */ req, /** @type {import('node:http').ServerResponse} */ res) => {
  const d = /** @type {Db} */ (db());
  if (req.method === 'GET') {
    // The record, exactly as /api/runs answered it.
    if (q(req, 'schema')) return json(res, 200, { tables: await checkSchema(d) });
    if (q(req, 'events')) return json(res, 200, { events: await events.list(d, { limit: Number(q(req, 'limit')) || 50, kind: q(req, 'kind') }) });
    const view = q(req, 'view');
    if (!view) return json(res, 200, { runs: await runs.list(d, { limit: Number(q(req, 'limit')) || 30, agent: q(req, 'agent') }) });

    if (view === 'agents') {
      const [agents, summary] = await Promise.all([agentsView(d), usage.summary(d)]);
      return json(res, 200, { agents, usage: summary, paid: { allowed: paidAllowed(process.env), budgetGbp: budgetGbp(process.env) } });
    }
    if (view === 'runs') {
      const id = q(req, 'agent');
      /** @type {Record<string, string | number>} */
      const params = { select: '*', order: 'started_at.desc', limit: Math.min(100, Number(q(req, 'limit')) || 30) };
      if (id) params.skill = `eq.${id}`; else params.skill = `in.(${AGENT_DEFS.map((x) => x.id).join(',')})`;
      return json(res, 200, { runs: await d.get('agent_runs', params) });
    }
    if (view === 'outputs') {
      const type = q(req, 'type'), status = q(req, 'status');
      if (type && !(/** @type {readonly string[]} */ (OUTPUT_TYPES)).includes(type)) return json(res, 400, { error: `type must be one of ${OUTPUT_TYPES.join(', ')}` });
      if (status && !(/** @type {readonly string[]} */ (OUTPUT_STATUSES)).includes(status)) return json(res, 400, { error: `status must be one of ${OUTPUT_STATUSES.join(', ')}` });
      return json(res, 200, { outputs: await outputs.list(d, { room: q(req, 'room'), agent: q(req, 'agent'), type, status, limit: Number(q(req, 'limit')) || 50 }) });
    }
    if (view === 'usage') return json(res, 200, { usage: await usage.summary(d), paid: { allowed: paidAllowed(process.env), budgetGbp: budgetGbp(process.env) } });
    return json(res, 400, { error: `unknown view "${view}"` });
  }

  // POST. The rewrite for /api/agents/<id>/run puts the action and id in the query.
  const raw = /** @type {Record<string, unknown>} */ (req.body && typeof req.body === 'object' ? req.body : {});
  const merged = { ...raw, ...(q(req, 'action') ? { action: q(req, 'action') } : {}), ...(q(req, 'id') ? { id: q(req, 'id') } : {}) };
  const parsed = Body.safeParse(merged);
  if (!parsed.success) return json(res, 400, { error: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`).join('; ') });
  const b = parsed.data;
  const device = typeof raw.code === 'string' ? raw.code : '';

  if (b.action === 'run') {
    const report = await runAgent(b.id, { trigger: 'manual', input: b.input || {}, device }, { db: d });
    const status = report.status === 'ok' ? 200 : report.status === 'skipped' ? 409 : report.status === 'refused' ? 422 : 502;
    return json(res, status, { ...report, ...(report.error ? { error: report.error } : {}) });
  }
  if (b.action === 'set') {
    await agentsTable.ensure(d, AGENT_DEFS.map((x) => ({ id: x.id, schedule: x.schedule, config: publicDef(x) })));
    const agent = await agentsTable.set(d, b.id, { enabled: b.enabled, schedule: b.schedule }, 'leo');
    return json(res, 200, { agent });
  }
  const output = await outputs.review(d, b.id, b.status, { content: b.content });
  if (!output) return json(res, 404, { error: `no output ${b.id}` });
  return json(res, 200, { output });
});
