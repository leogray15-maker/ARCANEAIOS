// @ts-check
/**
 * Every model THE ARCANE may call, the tiers that choose between them, and
 * the limits the router works within. This is the one file to edit to
 * change models: the router, the agents and the verify script all read it.
 *
 * Every OpenRouter id and price below was read from the live catalogue
 * (https://openrouter.ai/api/v1/models) on 2026-09-24; `npm run
 * models:verify` and the `models` workflow check them again, weekly and on
 * every push that touches this package, so a retired id fails a check
 * rather than an agent run. Prices are USD per million tokens.
 *
 * Gemini is called directly (Google AI Studio) so its free tier is used.
 * Google's model list needs a key, so those ids are checked only when
 * GEMINI_API_KEY is present (locally, or as an Actions secret). Whether a
 * direct Gemini call costs anything depends on the AI Studio project, not
 * the model: without billing enabled it is the free tier. Set
 * GEMINI_BILLING=paid if billing is on, and the router then treats every
 * Gemini model as paid, under the same gate and budget as the rest.
 */

/**
 * @typedef {import('./providers.js').ProviderId} ProviderId
 * @typedef {'schema' | 'object' | 'prompt'} JsonMode   schema: response_format json_schema; object: json_object only; prompt: the schema goes in the prompt
 * @typedef {{ key: string, provider: ProviderId, id: string, label: string, lab: string, free: boolean, price: { in: number, out: number }, context: number, tools: boolean, json: JsonMode }} ModelDef
 * @typedef {'grunt' | 'writer' | 'thinker'} Tier
 */

/** @param {string} key @param {ProviderId} provider @param {string} id @param {Partial<ModelDef> & { label: string, lab: string }} o @returns {ModelDef} */
const m = (key, provider, id, o) => ({ key, provider, id, free: false, price: { in: 0, out: 0 }, context: 128_000, tools: true, json: 'schema', ...o });

/** @type {ModelDef[]} */
export const MODEL_LIST = [
  // ---- free on OpenRouter (the :free variants; rate limited, never billed)
  m('nemotron-super-free', 'openrouter', 'nvidia/nemotron-3-super-120b-a12b:free', { label: 'Nemotron 3 Super (free)', lab: 'NVIDIA', free: true, context: 262_144 }),
  m('nemotron-ultra-free', 'openrouter', 'nvidia/nemotron-3-ultra-550b-a55b:free', { label: 'Nemotron 3 Ultra (free)', lab: 'NVIDIA', free: true, context: 1_000_000, json: 'prompt' }),
  m('nex-pro-free', 'openrouter', 'nex-agi/nex-n2.5-pro:free', { label: 'Nex N2.5 Pro (free)', lab: 'Nex AGI', free: true, context: 262_144 }),
  m('nex-mini-free', 'openrouter', 'nex-agi/nex-n2.5-mini:free', { label: 'Nex N2.5 Mini (free)', lab: 'Nex AGI', free: true, context: 262_144 }),
  m('gemma-free', 'openrouter', 'google/gemma-4-31b-it:free', { label: 'Gemma 4 31B (free)', lab: 'Google', free: true, context: 262_144, json: 'object' }),
  m('inkling-free', 'openrouter', 'thinkingmachines/inkling:free', { label: 'Inkling (free)', lab: 'Thinking Machines', free: true, context: 1_048_576, json: 'prompt' }),
  m('qwen-free', 'openrouter', 'qwen/qwen3.8-27b:free', { label: 'Qwen 3.8 27B (free)', lab: 'Qwen', free: true, context: 262_144, json: 'prompt' }),
  // OpenRouter's own free router: picks whichever free model is up. The
  // model that actually answered comes back in the response and is logged.
  m('openrouter-free', 'openrouter', 'openrouter/free', { label: 'OpenRouter free router', lab: 'OpenRouter', free: true, context: 200_000 }),

  // ---- Gemini direct (free tier unless GEMINI_BILLING=paid)
  m('gemini-flash', 'gemini', 'gemini-3.8-flash', { label: 'Gemini 3.8 Flash', lab: 'Google', free: true, price: { in: 0.75, out: 3.75 }, context: 1_048_576 }),
  m('gemini-flash-lite', 'gemini', 'gemini-3.5-flash-lite', { label: 'Gemini 3.5 Flash Lite', lab: 'Google', free: true, price: { in: 0.30, out: 2.50 }, context: 1_048_576 }),

  // ---- paid on OpenRouter (called only when ALLOW_PAID_MODELS=true, within MONTHLY_BUDGET_GBP)
  m('deepseek-flash', 'openrouter', 'deepseek/deepseek-v4.1-flash', { label: 'DeepSeek V4.1 Flash', lab: 'DeepSeek', price: { in: 0.15, out: 0.60 }, context: 1_048_576 }),
  m('deepseek-pro', 'openrouter', 'deepseek/deepseek-v4-pro', { label: 'DeepSeek V4 Pro', lab: 'DeepSeek', price: { in: 0.9396, out: 1.8792 }, context: 1_048_576 }),
  m('claude-sonnet', 'openrouter', 'anthropic/claude-sonnet-5', { label: 'Claude Sonnet 5', lab: 'Anthropic', price: { in: 2, out: 10 }, context: 1_000_000 }),
  m('claude-opus', 'openrouter', 'anthropic/claude-opus-5.5', { label: 'Claude Opus 5.5', lab: 'Anthropic', price: { in: 4, out: 20 }, context: 1_000_000 }),
  m('gpt-sol', 'openrouter', 'openai/gpt-6-sol', { label: 'GPT-6 Sol', lab: 'OpenAI', price: { in: 2, out: 10 }, context: 1_050_000 }),
  m('gpt-luna', 'openrouter', 'openai/gpt-6-luna', { label: 'GPT-6 Luna', lab: 'OpenAI', price: { in: 0.10, out: 0.50 }, context: 1_050_000 }),
  m('grok', 'openrouter', 'x-ai/grok-4.7', { label: 'Grok 4.7', lab: 'xAI', price: { in: 1.60, out: 4.80 }, context: 500_000 }),
  m('kimi', 'openrouter', 'moonshotai/kimi-k3', { label: 'Kimi K3', lab: 'Moonshot', price: { in: 3, out: 15 }, context: 1_048_576 }),
  m('qwen-flash', 'openrouter', 'qwen/qwen3.8-flash', { label: 'Qwen 3.8 Flash', lab: 'Qwen', price: { in: 0.15, out: 0.47 }, context: 1_000_000 }),
  m('llama', 'openrouter', 'meta-llama/llama-4-maverick', { label: 'Llama 4 Maverick', lab: 'Meta', price: { in: 0.1875, out: 0.6525 }, context: 1_048_576 }),
];

/** @type {Record<string, ModelDef>} */
export const MODELS = Object.fromEntries(MODEL_LIST.map((x) => [x.key, x]));

/**
 * Ordered fallback chains. The router walks a chain top to bottom and
 * skips what it may not call (a paid model with ALLOW_PAID_MODELS off, a
 * provider with no key), so a free model always comes before a paid one
 * and a chain never needs editing to switch paid models on.
 * @type {Record<Tier, string[]>}
 */
export const TIERS = {
  // Summarise, tag, classify: free only, by design — no paid entry at all.
  grunt: ['gemini-flash-lite', 'nemotron-super-free', 'nex-mini-free', 'gemma-free', 'openrouter-free'],
  // Drafts in Leo's voice: the best free writers first, paid after.
  writer: ['nex-pro-free', 'gemini-flash', 'nemotron-super-free', 'inkling-free', 'openrouter-free', 'deepseek-flash', 'claude-sonnet'],
  // Strategy and judgement: free reasoning models, paid optional.
  thinker: ['nemotron-ultra-free', 'gemini-flash', 'inkling-free', 'qwen-free', 'nex-pro-free', 'deepseek-pro', 'claude-opus'],
};

/**
 * Named models for agents that want one model in particular, each with
 * its own short chain. Grok is the model with a feel for X; Claude is for
 * long-form. They fall back to the tier named, never silently to nothing.
 * @type {Record<string, { chain: string[], note: string }>}
 */
export const NAMED = {
  grok: { chain: ['grok'], note: 'xAI Grok, for X and trends' },
  claude: { chain: ['claude-opus', 'claude-sonnet'], note: 'Claude, for long-form' },
  gpt: { chain: ['gpt-sol', 'gpt-luna'], note: 'OpenAI GPT-6' },
  deepseek: { chain: ['deepseek-pro', 'deepseek-flash'], note: 'DeepSeek V4' },
  kimi: { chain: ['kimi'], note: 'Moonshot Kimi K3' },
  gemini: { chain: ['gemini-flash', 'gemini-flash-lite'], note: 'Gemini direct, free tier' },
};

/**
 * THE COUNCIL's panel: one seat per lab, so the answers differ in more
 * than wording. Each seat is a chain — its paid model when paid models are
 * on, else a free model from a different lab — and the Council seats every
 * seat that can be filled.
 * @type {{ seat: string, chain: string[] }[]}
 */
export const COUNCIL_PANEL = [
  { seat: 'Anthropic', chain: ['claude-sonnet'] },
  { seat: 'OpenAI', chain: ['gpt-sol'] },
  { seat: 'xAI', chain: ['grok'] },
  { seat: 'Google', chain: ['gemini-flash', 'gemma-free'] },
  { seat: 'DeepSeek', chain: ['deepseek-pro'] },
  { seat: 'NVIDIA', chain: ['nemotron-ultra-free', 'nemotron-super-free'] },
  { seat: 'Thinking Machines', chain: ['inkling-free'] },
  { seat: 'Qwen', chain: ['qwen-free', 'qwen-flash'] },
];

/** How hard the router tries. Timeouts are per call; a Vercel function has 300s in all (vercel.json). */
export const LIMITS = {
  timeoutMs: 45_000,
  attemptsPerModel: 2,       // the first try and one retry, on 429 / 5xx / timeout / bad JSON
  backoffBaseMs: 800,
  backoffMaxMs: 8_000,
  maxModelsPerCall: 6,       // never walk a long chain into the function's time limit
  defaultMaxTokens: 2_000,
};

/** USD to GBP for the budget, when the database has no `fx_gbp_per_usd` setting. The same figure THE LAB seeds. */
export const DEFAULT_FX_GBP_PER_USD = 0.746;
