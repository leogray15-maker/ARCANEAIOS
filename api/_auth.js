/**
 * Who may call the API.
 *
 * The site is public; the operating system is not. Every /api route asks
 * two things: does the request carry the operator key (a secret Leo sets
 * once in the Vercel project and pastes once into each browser he uses),
 * and does it name a sync code (which device is asking, for the record).
 * The key is compared in constant time. Without ARCANE_OPERATOR_KEY set
 * on the server the API refuses everything and says why — it fails
 * closed, never open.
 *
 * The sync code on its own is not authority: anyone who opens the site
 * gets one. It is identity, written into runs and events so the record
 * says which device approved what.
 */
import { timingSafeEqual } from 'node:crypto';

export const SYNC_CODE = /^sync-[a-z2-7]{26}$/;

export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json').setHeader('Cache-Control', 'no-store').send(JSON.stringify(body));
}

function bearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1].trim() : '';
}

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/**
 * Returns { ok: true, device } or { ok: false, status, error }. Reads the
 * key from the Authorization header, the device from `?code=` or the JSON
 * body's `code`.
 */
export function operator(req, env = process.env) {
  const expected = env.ARCANE_OPERATOR_KEY || '';
  if (!expected) return { ok: false, status: 503, error: 'the API is not open: set ARCANE_OPERATOR_KEY in the Vercel project (and in .env for the dev server)' };
  if (expected.length < 16) return { ok: false, status: 503, error: 'ARCANE_OPERATOR_KEY is too short — use at least 16 characters' };
  const given = bearer(req);
  if (!given) return { ok: false, status: 401, error: 'no operator key — open ● SYNC in the bar and enter it' };
  if (!same(given, expected)) return { ok: false, status: 403, error: 'operator key rejected' };
  const code = String(req.query?.code || req.body?.code || '').trim();
  return { ok: true, device: SYNC_CODE.test(code) ? code : '' };
}

/**
 * Who may fire the scheduler. Vercel Cron sends `Authorization: Bearer
 * $CRON_SECRET` when that variable is set on the project; the operator key
 * also works, for a manual or GitHub Actions trigger. A header such as
 * `x-vercel-cron` is not proof of anything: any client can send it.
 */
export function cronAuthorized(req, env = process.env) {
  const given = bearer(req);
  if (!given) return false;
  return [env.CRON_SECRET, env.ARCANE_OPERATOR_KEY].some((k) => !!k && String(k).length >= 16 && same(given, k));
}

/** Wrap a handler: method check, operator check, JSON errors, one place. */
export function guard(methods, fn) {
  return async function handler(req, res) {
    if (!methods.includes(req.method)) return json(res, 405, { error: `use ${methods.join(' or ')}` });
    const auth = operator(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    try { return await fn(req, res, auth); }
    catch (e) {
      const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
      return json(res, status, { error: e.message || 'failed', code: e.code || '', hint: e.hint || '' });
    }
  };
}
