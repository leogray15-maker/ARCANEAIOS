/**
 * The mission runner: what the worker does on every tick.
 *
 *   1. recover   a running mission whose worker went quiet is failed, with its steps kept
 *   2. schedule  a standing mission that has fallen due queues a copy of itself
 *   3. resume    a paused mission whose approval Leo has answered carries on (or stops)
 *   4. claim     the next queued mission, atomically, and advance it as far as it can go
 *
 * A mission is advanced by the workflow engine (packages/database/src/workflow.js)
 * over the plan snapshotted onto its row. Each step is checked again here,
 * at the moment it runs, against the acting agent's grades and the tool's
 * policy; a step above the autonomy ceiling with no approval behind it is
 * refused even if the plan somehow carries one. Every step that does work
 * is an agent run, so the Records, the budgets and the floor's crew all see
 * it. An approval step becomes a proposed order on the board, and the
 * mission waits on Leo's answer to it — the same answer as any proposal.
 */
import { AGENT_BY_ID, ACTION_BY_ID, MISSION_TEMPLATE_BY_ID, MISSION_STALE_MS, MISSION_MAX_STEPS, AUTONOMY_CEILING, STANDING_RULES, VENTURES, ROOM_BY_ID, planProblems, stepLevel, upstreamOf, resolvePermission, GRADE_ORDER } from '../../config/src/index.js';
import { run as runWorkflow } from '../../database/src/workflow.js';
import { runs, events } from '../../database/src/content.js';
import { state } from '../../database/src/state.js';
import { nextRun } from '../../database/src/cron.js';
import { withRetry } from '../../database/src/resilience.js';
import { EXECUTORS } from './tools.js';

const EMPTY = () => ({ done: {}, skipped: [], failed: null, pending: null });
const MAX_KEPT = 24000;   // the most of one step's output kept on the row; a page of the web does not need to live there whole

/* ---------------------------------------------------------------- references */

/** `$input.question`, `$plan.queries`, `$critique.average` → the value at that path, or undefined. */
export function lookup(ref, scope) {
  const m = /^\$([a-z][\w-]*)(?:\.([\w.]+))?$/i.exec(String(ref).trim());
  if (!m) return undefined;
  let v = scope[m[1]];
  for (const k of (m[2] || '').split('.').filter(Boolean)) v = v?.[k];
  return v;
}

/** Arguments: a whole-string reference becomes the value itself (a list stays a list); anything else is kept. */
export function resolveArgs(args = {}, scope) {
  const out = {};
  for (const [k, v] of Object.entries(args)) out[k] = typeof v === 'string' && /^\$[a-z]/i.test(v) ? lookup(v, scope) : v;
  return out;
}

/** A value as text for a prompt: strings as they are, anything else as indented JSON, cut to a sane size. */
export function asText(v, max = 14000) {
  if (v === undefined || v === null || v === '') return '(nothing)';
  const s = typeof v === 'string' ? v : JSON.stringify(v, null, 1);
  return s.length > max ? `${s.slice(0, max)}\n…(cut)` : s;
}

/** A prompt with its references filled in. Only `$input` and the names of earlier steps are references; any other `$` is left alone. */
export function renderPrompt(text, scope) {
  return String(text).replace(/\$([a-z][\w-]*)((?:\.[\w]+)*)/gi, (whole, head) => (head in scope ? asText(lookup(whole, scope)) : whole));
}

function testPasses(test, scope) {
  const v = lookup(test.path, scope);
  if ('lt' in test) return Number(v) < test.lt;
  if ('gt' in test) return Number(v) > test.gt;
  if ('eq' in test) return v === test.eq;
  return !!v;
}

const trim = (v) => { const s = JSON.stringify(v ?? null); return s.length <= MAX_KEPT ? v : { cut: true, preview: s.slice(0, MAX_KEPT) }; };

/* ---------------------------------------------------------------- the voice of a thinking step */

function systemFor(agent, { lessons = [], mission }) {
  const rules = STANDING_RULES.map((r) => `- ${r.text}`).join('\n');
  const ventures = VENTURES.map((v) => `- ${v.name}: ${v.kind}. ${v.facts.join('; ')}`).join('\n');
  const rooms = Object.values(ROOM_BY_ID).map((r) => r.id).join(', ');
  return `You are ${agent.name}, ${agent.role} of THE ARCANE, working a mission on your own: ${mission.title || mission.template}.
${agent.domain}. ${agent.brief}

## STANDING RULES (enforced in code; you cannot bend them)
${rules}

## VENTURES
${ventures}
${lessons.length ? `\n## LESSONS FROM PAST REVIEWS (follow them)\n${lessons.map((l) => `- ${l}`).join('\n')}\n` : ''}
Never invent a figure, a date, a source or a quote; if the material in front of you does not say it, say it is unknown. Never make a medical, dosing or treatment claim about any compound. A proposal is the smallest next action, routed to one room (${rooms}), and it is only a proposal. Answer in the JSON shape asked for, plainly.`;
}

/** The lessons the most recent weekly review wrote down: procedural memory every later mission reads. */
async function lessonsOf(db) {
  try {
    const [r] = await db.get('missions', { select: 'output', template: 'eq.review', state: 'eq.done', order: 'finished_at.desc', limit: 1 });
    return (r?.output?.lessons || []).map(String).slice(0, 5);
  } catch { return []; }
}

/* ---------------------------------------------------------------- one step */

/** May this agent take this step now? Throws a sentence when it may not. */
export function permit(step, agent, steps, decided) {
  if (!agent) throw new Error(`${step.id}: no such agent`);
  const action = step.kind === 'think' ? ACTION_BY_ID.think : ACTION_BY_ID[step.action];
  if (!action) throw new Error(`${step.id}: unknown action "${step.action}"`);
  const level = stepLevel(step);
  if (level >= 5) throw new Error(`${step.id}: spend is never reachable`);
  const approved = [...upstreamOf(steps, step.id)].some((u) => steps.find((x) => x.id === u)?.kind === 'approval' && decided[u] && decided[u] !== false);
  if (level > AUTONOMY_CEILING && !approved) throw new Error(`${step.id}: level ${level} is above what may run unattended, and nothing upstream was approved`);
  const have = agent.caps?.[action.cap] ?? 'deny';
  if (GRADE_ORDER.indexOf(have) < GRADE_ORDER.indexOf(action.minGrade)) throw new Error(`${step.id}: ${agent.name} holds "${have}" on ${action.cap}; ${action.id} needs "${action.minGrade}"`);
  if (action.tool && action.tool !== 'counsel' && !(agent.tools || []).includes(action.tool)) throw new Error(`${step.id}: ${agent.name} does not use the ${action.tool} tool`);
  if (action.tool) {
    const p = resolvePermission(agent, action.tool, { room: agent.room });
    if (p.level === 'deny') throw new Error(`${step.id}: ${p.reason}`);
    if (p.level === 'approval' && !approved) throw new Error(`${step.id}: ${action.tool} needs the operator (${p.reason}) and nothing upstream was approved`);
  }
  return { action, level };
}

/** Runs today for an agent against its budget, if it has one. Throws when the day's runs are spent. */
async function checkBudget(db, agent, now) {
  let b = null;
  try { b = await db.get('agent_budgets', { select: '*', agent: `eq.${agent.id}` }, { single: true }); } catch { return; }
  if (!b || b.active === false || !b.runs_daily) return;
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const today = await db.get('agent_runs', { select: 'id', agent: `eq.${agent.name}`, started_at: `gte.${day.toISOString()}`, limit: b.runs_daily + 1 }).catch(() => []);
  if (today.length >= b.runs_daily) throw new Error(`${agent.name} has used today's ${b.runs_daily} runs (THE CONTROL ROOM sets the budget)`);
}

/**
 * Build the workflow engine's steps from a mission's plan: each one checks
 * its permission, records its run, beats the mission's heart, does its
 * work, and hands back JSON.
 */
function engineSteps(mission, ctx, counter) {
  const tpl = MISSION_TEMPLATE_BY_ID[mission.template];
  const steps = mission.plan;
  return steps.map((step) => {
    const agent = AGENT_BY_ID[step.agent || mission.agent || tpl?.agent];
    const base = { id: step.id, after: step.after || [] };
    const scope = (done) => ({ input: mission.input || {}, ...done });
    if (step.kind === 'condition') return { ...base, kind: 'condition', test: ({ done }) => testPasses(step.test, scope(done)) };
    if (step.kind === 'approval') return { ...base, kind: 'approval', describe: ({ done }) => renderPrompt(step.describe || `Approve the next step of ${mission.title}`, scope(done)) };
    return {
      ...base, kind: 'agent',
      run: async ({ done }) => {
        if (++counter.n > MISSION_MAX_STEPS) throw new Error(`stopped after ${MISSION_MAX_STEPS} steps`);
        const { action } = permit(step, agent, steps, done);
        await beat(ctx.db, mission.id, step.id, counter.n, ctx.now());
        const executor = EXECUTORS[action.id];
        const traced = !!executor?.traced;
        // Steps in one wave run together, so the id cannot be the table's next number (two steps would read the same one); the mission, the step and the moment make it unique.
        const runId = traced ? '' : `${mission.id}.${step.id}.${ctx.now().getTime().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        const objective = `${mission.title || mission.template} · ${step.id}`;
        if (runId) await runs.start(ctx.db, { id: runId, agent: agent.name, skill: `mission:${mission.template}`, objective, model: step.kind === 'think' ? ctx.model : '', input: { mission: mission.id, step: step.id }, device: ctx.worker, mission: mission.id });
        try {
          let out; let usage = {};
          if (step.kind === 'think') {
            if (!ctx.client) throw new Error('no model is wired on this worker — set ARCANE_PROVIDER=ollama');
            await checkBudget(ctx.db, agent, ctx.now());
            const r = await withRetry(() => ctx.client.messages.create({
              model: ctx.model, max_tokens: step.maxTokens || 6000,
              system: [{ type: 'text', text: systemFor(agent, { lessons: ctx.lessons, mission }) }],
              messages: [{ role: 'user', content: renderPrompt(step.prompt, scope(done)) }],
              thinking: { type: 'adaptive' }, output_config: { effort: step.effort || 'medium', format: { type: 'json_schema', schema: step.schema } },
            }), { maxAttempts: 3, baseMs: 2000, sleep: ctx.sleep });
            if (r.stop_reason === 'refusal') throw new Error(`${agent.name} refused the step`);
            out = JSON.parse(r.content.find((b) => b.type === 'text')?.text || '{}');
            usage = { in: r.usage?.input_tokens || 0, out: r.usage?.output_tokens || 0, cached: r.usage?.cache_read_input_tokens || 0 };
          } else {
            if (!executor?.run) throw new Error(`${action.id} has no executor`);
            out = await executor.run(resolveArgs(step.args, scope(done)), { ...ctx, now: ctx.now(), agent, runId, mission });
          }
          if (runId) await runs.finish(ctx.db, runId, { status: 'ok', usage, output: { mission: mission.id, step: step.id, keys: Object.keys(out || {}) } });
          return trim(out);
        } catch (e) {
          if (runId) await runs.finish(ctx.db, runId, { status: 'failed', error: e.message }).catch(() => {});
          throw e;
        }
      },
    };
  });
}

async function beat(db, id, step, n, now) {
  await db.patch('missions', { id: `eq.${id}` }, { heartbeat_at: now.toISOString(), current_step: step, steps_run: n }).catch(() => {});
}

async function event(db, kind, mission, summary, data = {}) {
  await events.add(db, { kind, actor: AGENT_BY_ID[mission.agent]?.name || 'worker', subject_type: 'mission', subject_id: mission.id, summary, data }).catch(() => {});
}

/* ---------------------------------------------------------------- advancing a mission */

/**
 * Run a claimed mission as far as it can go: to the end, to an approval,
 * or to a failure. Writes the outcome onto the row and returns it.
 */
export async function advance(db, mission, ctx) {
  const problems = planProblems(mission.plan || [], { agentOf: (s) => AGENT_BY_ID[s.agent || mission.agent] });
  const prior = { ...EMPTY(), ...(mission.progress || {}) };
  const counter = { n: mission.steps_run || 0 };
  let result;
  if (problems.length) result = { ...prior, failed: { id: '(plan)', error: problems[0] } };
  else {
    const lessons = await lessonsOf(db);
    result = await runWorkflow(engineSteps(mission, { ...ctx, db, lessons }, counter), {}, prior);
  }
  const now = ctx.now().toISOString();
  const tpl = MISSION_TEMPLATE_BY_ID[mission.template];
  let patch;
  if (result.failed) {
    patch = { state: 'failed', error: `${result.failed.id}: ${result.failed.error}`, finished_at: now };
    await event(db, 'mission.failed', mission, `${mission.title}: failed at ${result.failed.id} — ${result.failed.error}`);
  } else if (result.pending) {
    const order = await state.insert(db, 'orders', {
      room: mission.room, text: `Approve: ${String(result.pending.description).slice(0, 400)}`, priority: mission.priority ?? 2,
      state: 'proposed', actor: 'agent', agent: mission.agent, holder: AGENT_BY_ID[mission.agent]?.name || 'ARCANE', source: 'agent', source_id: mission.id,
      note: `Mission ${mission.id} (${mission.title}) is waiting at step "${result.pending.id}". Approve to let it carry on; kill to stop it there.`,
    }, { actor: AGENT_BY_ID[mission.agent]?.name || 'worker', now: ctx.now() });
    patch = { state: 'paused', pending_order: order.id };
    await event(db, 'mission.paused', mission, `${mission.title}: waiting on ${order.id} at ${result.pending.id}`, { order: order.id });
  } else {
    const output = tpl?.output && result.done[tpl.output] !== undefined ? result.done[tpl.output] : {};
    patch = { state: 'done', output: output && typeof output === 'object' ? output : { value: output }, finished_at: now };
    await event(db, 'mission.done', mission, `${mission.title}: done in ${counter.n} steps`);
  }
  const [saved] = await db.patch('missions', { id: `eq.${mission.id}` }, { ...patch, progress: result, steps_run: counter.n, current_step: '', claimed_by: patch.state === 'paused' ? '' : mission.claimed_by, heartbeat_at: now });
  return saved || { ...mission, ...patch, progress: result };
}

/* ---------------------------------------------------------------- the tick */

/** Fail any running mission whose worker stopped beating. Its finished steps stay on the row; re-queue to start again. */
export async function recover(db, { now = new Date(), staleMs = MISSION_STALE_MS } = {}) {
  const cutoff = new Date(now.getTime() - staleMs).toISOString();
  const stale = await db.get('missions', { select: 'id,title,template,agent,heartbeat_at', state: 'eq.running', heartbeat_at: `lt.${cutoff}` });
  const out = [];
  for (const m of stale) {
    const [row] = await db.patch('missions', { id: `eq.${m.id}`, state: 'eq.running' }, { state: 'failed', error: `the worker stopped mid-step (no heartbeat since ${m.heartbeat_at})`, finished_at: now.toISOString(), claimed_by: '' });
    if (row) { out.push(row.id); await event(db, 'mission.stalled', m, `${m.title}: the worker went quiet — marked failed`); }
  }
  return out;
}

/** Queue a copy of every standing mission that has fallen due, and set its next time. */
export async function schedule(db, { now = new Date() } = {}) {
  const due = await db.get('missions', { select: '*', state: 'eq.standing', next_run_at: `lte.${now.toISOString()}` });
  const out = [];
  for (const m of due) {
    // Move the clock first: a crash after this queues one copy late, never two copies at once.
    const [moved] = await db.patch('missions', { id: `eq.${m.id}`, state: 'eq.standing', next_run_at: `eq.${m.next_run_at}` }, { next_run_at: nextRun(m.schedule, now).toISOString() });
    if (!moved) continue;
    const child = await state.insert(db, 'missions', { template: m.template, title: m.title, objective: m.objective, priority: m.priority, input: m.input, source: 'schedule' }, { actor: 'worker', now });
    await db.patch('missions', { id: `eq.${child.id}` }, { parent_id: m.id });
    out.push(child.id);
  }
  return out;
}

/** Carry on a paused mission whose approval has been answered: approved runs on, killed stops it there. */
export async function resume(db, ctx) {
  const paused = await db.get('missions', { select: '*', state: 'eq.paused' });
  const out = [];
  for (const m of paused) {
    const order = m.pending_order ? await db.get('orders', { select: 'id,state,note', id: `eq.${m.pending_order}` }, { single: true }) : null;
    if (order && order.state === 'proposed') continue;
    const decision = !order ? 'rejected' : order.state === 'killed' ? 'rejected' : 'approved';
    const [claimed] = await db.patch('missions', { id: `eq.${m.id}`, state: 'eq.paused' }, { state: 'running', claimed_by: ctx.worker, heartbeat_at: ctx.now().toISOString() });
    if (!claimed) continue;
    const pending = { ...(m.progress?.pending || {}), decision };
    // An approval is the work its order stood for: once the mission has it, the order is done.
    if (order && decision === 'approved' && order.state === 'open') await state.update(db, 'orders', order.id, { state: 'done' }, { actor: 'worker', now: ctx.now() }).catch(() => {});
    await event(db, `mission.${decision}`, m, `${m.title}: ${decision} at ${pending.id}`);
    out.push(await advance(db, { ...claimed, progress: { ...m.progress, pending } }, ctx));
  }
  return out;
}

/** Take the next queued mission, if another worker has not, and advance it. */
export async function claimNext(db, ctx) {
  const [next] = await db.get('missions', { select: '*', state: 'eq.queued', order: 'priority.asc,created_at.asc', limit: 1 });
  if (!next) return null;
  const now = ctx.now().toISOString();
  const [claimed] = await db.patch('missions', { id: `eq.${next.id}`, state: 'eq.queued' }, { state: 'running', claimed_by: ctx.worker, started_at: next.started_at || now, heartbeat_at: now });
  if (!claimed) return null;   // another worker got there first
  await event(db, 'mission.started', claimed, `${claimed.title}: started by ${ctx.worker}`);
  return advance(db, claimed, ctx);
}

/**
 * One tick of the worker. `ctx`: { client, model, worker, brain, env,
 * fetchImpl, now: () => Date, sleep, mock }. Returns what happened.
 */
export async function tick(db, ctx) {
  const c = { now: () => new Date(), worker: 'worker', env: process.env, fetchImpl: globalThis.fetch, ...ctx };
  const report = { recovered: [], scheduled: [], resumed: [], ran: [], reaped: 0 };
  report.recovered = await recover(db, { now: c.now() });
  try { report.reaped = (await runs.reap(db, { now: c.now() })).length; } catch {}
  report.scheduled = await schedule(db, { now: c.now() });
  report.resumed = (await resume(db, c)).map((m) => ({ id: m.id, state: m.state }));
  for (let i = 0; i < (c.max ?? 1); i++) {
    const m = await claimNext(db, c);
    if (!m) break;
    report.ran.push({ id: m.id, state: m.state, error: m.error || '' });
  }
  return report;
}

// The view a room draws lives with the templates (config), so the browser can use it too.
export { missionView } from '../../config/src/missions.js';
