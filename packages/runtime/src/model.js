/**
 * The model, whichever one is doing the thinking.
 *
 * Every caller in the repo already speaks one shape: Anthropic's
 * `client.messages.create({ model, system, messages, max_tokens,
 * output_config: { format: { type: 'json_schema', schema } } })`, reading
 * back `{ stop_reason, content: [{ type: 'text', text }], usage }`. Rather
 * than rewrite five call sites and their tests around a new interface,
 * the local provider speaks that same shape: `modelClient()` hands back
 * either the Anthropic SDK or an Ollama client that translates the request
 * to Ollama's `/api/chat` and the answer back. A caller cannot tell which
 * it has, and the stand-in clients the tests inject keep working.
 *
 * Which one is chosen:
 *   ARCANE_PROVIDER=ollama     the local model, free (OLLAMA_URL, default http://127.0.0.1:11434)
 *   ARCANE_PROVIDER=anthropic  Claude, paid per token (ANTHROPIC_API_KEY)
 *   unset                      Anthropic when its key is set, otherwise Ollama when OLLAMA_URL is set, otherwise none
 *
 * ARCANE_MODEL names the model for whichever provider is chosen; a
 * Claude model name handed to Ollama is replaced with the local default,
 * so a caller that passes MODEL never sends Ollama a name it cannot load.
 *
 * What a local model cannot do is said, not faked: Anthropic's server
 * tools (web search) do not exist on Ollama, and a request that needs one
 * fails with a sentence saying so. Free research goes through the
 * worker's own tools instead (packages/runtime/src/tools.js).
 */
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULTS = { anthropic: 'claude-opus-5', ollama: 'qwen3:14b' };
const OLLAMA_URL = 'http://127.0.0.1:11434';

/** The provider in use, from the environment, or '' when nothing is wired. */
export function providerName(env = process.env) {
  const p = String(env.ARCANE_PROVIDER || '').toLowerCase();
  if (p === 'anthropic' || p === 'ollama') return p;
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.OLLAMA_URL) return 'ollama';
  return '';
}

/** The model name a run should record and a request should carry. */
export function modelName(env = process.env, provider = providerName(env)) {
  const asked = env.ARCANE_MODEL || '';
  if (provider === 'ollama') return asked && !/^claude/i.test(asked) ? asked : DEFAULTS.ollama;
  return asked || DEFAULTS.anthropic;
}

/** A client for the provider in use, or null when none is wired (callers already say so in a sentence). */
export function modelClient(env = process.env, { fetchImpl = globalThis.fetch } = {}) {
  const provider = providerName(env);
  if (provider === 'anthropic') return env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
  if (provider === 'ollama') return ollamaClient({ url: env.OLLAMA_URL || OLLAMA_URL, model: modelName(env, 'ollama'), numCtx: Number(env.OLLAMA_NUM_CTX) || 16384, fetchImpl });
  return null;
}

/** What to tell the operator when no provider is wired. */
export function notWired() {
  return 'the reasoning layer is not wired: set ARCANE_PROVIDER=ollama (free, on this machine) or ANTHROPIC_API_KEY';
}

/* ---------------------------------------------------------------- Ollama */

const textOf = (content) => typeof content === 'string' ? content
  : (content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n\n');

/** An error that carries a status the callers' failure handling already reads. */
function failure(message, status) { const e = new Error(message); e.status = status; return e; }

/**
 * An Anthropic-shaped client over Ollama's chat endpoint. When the request
 * asks for a JSON schema, Ollama is given the schema as its `format` (it
 * constrains the output to it) and the answer is checked against it here
 * too; a small local model that still drops a required field gets up to
 * two more attempts, told what it missed, before the call fails.
 */
export function ollamaClient({ url = OLLAMA_URL, model = DEFAULTS.ollama, numCtx = 16384, fetchImpl = globalThis.fetch, attempts = 3 } = {}) {
  const base = url.replace(/\/+$/, '');
  async function chat(body) {
    let r;
    try {
      r = await fetchImpl(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
      throw failure(`Ollama is not answering at ${base} — start it (ollama serve) and pull the model (ollama pull ${body.model})`, 503);
    }
    const text = await r.text();
    if (!r.ok) {
      if (r.status === 404 && /model/i.test(text)) throw failure(`Ollama does not have ${body.model} — run: ollama pull ${body.model}`, 503);
      throw failure(`Ollama error ${r.status}: ${text.slice(0, 300)}`, r.status >= 500 ? 503 : 502);
    }
    return JSON.parse(text);
  }

  return {
    provider: 'ollama',
    model,
    messages: {
      async create(req = {}) {
        if ((req.tools || []).some((t) => /^web_search/.test(t.type || ''))) {
          throw failure('web search runs on the Anthropic provider only; on the free path, research goes through the worker (npm run worker)', 501);
        }
        const name = req.model && !/^claude/i.test(req.model) ? req.model : model;
        const schema = req.output_config?.format?.type === 'json_schema' ? req.output_config.format.schema : null;
        const messages = [];
        const system = textOf(req.system);
        if (system || schema) messages.push({ role: 'system', content: [system, schema ? 'Answer with one JSON object that matches the schema you were given, and nothing else.' : ''].filter(Boolean).join('\n\n') });
        for (const m of req.messages || []) messages.push({ role: m.role, content: textOf(m.content) });

        let usage = { input_tokens: 0, output_tokens: 0 };
        for (let i = 0; i < attempts; i++) {
          const out = await chat({ model: name, messages, stream: false, format: schema || undefined, options: { num_ctx: numCtx, num_predict: req.max_tokens || undefined }, think: false });
          usage = { input_tokens: usage.input_tokens + (out.prompt_eval_count || 0), output_tokens: usage.output_tokens + (out.eval_count || 0) };
          const text = String(out.message?.content || '').trim();
          const stop = out.done_reason === 'length' ? 'max_tokens' : 'end_turn';
          if (!schema) return { stop_reason: stop, content: [{ type: 'text', text }], usage, model: name };
          let parsed; let problem = '';
          try { parsed = JSON.parse(text); problem = conforms(schema, parsed); } catch { problem = 'the answer was not valid JSON'; }
          if (!problem) return { stop_reason: stop, content: [{ type: 'text', text: JSON.stringify(parsed) }], usage, model: name };
          messages.push({ role: 'assistant', content: text.slice(0, 4000) }, { role: 'user', content: `That does not match the schema: ${problem}. Return the whole object again, corrected.` });
        }
        throw failure(`the local model (${name}) could not produce an answer in the required shape after ${attempts} attempts — try a larger model (ARCANE_MODEL)`, 502);
      },
    },
  };
}

/**
 * Does `value` match `schema`? Returns '' when it does, or the first
 * problem as a sentence. Covers what the repo's schemas use — type
 * (including a list of types), required, properties, items, enum,
 * maxItems — and nothing it does not.
 */
export function conforms(schema, value, where = 'the answer') {
  if (!schema || typeof schema !== 'object') return '';
  const types = [].concat(schema.type || []);
  if (types.length) {
    const kind = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
    const fits = types.some((t) => t === kind || (t === 'number' && kind === 'integer'));
    if (!fits) return `${where} should be ${types.join(' or ')}, not ${kind}`;
  }
  if (schema.enum && !schema.enum.includes(value)) return `${where} should be one of ${schema.enum.join(', ')}`;
  if (Array.isArray(value)) {
    if (schema.maxItems != null && value.length > schema.maxItems) return `${where} has more than ${schema.maxItems} items`;
    for (const [i, v] of value.entries()) { const p = conforms(schema.items, v, `${where}[${i}]`); if (p) return p; }
  } else if (value && typeof value === 'object') {
    for (const k of schema.required || []) if (!(k in value)) return `${where} is missing "${k}"`;
    for (const [k, s] of Object.entries(schema.properties || {})) if (k in value) { const p = conforms(s, value[k], `${where}.${k}`); if (p) return p; }
  }
  return '';
}
