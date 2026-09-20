/**
 * Resilience — the error taxonomy, bounded exponential retry, loop
 * detection, and bounded checkpoints. Pure and IO-free except `withRetry`,
 * which only calls the function it is given; nothing here reaches the
 * network or the database on its own.
 *
 * `loopGuard` and the checkpoint helpers have no caller yet: ARCANE's
 * agents make one structured model call and stop (`api/_agent.js`), so
 * there is no multi-step tool loop to guard or checkpoint. They are built
 * here, tested, and documented as waiting for the Orchestrator
 * (docs/OPENJARVIS_PORT.md) rather than wired somewhere they would do
 * nothing.
 */

/**
 * Classify a failure the way `api/_lib.js`'s `modelFailure` already
 * partly does, and say what to do about it:
 *
 *   RETRYABLE  a rate limit or a transient overload — try again shortly
 *   ESCALATE   no credits, a bad key, a refusal — a human must act
 *   FATAL      a bad request — retrying it changes nothing
 *
 * `status` is an HTTP-shaped status if the caller has one (an Anthropic
 * SDK error, or one already translated by `modelFailure`); `message` is
 * matched when `status` alone cannot say (a network error has no status).
 */
export function classify(status, message = '') {
  const msg = String(message || '');
  if (status === 429 || status === 503 || /overloaded|rate limit|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(msg)) {
    return { kind: 'RETRYABLE', suggestion: 'try again shortly — the service is busy, not broken' };
  }
  if (status === 402 || status === 401 || /credit balance|not valid/i.test(msg)) {
    return { kind: 'ESCALATE', suggestion: 'a human must act — top up credits or fix the key; retrying will not help' };
  }
  if (status >= 400 && status < 500) {
    return { kind: 'FATAL', suggestion: 'the request itself is wrong — retrying it unchanged will fail the same way' };
  }
  return { kind: 'ESCALATE', suggestion: 'an unrecognised failure — a human should look at it' };
}

/**
 * Call `fn` and retry on a RETRYABLE failure only, with bounded exponential
 * backoff (`base * 2^attempt`, capped at `maxDelayMs`). `fn` receives the
 * attempt number (0-based) and must throw `{ status, message }`-shaped
 * errors for `classify` to read; anything ESCALATE or FATAL is rethrown at
 * once. `sleep` is injectable so a test never actually waits.
 */
export async function withRetry(fn, { maxAttempts = 3, baseMs = 1000, maxDelayMs = 30_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onRetry = () => {} } = {}) {
  let attempt = 0, lastErr;
  while (attempt < maxAttempts) {
    try { return await fn(attempt); }
    catch (e) {
      lastErr = e;
      const { kind, suggestion } = classify(e.status, e.message);
      if (kind !== 'RETRYABLE' || attempt === maxAttempts - 1) { e.kind = e.kind || kind; e.suggestion = e.suggestion || suggestion; throw e; }
      const delay = Math.min(maxDelayMs, baseMs * 2 ** attempt);
      onRetry({ attempt, delay, error: e });
      await sleep(delay);
      attempt++;
    }
  }
  throw lastErr;
}

/**
 * A stable fingerprint for one step of a tool loop: what was called, on
 * what, roughly. Arguments are stringified and truncated so two calls
 * that differ only in a long body still fingerprint the same way a human
 * would call "the same action".
 */
export function fingerprint(tool, args = {}) {
  const a = Object.keys(args).sort().map((k) => `${k}=${String(args[k]).slice(0, 80)}`).join('&');
  return `${tool}(${a})`;
}

/**
 * Has this loop gone in circles? Two patterns are watched over the recent
 * history (oldest first), each bounded so a long-running loop is judged
 * on its recent behaviour, not its entire life:
 *
 *   repeat    the same fingerprint `threshold` times in the last `window`
 *   ping-pong A → B → A → B, `cycles` times in a row
 *
 * Returns `{ looped: false }` or `{ looped: true, reason, pattern }`.
 */
export function loopGuard(history = [], { window = 8, threshold = 3, cycles = 3 } = {}) {
  const recent = history.slice(-window);
  const counts = {};
  for (const f of recent) counts[f] = (counts[f] || 0) + 1;
  const worst = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= threshold) return { looped: true, reason: `"${worst[0]}" repeated ${worst[1]} times in the last ${recent.length} steps`, pattern: 'repeat' };
  const tail = recent.slice(-cycles * 2);
  if (tail.length === cycles * 2) {
    const a = tail[0], b = tail[1];
    if (a !== b && tail.every((f, i) => f === (i % 2 === 0 ? a : b))) return { looped: true, reason: `alternating "${a}" ↔ "${b}" for ${cycles} cycles`, pattern: 'ping-pong' };
  }
  return { looped: false };
}

/** Bounded checkpoints: keep only the newest `max` per key (an order or a run id). Pure — the caller owns storage (a jsonb column, or a test's plain object). */
export function pushCheckpoint(list = [], checkpoint, { max = 5 } = {}) {
  const next = [...list, { at: new Date().toISOString(), ...checkpoint }];
  return next.slice(-max);
}
export function latestCheckpoint(list = []) { return list.length ? list[list.length - 1] : null; }
