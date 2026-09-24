// @ts-check
/**
 * Is each provider reachable with the key we hold? A check that costs
 * nothing: an authenticated model list where the provider has one that
 * needs a key (Gemini, Groq, xAI, DeepSeek, Nous), and for OpenRouter —
 * whose model list is public and so proves nothing about the key — a
 * one-token request to its free router. Never reports a key's value, only
 * whether it is set and whether it worked.
 */
import { PROVIDERS, providerKey, redact } from './providers.js';

/**
 * @typedef {import('./providers.js').ProviderId} ProviderId
 * @typedef {{ provider: ProviderId, name: string, keyEnv: string, optional: boolean, state: 'ok' | 'missing' | 'failing', status: number, latencyMs: number, detail: string }} ProviderHealth
 */

/**
 * @param {Record<string, string | undefined>} env @param {typeof globalThis.fetch} [f] @param {number} [timeoutMs]
 * @returns {Promise<ProviderHealth[]>}
 */
export async function pingProviders(env, f = globalThis.fetch, timeoutMs = 8_000) {
  const ids = /** @type {ProviderId[]} */ (Object.keys(PROVIDERS));
  return Promise.all(ids.map(async (id) => {
    const p = PROVIDERS[id];
    const key = providerKey(id, env);
    /** @type {ProviderHealth} */
    const out = { provider: id, name: p.name, keyEnv: p.keyEnv, optional: p.optional, state: 'missing', status: 0, latencyMs: 0, detail: `${p.keyEnv} is not set` };
    if (!key) return out;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const t0 = Date.now();
    try {
      /** @type {Response} */
      let r;
      if (id === 'openrouter') {
        r = await f(`${p.baseUrl}/chat/completions`, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(p.headers ? p.headers(env) : {}) }, body: JSON.stringify({ model: 'openrouter/free', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }) });
      } else if (id === 'gemini') {
        r = await f('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { signal: ctrl.signal, headers: { 'x-goog-api-key': key } });
      } else {
        r = await f(`${p.baseUrl}/models`, { signal: ctrl.signal, headers: { Authorization: `Bearer ${key}` } });
      }
      out.status = r.status; out.latencyMs = Date.now() - t0;
      const text = await r.text();
      if (r.ok) { out.state = 'ok'; out.detail = 'reachable, key accepted'; }
      else {
        out.state = 'failing';
        let msg = r.statusText;
        try { const j = /** @type {{ error?: { message?: unknown } | string, message?: unknown }} */ (JSON.parse(text)); const m = typeof j.error === 'object' ? j.error?.message : j.error ?? j.message; if (typeof m === 'string') msg = m; } catch { /* keep the status text */ }
        out.detail = redact(`${r.status}: ${msg}`.slice(0, 200), key);
      }
    } catch (e) {
      out.state = 'failing'; out.latencyMs = Date.now() - t0;
      out.detail = ctrl.signal.aborted ? `no answer in ${timeoutMs / 1000}s` : redact(e instanceof Error ? e.message : String(e), key);
    } finally { clearTimeout(timer); }
    return out;
  }));
}
