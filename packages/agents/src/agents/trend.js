// @ts-check
/**
 * TREND SCOUT — BEACON, owned by HERALD. Stubbed, and switched off in code.
 *
 * Its job is to read what is moving on X and hand BEACON angles worth
 * writing. Grok is the model for it, but a model on its own knows only its
 * training data: to see X *now* it needs a live search of X, and that is a
 * provider-side tool, not something a prompt can supply.
 *
 *   - Grok through OpenRouter (x-ai/grok-4.7, verified in the catalogue) is
 *     a plain chat model there; the catalogue lists no X-search capability.
 *   - xAI's own API is where X search lives, but its request shape could not
 *     be verified from here (docs.x.ai is outside this build's network), so
 *     it is not wired on a guess.
 *
 * To switch it on: set XAI_API_KEY, confirm the X-search request against
 * docs.x.ai, add it as a tool in tools.js (read-only, zod in and out, like
 * the Notion tools), list it in `tools` below and remove `disabled`.
 */
/** @type {import('../registry.js').AgentDef} */
export const trendScout = {
  id: 'trend-scout', name: 'TREND SCOUT', room: 'beacon', owner: 'herald',
  description: 'Reads what is moving on X and hands BEACON angles worth writing. Needs a live X search, which is not wired yet.',
  model: 'grok', fallbackTier: 'thinker', schedule: '0 7 * * *', budgetGbpPerRun: 0.05, maxSteps: 4, maxDurationMs: 120_000,
  tools: ['outputs.save'], outputType: 'trend', runPrefix: 'TRD-R',
  instructions: 'Name three to five conversations moving on X today that fit Leo\'s lanes (mindset, philosophy, sales, dark psychology). For each: what is being said, the contrarian angle Leo could take, and why now. Never trading tips, never health claims.',
  disabled: 'Trend Scout is stubbed: it needs a live X search (xAI\'s API with XAI_API_KEY) wired as a read-only tool. Grok through OpenRouter has no view of X. See packages/agents/src/agents/trend.js.',
};
