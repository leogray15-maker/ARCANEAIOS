// @ts-check
/**
 * The providers, all spoken to through the same OpenAI-compatible chat
 * completions shape. OpenRouter is the gateway for most models; Gemini is
 * called directly so its free tier is used rather than paid through a
 * gateway; Groq, xAI and DeepSeek are optional and switch on when their
 * key is present. Nothing here decides which model to use or whether it
 * may be paid for — that is the router's job (`router.js`).
 */
import { z } from 'zod';

/**
 * @typedef {'openrouter' | 'gemini' | 'groq' | 'xai' | 'deepseek'} ProviderId
 * @typedef {{ id: ProviderId, name: string, baseUrl: string, keyEnv: string, optional: boolean, headers?: (env: Record<string, string | undefined>) => Record<string, string> }} Provider
 */

/** @type {Record<ProviderId, Provider>} */
export const PROVIDERS = {
  openrouter: {
    id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY', optional: false,
    // OpenRouter attributes traffic by these two headers; neither is secret.
    headers: (env) => ({ 'HTTP-Referer': env.ARCANE_SITE_URL || 'https://arcaneaios.vercel.app', 'X-Title': 'THE ARCANE' }),
  },
  gemini: { id: 'gemini', name: 'Gemini (Google AI Studio)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyEnv: 'GEMINI_API_KEY', optional: false },
  groq: { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', keyEnv: 'GROQ_API_KEY', optional: true },
  xai: { id: 'xai', name: 'xAI', baseUrl: 'https://api.x.ai/v1', keyEnv: 'XAI_API_KEY', optional: true },
  deepseek: { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', keyEnv: 'DEEPSEEK_API_KEY', optional: true },
};

/** @param {ProviderId} id @param {Record<string, string | undefined>} env */
export function providerKey(id, env) { return env[PROVIDERS[id].keyEnv] || ''; }

/**
 * A failure from a provider, carrying what the router needs to decide:
 * the HTTP status (0 for a network failure or timeout) and whether it is
 * worth trying the same model again.
 */
export class ProviderError extends Error {
  /** @param {string} message @param {{ status?: number, kind?: 'timeout' | 'network' | 'http' | 'malformed', retryable?: boolean, body?: string }} [o] */
  constructor(message, { status = 0, kind = 'http', retryable = false, body = '' } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status; this.kind = kind; this.retryable = retryable; this.body = body;
  }
}

/** 429 and 5xx are the provider being busy or broken for a moment; 408 is a timeout by another name. */
export const isRetryableStatus = (/** @type {number} */ s) => s === 408 || s === 429 || s >= 500;

/**
 * @typedef {{ role: 'system' | 'user' | 'assistant' | 'tool', content: string | null, tool_calls?: ToolCall[], tool_call_id?: string, name?: string }} Message
 * @typedef {{ id: string, type: 'function', function: { name: string, arguments: string } }} ToolCall
 * @typedef {{ type: 'function', function: { name: string, description: string, parameters: Record<string, unknown> } }} ToolSpec
 * @typedef {{ text: string, toolCalls: ToolCall[], usage: { in: number, out: number }, reportedCostUsd: number | null, servedModel: string, finishReason: string }} Completion
 */

/**
 * One chat completion. Throws ProviderError on anything but a well-formed
 * answer. `fetch` and the clock are injected so tests never touch the
 * network.
 *
 * @param {{ provider: ProviderId, model: string, messages: Message[], tools?: ToolSpec[], responseFormat?: Record<string, unknown>, maxTokens?: number, temperature?: number, timeoutMs: number, env: Record<string, string | undefined>, fetch: typeof globalThis.fetch }} req
 * @returns {Promise<Completion>}
 */
export async function complete(req) {
  const p = PROVIDERS[req.provider];
  const key = providerKey(req.provider, req.env);
  if (!key) throw new ProviderError(`${p.keyEnv} is not set`, { status: 401, kind: 'http' });
  /** @type {Record<string, unknown>} */
  const body = { model: req.model, messages: req.messages };
  if (req.maxTokens) body.max_tokens = req.maxTokens;
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.tools?.length) body.tools = req.tools;
  if (req.responseFormat) body.response_format = req.responseFormat;
  // OpenRouter reports the real charge per call when asked; the router
  // prefers it to its own estimate from list prices.
  if (req.provider === 'openrouter') body.usage = { include: true };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs);
  /** @type {Response} */
  let r;
  try {
    r = await req.fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(p.headers ? p.headers(req.env) : {}) },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    const aborted = ctrl.signal.aborted;
    throw new ProviderError(aborted ? `timed out after ${req.timeoutMs}ms` : `network: ${e instanceof Error ? e.message : String(e)}`, { kind: aborted ? 'timeout' : 'network', retryable: true });
  } finally { clearTimeout(timer); }

  const text = await r.text();
  if (!r.ok) {
    // Error bodies can echo the request; keep a short, key-free excerpt.
    throw new ProviderError(`${p.name} ${r.status}: ${redact(errorMessage(text) || r.statusText, key)}`, { status: r.status, kind: 'http', retryable: isRetryableStatus(r.status), body: redact(text.slice(0, 300), key) });
  }
  return parseCompletion(text);
}

/** Strip anything key-shaped, and the key itself, from text that is about to be logged. @param {string} text @param {string} key */
export function redact(text, key) {
  let out = text.replace(/\b(sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|gsk_[A-Za-z0-9]{8,}|xai-[A-Za-z0-9]{8,})/g, '[redacted]');
  if (key && key.length >= 8) out = out.split(key).join('[redacted]');
  return out;
}

/** @param {string} text */
function errorMessage(text) {
  try {
    const j = JSON.parse(text);
    const m = j?.error?.message ?? j?.message ?? '';
    return typeof m === 'string' ? m.slice(0, 200) : '';
  } catch { return ''; }
}

/**
 * The chat-completions answer, checked field by field: a 200 with a body
 * that is not a completion is malformed output, and the router falls back
 * on it the same as on a 5xx.
 * @param {string} text
 * @returns {Completion}
 */
export function parseCompletion(text) {
  /** @type {unknown} */
  let j;
  try { j = JSON.parse(text); } catch { throw new ProviderError('malformed response: not JSON', { kind: 'malformed', retryable: true }); }
  const parsed = CompletionSchema.safeParse(j);
  if (!parsed.success) throw new ProviderError(`malformed response: ${parsed.error.issues[0]?.message || 'unexpected shape'}`, { kind: 'malformed', retryable: true });
  const c = parsed.data;
  // Some providers return 200 with an error object and no choices.
  if (c.error) throw new ProviderError(`provider error: ${c.error.message || 'unknown'}`, { status: Number(c.error.code) || 502, kind: 'http', retryable: true });
  const choice = c.choices?.[0];
  if (!choice) throw new ProviderError('malformed response: no choices', { kind: 'malformed', retryable: true });
  const content = choice.message?.content;
  const textOut = typeof content === 'string' ? content : Array.isArray(content) ? content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : '';
  return {
    text: textOut,
    toolCalls: (choice.message?.tool_calls || []).map((t, i) => ({ id: t.id || `call_${i}`, type: 'function', function: { name: t.function.name, arguments: t.function.arguments || '{}' } })),
    usage: { in: c.usage?.prompt_tokens || 0, out: c.usage?.completion_tokens || 0 },
    reportedCostUsd: typeof c.usage?.cost === 'number' ? c.usage.cost : null,
    servedModel: c.model || '',
    finishReason: choice.finish_reason || '',
  };
}

const CompletionSchema = z.object({
  model: z.string().optional(),
  error: z.object({ message: z.string().optional(), code: z.union([z.string(), z.number()]).optional() }).optional(),
  choices: z.array(z.object({
    finish_reason: z.string().nullable().optional(),
    message: z.object({
      content: z.union([z.string(), z.null(), z.array(z.object({ text: z.string().optional() }).loose())]).optional(),
      tool_calls: z.array(z.object({ id: z.string().optional(), function: z.object({ name: z.string(), arguments: z.string().optional() }) }).loose()).nullable().optional(),
    }).loose().optional(),
  }).loose()).optional(),
  usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional(), cost: z.number().optional() }).loose().nullable().optional(),
}).loose();
