// @ts-check
/**
 * runModel(): one call to "a model", resolved to a real one.
 *
 * Given a tier, a named model or an explicit chain, it walks the chain in
 * order and returns the first good answer, with what it cost and what it
 * tried on the way. It moves on from a model on a rate limit, a 5xx, a
 * timeout, a network failure or an answer it cannot use (malformed, or
 * JSON that does not match the schema), after one retry with backoff and
 * jitter. A bad key or no credits retires the whole provider for the rest
 * of the call.
 *
 * Two gates stand in front of every paid call and cannot be talked past:
 *   1. ALLOW_PAID_MODELS must be exactly "true", or no paid model is called;
 *   2. the month's logged spend plus this call's estimate must fit inside
 *      MONTHLY_BUDGET_GBP, read fresh before each paid call. No budget set,
 *      or no way to read the spend, means no paid call: it fails closed.
 *
 * The router has no database of its own. The caller passes `monthSpendGbp`
 * (read from model_usage) and `onUsage` (write to model_usage), so it can
 * be tested with nothing but a fake fetch.
 */
import { z } from 'zod';
import { complete, ProviderError, PROVIDERS, providerKey } from './providers.js';
import { MODELS, TIERS, NAMED, LIMITS, DEFAULT_FX_GBP_PER_USD } from './models.js';

/**
 * @typedef {import('./models.js').ModelDef} ModelDef
 * @typedef {import('./models.js').Tier} Tier
 * @typedef {import('./providers.js').Message} Message
 * @typedef {import('./providers.js').ToolSpec} ToolSpec
 * @typedef {import('./providers.js').ToolCall} ToolCall
 * @typedef {import('./providers.js').ProviderId} ProviderId
 *
 * @typedef {{ model: string, modelId: string, provider: ProviderId, outcome: 'ok' | 'skipped' | 'failed', reason: string, status?: number, latencyMs?: number }} Attempt
 * @typedef {{ purpose: string, model: string, modelId: string, servedModel: string, provider: ProviderId, free: boolean, ok: boolean, error: string, tokensIn: number, tokensOut: number, costUsd: number, costGbp: number, latencyMs: number, at: string }} UsageRecord
 *
 * @typedef {object} RunOptions
 * @property {Tier} [tier]
 * @property {string} [model]            a key in MODELS or NAMED
 * @property {string[]} [chain]          explicit model keys, in order
 * @property {Tier} [fallbackTier]       after a named model or chain, try this tier
 * @property {Message[]} messages
 * @property {ToolSpec[]} [tools]
 * @property {z.ZodType} [schema]        the answer must be JSON matching this
 * @property {string} [schemaName]
 * @property {number} [maxTokens]
 * @property {number} [temperature]
 * @property {number} [maxCostGbp]       refuse any single paid call estimated above this
 * @property {string} [purpose]          what the call is for, in the usage log
 * @property {number} [deadlineMs]       stop starting new attempts after this long
 *
 * @typedef {object} RunDeps
 * @property {Record<string, string | undefined>} [env]
 * @property {typeof globalThis.fetch} [fetch]
 * @property {(ms: number) => Promise<void>} [sleep]
 * @property {() => number} [random]
 * @property {() => Promise<number>} [monthSpendGbp]
 * @property {(rec: UsageRecord) => Promise<void> | void} [onUsage]
 * @property {number} [fxGbpPerUsd]
 * @property {Partial<typeof LIMITS>} [limits]
 *
 * @typedef {{ text: string, data: unknown, toolCalls: ToolCall[], model: string, modelId: string, servedModel: string, provider: ProviderId, free: boolean, usage: { in: number, out: number }, costUsd: number, costGbp: number, latencyMs: number, attempts: Attempt[] }} RunResult
 */

export class AiError extends Error {
  /** @param {string} message @param {Attempt[]} attempts */
  constructor(message, attempts) {
    super(message);
    this.name = 'AiError';
    this.attempts = attempts;
    this.status = 503;
  }
}

/** Is this model free for this deployment? Gemini's free tier depends on the AI Studio project, so GEMINI_BILLING=paid turns it paid. */
export function isFree(/** @type {ModelDef} */ model, /** @type {Record<string, string | undefined>} */ env) {
  if (model.provider === 'gemini' && env.GEMINI_BILLING === 'paid') return false;
  return model.free;
}

export const paidAllowed = (/** @type {Record<string, string | undefined>} */ env) => env.ALLOW_PAID_MODELS === 'true';

/** @param {Record<string, string | undefined>} env */
export function budgetGbp(env) {
  const n = Number(env.MONTHLY_BUDGET_GBP);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Model keys to try, in order, de-duplicated. Unknown keys are an error in the config, not something to skip quietly. */
export function resolveChain(/** @type {Pick<RunOptions, 'tier' | 'model' | 'chain' | 'fallbackTier'>} */ o) {
  /** @type {string[]} */
  let keys = [];
  if (o.chain?.length) keys = [...o.chain];
  else if (o.model) keys = NAMED[o.model] ? [...NAMED[o.model].chain] : [o.model];
  else if (o.tier) keys = [...(TIERS[o.tier] || [])];
  if (o.fallbackTier && (o.chain?.length || o.model)) keys.push(...(TIERS[o.fallbackTier] || []));
  if (!keys.length) throw new AiError(`no models for ${JSON.stringify({ tier: o.tier, model: o.model })}`, []);
  for (const k of keys) if (!MODELS[k]) throw new AiError(`unknown model key "${k}" — add it to packages/ai/src/models.js`, []);
  return [...new Set(keys)];
}

/** A rough token count: about four characters a token. Only used to estimate a paid call before it is made. */
export const roughTokens = (/** @type {string} */ s) => Math.ceil(s.length / 4);

/** The worst-case cost of a call before it is made: every prompt token and every allowed output token, at list price. */
export function estimateUsd(/** @type {ModelDef} */ model, /** @type {Message[]} */ messages, /** @type {number} */ maxTokens) {
  const inTok = roughTokens(messages.map((x) => x.content || '').join('\n'));
  return (model.price.in * inTok + model.price.out * maxTokens) / 1e6;
}

/** @param {ModelDef} model @param {{ in: number, out: number }} usage @param {number | null} reported */
function actualUsd(model, usage, reported, /** @type {boolean} */ free) {
  if (free) return 0;
  if (reported !== null && reported >= 0) return reported;
  return (model.price.in * usage.in + model.price.out * usage.out) / 1e6;
}

/** Pull a JSON value out of a model's text: bare, fenced, or embedded in prose. */
export function extractJson(/** @type {string} */ text) {
  const t = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const candidates = [t, fenced?.[1]?.trim() || ''];
  const first = Math.min(...['{', '['].map((c) => { const i = t.indexOf(c); return i < 0 ? Infinity : i; }));
  const last = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (Number.isFinite(first) && last > first) candidates.push(t.slice(first, last + 1));
  for (const c of candidates) { if (!c) continue; try { return { ok: true, value: /** @type {unknown} */ (JSON.parse(c)) }; } catch { /* next */ } }
  return { ok: false, value: undefined };
}

/** The JSON Schema for a zod schema, for response_format and for the prompt. */
function jsonSchemaOf(/** @type {z.ZodType} */ schema) {
  return /** @type {Record<string, unknown>} */ (z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' }));
}

/** @param {Message[]} messages @param {Record<string, unknown>} js */
function withSchemaInstruction(messages, js) {
  const note = `Reply with a single JSON value and nothing else — no prose, no code fence. It must match this JSON Schema:\n${JSON.stringify(js)}`;
  const [head, ...rest] = messages;
  if (head?.role === 'system') return [{ ...head, content: `${head.content || ''}\n\n${note}` }, ...rest];
  return [{ role: /** @type {const} */ ('system'), content: note }, ...messages];
}

/**
 * @param {RunOptions} opts
 * @param {RunDeps} [deps]
 * @returns {Promise<RunResult>}
 */
export async function runModel(opts, deps = {}) {
  const env = deps.env || process.env;
  const doFetch = deps.fetch || globalThis.fetch;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const random = deps.random || Math.random;
  const limits = { ...LIMITS, ...(deps.limits || {}) };
  const fx = deps.fxGbpPerUsd && deps.fxGbpPerUsd > 0 ? deps.fxGbpPerUsd : DEFAULT_FX_GBP_PER_USD;
  const maxTokens = opts.maxTokens || limits.defaultMaxTokens;
  const purpose = opts.purpose || '';
  const started = Date.now();
  if (!opts.messages?.length) throw new AiError('no messages', []);

  const keys = resolveChain(opts);
  /** @type {Attempt[]} */
  const attempts = [];
  /** @type {Set<ProviderId>} */
  const deadProviders = new Set();
  let spentThisCallGbp = 0;
  let modelsTried = 0;
  const js = opts.schema ? jsonSchemaOf(opts.schema) : null;

  for (const key of keys) {
    const model = MODELS[key];
    const free = isFree(model, env);
    const skip = (/** @type {string} */ reason) => attempts.push({ model: key, modelId: model.id, provider: model.provider, outcome: 'skipped', reason });

    if (opts.deadlineMs && Date.now() - started > opts.deadlineMs) { skip('out of time for this call'); continue; }
    if (modelsTried >= limits.maxModelsPerCall) { skip(`already tried ${limits.maxModelsPerCall} models`); continue; }
    if (!providerKey(model.provider, env)) { skip(`${PROVIDERS[model.provider].keyEnv} is not set`); continue; }
    if (deadProviders.has(model.provider)) { skip(`${PROVIDERS[model.provider].name} refused this key earlier in the call`); continue; }
    if (opts.tools?.length && !model.tools) { skip('does not support tools'); continue; }

    // The paid gate, then the budget — both before any request is made.
    if (!free) {
      if (!paidAllowed(env)) { skip('paid model — ALLOW_PAID_MODELS is not "true"'); continue; }
      const budget = budgetGbp(env);
      if (!budget) { skip('paid model — MONTHLY_BUDGET_GBP is not set'); continue; }
      if (!deps.monthSpendGbp) { skip('paid model — no spend ledger to check the budget against'); continue; }
      /** @type {number} */
      let spent;
      try { spent = (await deps.monthSpendGbp()) + spentThisCallGbp; }
      catch (e) { skip(`paid model — could not read this month's spend (${e instanceof Error ? e.message : String(e)})`); continue; }
      const estimate = estimateUsd(model, opts.messages, maxTokens) * fx;
      if (opts.maxCostGbp !== undefined && estimate > opts.maxCostGbp) { skip(`estimated £${estimate.toFixed(4)} is over this call's cap of £${opts.maxCostGbp}`); continue; }
      if (spent + estimate > budget) { skip(`monthly budget: £${spent.toFixed(2)} spent of £${budget}, this call could cost £${estimate.toFixed(4)}`); continue; }
    }

    modelsTried++;
    /** @type {Message[]} */
    let messages = js ? withSchemaInstruction(opts.messages, js) : opts.messages;
    /** @type {Record<string, unknown> | undefined} */
    const responseFormat = !js ? undefined
      : model.json === 'schema' ? { type: 'json_schema', json_schema: { name: opts.schemaName || 'answer', schema: js } }
      : model.json === 'object' ? { type: 'json_object' } : undefined;

    for (let attempt = 0; attempt < limits.attemptsPerModel; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(limits.backoffMaxMs, limits.backoffBaseMs * 2 ** (attempt - 1)) * (0.5 + random() / 2);
        await sleep(delay);
      }
      const t0 = Date.now();
      /** @type {UsageRecord} */
      const rec = { purpose, model: key, modelId: model.id, servedModel: '', provider: model.provider, free, ok: false, error: '', tokensIn: 0, tokensOut: 0, costUsd: 0, costGbp: 0, latencyMs: 0, at: new Date().toISOString() };
      try {
        const c = await complete({ provider: model.provider, model: model.id, messages, tools: opts.tools, responseFormat, maxTokens, temperature: opts.temperature, timeoutMs: limits.timeoutMs, env, fetch: doFetch });
        const latencyMs = Date.now() - t0;
        const costUsd = actualUsd(model, c.usage, c.reportedCostUsd, free);
        Object.assign(rec, { servedModel: c.servedModel, tokensIn: c.usage.in, tokensOut: c.usage.out, costUsd, costGbp: costUsd * fx, latencyMs });
        spentThisCallGbp += rec.costGbp;

        /** @type {unknown} */
        let data = undefined;
        if (opts.schema && !c.toolCalls.length) {
          const got = extractJson(c.text);
          const checked = got.ok ? opts.schema.safeParse(got.value) : null;
          if (!checked?.success) {
            const why = !got.ok ? 'the answer was not JSON' : `the JSON did not match the schema (${checked?.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')})`;
            rec.error = `invalid output: ${why}`;
            await record(deps, rec);
            attempts.push({ model: key, modelId: model.id, provider: model.provider, outcome: 'failed', reason: rec.error, latencyMs });
            // Tell the model what was wrong once, then give up on it.
            messages = [...messages, { role: 'assistant', content: c.text.slice(0, 4000) }, { role: 'user', content: `That was not usable: ${why}. Reply again with only the JSON.` }];
            continue;
          }
          data = checked.data;
        } else if (!c.toolCalls.length && !c.text.trim()) {
          rec.error = 'empty answer';
          await record(deps, rec);
          attempts.push({ model: key, modelId: model.id, provider: model.provider, outcome: 'failed', reason: 'empty answer', latencyMs });
          continue;
        }

        rec.ok = true;
        await record(deps, rec);
        attempts.push({ model: key, modelId: model.id, provider: model.provider, outcome: 'ok', reason: '', latencyMs });
        return { text: c.text, data, toolCalls: c.toolCalls, model: key, modelId: model.id, servedModel: c.servedModel || model.id, provider: model.provider, free, usage: c.usage, costUsd, costGbp: costUsd * fx, latencyMs: Date.now() - started, attempts };
      } catch (e) {
        const err = e instanceof ProviderError ? e : new ProviderError(e instanceof Error ? e.message : String(e), { kind: 'network', retryable: true });
        rec.latencyMs = Date.now() - t0; rec.error = err.message;
        await record(deps, rec);
        attempts.push({ model: key, modelId: model.id, provider: model.provider, outcome: 'failed', reason: err.message, status: err.status, latencyMs: rec.latencyMs });
        // A bad key or an empty account will not get better on the next model from the same provider.
        if (err.status === 401 || err.status === 402 || err.status === 403) { deadProviders.add(model.provider); break; }
        if (!err.retryable) break;
      }
    }
  }
  const tried = attempts.filter((a) => a.outcome === 'failed').length;
  const last = [...attempts].reverse().find((a) => a.outcome === 'failed') || attempts[attempts.length - 1];
  throw new AiError(tried ? `every model failed (${tried} attempt${tried === 1 ? '' : 's'}); last: ${last?.model} — ${last?.reason}` : `no model could be called: ${attempts.map((a) => `${a.model}: ${a.reason}`).join('; ')}`, attempts);
}

/** Usage logging must never break the call it is logging. */
async function record(/** @type {RunDeps} */ deps, /** @type {UsageRecord} */ rec) {
  if (!deps.onUsage) return;
  try { await deps.onUsage(rec); } catch { /* the call's own result matters more than its log line */ }
}
