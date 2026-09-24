// @ts-check
/**
 * runAgent(): execute one agent, completely, and record it.
 *
 * In order: find the definition; refuse if it is switched off or stubbed;
 * take the agent's lock (a second run of the same agent while one is in
 * flight is refused, not queued); open a run row; run the agent's
 * pipeline — or the generic tool loop — with a step limit, a per-run
 * budget and a time limit; save what it produced; close the run row with
 * status, model, tokens, cost, steps and duration; release the lock.
 *
 * It never throws. Anything that goes wrong after the run row exists is
 * recorded on that row as a failed run with the error, and returned.
 */
import { runModel, AiError, DEFAULT_FX_GBP_PER_USD } from '../../ai/src/index.js';
import { agentsTable, usage } from '../../database/src/ai.js';
import { runs, nextId } from '../../database/src/content.js';
import { AGENT_BY_ID, STANDING_RULES } from '../../config/src/index.js';
import { callTool, toolSpecs, TOOLS } from './tools.js';
import { AGENT_DEFS, publicDef } from './registry.js';

/**
 * @typedef {import('./registry.js').AgentDef} AgentDef
 * @typedef {import('../../database/src/ai.js').Db} Db
 * @typedef {import('../../ai/src/router.js').RunOptions} RunOptions
 * @typedef {import('../../ai/src/router.js').RunResult} RunResult
 * @typedef {import('../../ai/src/providers.js').Message} Message
 *
 * @typedef {object} RunDeps
 * @property {Db} db
 * @property {Record<string, string | undefined>} [env]
 * @property {typeof globalThis.fetch} [fetch]
 * @property {(ms: number) => Promise<void>} [sleep]
 * @property {AgentDef[]} [defs]            the registry; tests pass their own
 *
 * @typedef {{ ok: boolean, status: 'ok' | 'failed' | 'skipped' | 'refused', runId: string, agent: string, summary: string, error: string, outputs: string[], model: string, steps: number, costGbp: number, tokens: { in: number, out: number }, durationMs: number, data?: Record<string, unknown> }} RunReport
 *
 * @typedef {object} RunContext
 * @property {string} runId
 * @property {AgentDef} def
 * @property {Db} db
 * @property {Record<string, string | undefined>} env
 * @property {typeof globalThis.fetch} fetch
 * @property {Record<string, unknown>} input
 * @property {(opts: Partial<RunOptions> & { messages: Message[] }) => Promise<RunResult>} model   one step; applies the agent's tier, budget and deadline
 * @property {(name: string, input: Record<string, unknown>) => Promise<unknown>} tool              a tool from the agent's list, validated both ways
 * @property {(activity: string) => Promise<void>} heartbeat
 * @property {() => number} remainingMs
 * @property {string[]} saved                                                                          output ids saved so far
 * @property {string} system                                                                           the instructions plus the standing rules
 */

export class StepLimitError extends Error {
  /** @param {number} max */
  constructor(max) { super(`step limit reached (${max})`); this.name = 'StepLimitError'; }
}

/** What every agent is told before its own instructions. */
export function systemPrompt(/** @type {AgentDef} */ def) {
  const rules = STANDING_RULES.map((/** @type {{ text: string }} */ r) => `- ${r.text}`).join('\n');
  return `You are ${def.name}, an agent inside THE ARCANE, Leo's operating system. ${def.description}\n\nStanding rules, enforced in code; never write anything that would need one of them to bend:\n${rules}\n\n${def.instructions}`;
}

/** @param {Db} db */
async function fxRate(db) {
  try {
    const rows = /** @type {Array<{ value: string }>} */ (await db.get('settings', { select: 'value', key: 'eq.fx_gbp_per_usd', limit: 1 }));
    const n = Number(rows[0]?.value);
    return n > 0 ? n : DEFAULT_FX_GBP_PER_USD;
  } catch { return DEFAULT_FX_GBP_PER_USD; }
}

/**
 * @param {string} agentId
 * @param {{ trigger?: 'manual' | 'cron', input?: Record<string, unknown>, device?: string }} req
 * @param {RunDeps} deps
 * @returns {Promise<RunReport>}
 */
export async function runAgent(agentId, req, deps) {
  const t0 = Date.now();
  const env = deps.env || process.env;
  const doFetch = deps.fetch || globalThis.fetch;
  const defs = deps.defs || AGENT_DEFS;
  const db = deps.db;
  /** @type {RunReport} */
  const report = { ok: false, status: 'refused', runId: '', agent: agentId, summary: '', error: '', outputs: [], model: '', steps: 0, costGbp: 0, tokens: { in: 0, out: 0 }, durationMs: 0 };
  const done = (/** @type {Partial<RunReport>} */ patch) => ({ ...report, ...patch, durationMs: Date.now() - t0 });

  const def = defs.find((d) => d.id === agentId);
  if (!def) return done({ error: `no agent "${agentId}"` });
  if (def.disabled) return done({ error: def.disabled });

  // Input first: a bad request should not take the lock or open a run row.
  /** @type {Record<string, unknown>} */
  let input = req.input || {};
  if (def.input) {
    const parsed = def.input.safeParse(input);
    if (!parsed.success) return done({ error: `invalid input: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}` });
    input = /** @type {Record<string, unknown>} */ (parsed.data);
  }

  /** @type {import('../../database/src/ai.js').AgentRow} */
  let row;
  try { [row] = await agentsTable.ensure(db, [{ id: def.id, schedule: def.schedule, config: publicDef(def) }]); }
  catch (e) { return done({ status: 'failed', error: e instanceof Error ? e.message : String(e) }); }
  if (!row.enabled) return done({ error: `${def.name} is switched off — turn it on in THE AGENT GARAGE` });

  let runId = '';
  try { runId = await nextId(db, 'agent_runs', def.runPrefix); }
  catch (e) { return done({ status: 'failed', error: e instanceof Error ? e.message : String(e) }); }
  if (!(await agentsTable.lock(db, def.id, runId, def.maxDurationMs + 60_000).catch(() => false))) {
    return done({ status: 'skipped', error: `${def.name} is already running` });
  }

  const owner = AGENT_BY_ID[def.owner];
  const trigger = req.trigger || 'manual';
  let lastModel = '';
  let costGbp = 0, steps = 0;
  const tokens = { in: 0, out: 0 };
  /** @type {string[]} */
  const saved = [];
  let status = /** @type {'ok' | 'failed'} */ ('failed');
  let error = '', summary = '';
  /** @type {Record<string, unknown> | undefined} */
  let data;

  try {
    await runs.start(db, { id: runId, agent: owner?.name || def.owner.toUpperCase(), skill: def.id, objective: String(input.task || input.question || def.description).slice(0, 300), model: '', input, device: req.device || '' });
    await db.patch('agent_runs', { id: `eq.${runId}` }, { trigger }, { returning: false }).catch(() => {});
    const fx = await fxRate(db);
    const deadline = t0 + def.maxDurationMs;

    /** @type {RunContext} */
    const ctx = {
      runId, def, db, env, fetch: doFetch, input, saved, system: systemPrompt(def),
      remainingMs: () => deadline - Date.now(),
      heartbeat: async (activity) => { await runs.heartbeat(db, runId, activity).catch(() => null); },
      model: async (opts) => {
        if (steps >= def.maxSteps) throw new StepLimitError(def.maxSteps);
        steps++;
        const remaining = Math.max(0, def.budgetGbpPerRun - costGbp);
        /** @type {RunOptions} */
        const o = { purpose: def.id, maxTokens: 2_000, ...(opts.tier || opts.model || opts.chain ? {} : { tier: def.tier, model: def.model, fallbackTier: def.fallbackTier }), ...opts, maxCostGbp: Math.min(opts.maxCostGbp ?? Infinity, remaining), deadlineMs: Math.max(1_000, deadline - Date.now() - 5_000) };
        const r = await runModel(o, {
          env, fetch: doFetch, sleep: deps.sleep, fxGbpPerUsd: fx,
          monthSpendGbp: () => usage.monthSpendGbp(db),
          onUsage: (u) => usage.record(db, { at: u.at, run_id: runId, agent: def.id, purpose: u.purpose, provider: u.provider, model: u.model, model_id: u.modelId, served_model: u.servedModel, free: u.free, ok: u.ok, error: u.error.slice(0, 500), tokens_in: u.tokensIn, tokens_out: u.tokensOut, cost_usd: u.costUsd, cost_gbp: u.costGbp, latency_ms: u.latencyMs }),
        });
        costGbp += r.costGbp; tokens.in += r.usage.in; tokens.out += r.usage.out; lastModel = r.servedModel || r.modelId;
        await runs.heartbeat(db, runId, `step ${steps}: ${r.model}`).catch(() => null);
        return r;
      },
      tool: async (name, toolInput) => {
        if (!def.tools.includes(name)) throw new Error(`${def.name} may not use ${name}`);
        const res = await callTool(toolContext(), def.tools, TOOLS[name]?.wire || name, JSON.stringify(toolInput));
        if (!res.ok) throw new Error(`${res.tool}: ${res.error}`);
        return res.result;
      },
    };
    const toolContext = () => ({ runId, agentId: def.id, room: def.room, db, env, fetch: doFetch, modelUsed: () => lastModel, saved });

    const work = (def.run || genericLoop)(ctx);
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${Math.round(def.maxDurationMs / 1000)}s`)), def.maxDurationMs); });
    try {
      const out = /** @type {{ summary: string, data?: Record<string, unknown> }} */ (await Promise.race([work, timeout]));
      summary = out.summary; data = out.data; status = 'ok';
    } finally { clearTimeout(timer); }
  } catch (e) {
    error = e instanceof AiError ? `${e.message}` : e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - t0;
  try {
    await runs.finish(db, runId, { status, error, usage: tokens, output: { summary, outputs: saved, ...(data ? { data } : {}) } });
    await db.patch('agent_runs', { id: `eq.${runId}` }, { model: lastModel, cost_gbp: costGbp, steps, duration_ms: durationMs, output_ref: saved.join(',').slice(0, 500) }, { returning: false });
  } catch (e) { error = error || `could not record the run: ${e instanceof Error ? e.message : String(e)}`; }
  await agentsTable.unlock(db, def.id, runId, status).catch(() => {});
  return { ok: status === 'ok', status, runId, agent: def.id, summary, error, outputs: saved, model: lastModel, steps, costGbp, tokens, durationMs, ...(data ? { data } : {}) };
}

/**
 * The generic tool loop, for agents with no pipeline of their own: the
 * model is given the agent's tools and the task, calls tools until it
 * answers in plain text, and the answer is saved as the agent's output.
 * @param {RunContext} ctx
 */
export async function genericLoop(ctx) {
  const specs = toolSpecs(ctx.def.tools);
  /** @type {Message[]} */
  const messages = [{ role: 'system', content: ctx.system }, { role: 'user', content: String(ctx.input.task || ctx.def.defaultTask || 'Do your job once and report.') }];
  for (;;) {
    const r = await ctx.model({ messages, ...(specs.length ? { tools: specs } : {}) });
    if (!r.toolCalls.length) {
      const text = r.text.trim();
      if (!ctx.saved.length && text) {
        await ctx.tool('outputs.save', { type: ctx.def.outputType, title: String(ctx.input.task || ctx.def.name).slice(0, 120), content: text });
      }
      return { summary: text.slice(0, 280) };
    }
    messages.push({ role: 'assistant', content: r.text || null, tool_calls: r.toolCalls });
    for (const call of r.toolCalls) {
      const res = await callTool({ runId: ctx.runId, agentId: ctx.def.id, room: ctx.def.room, db: ctx.db, env: ctx.env, fetch: ctx.fetch, modelUsed: () => r.servedModel, saved: ctx.saved }, ctx.def.tools, call.function.name, call.function.arguments);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(res.ok ? res.result : { error: res.error }).slice(0, 12_000) });
    }
  }
}
