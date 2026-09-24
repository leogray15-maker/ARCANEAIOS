// @ts-check
/**
 * Five-field cron (minute hour day-of-month month day-of-week), UTC, and
 * the one question the scheduler asks: has a tick of this schedule passed
 * since the agent last ran? Vercel's Hobby plan wakes /api/tick once a
 * day, so "due" means "a tick fell in the window since the last run", not
 * "the tick is this minute".
 */

/** @param {string} field @param {number} lo @param {number} hi @returns {Set<number> | null} */
function parseField(field, lo, hi) {
  /** @type {Set<number>} */
  const out = new Set();
  for (const part of field.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part.trim());
    if (!m) return null;
    const step = m[4] ? Number(m[4]) : 1;
    const from = m[1] === '*' ? lo : Number(m[2]);
    const to = m[1] === '*' ? hi : m[3] !== undefined ? Number(m[3]) : (m[4] ? hi : from);
    if (!(step > 0) || from < lo || to > hi || from > to) return null;
    for (let v = from; v <= to; v += step) out.add(v);
  }
  return out;
}

/** @typedef {{ minute: Set<number>, hour: Set<number>, dom: Set<number>, month: Set<number>, dow: Set<number>, domAny: boolean, dowAny: boolean }} Cron */

/** @param {string} expr @returns {Cron | null} */
export function parseCron(expr) {
  const f = String(expr || '').trim().split(/\s+/);
  if (f.length !== 5) return null;
  const minute = parseField(f[0], 0, 59), hour = parseField(f[1], 0, 23), dom = parseField(f[2], 1, 31), month = parseField(f[3], 1, 12), dow = parseField(f[4].replace(/\b7\b/g, '0'), 0, 6);
  if (!minute || !hour || !dom || !month || !dow) return null;
  return { minute, hour, dom, month, dow, domAny: f[2] === '*', dowAny: f[4] === '*' };
}

/** @param {Cron} c @param {Date} d */
export function matches(c, d) {
  if (!c.minute.has(d.getUTCMinutes()) || !c.hour.has(d.getUTCHours()) || !c.month.has(d.getUTCMonth() + 1)) return false;
  const domOk = c.dom.has(d.getUTCDate()), dowOk = c.dow.has(d.getUTCDay());
  // Standard cron: when both day fields are restricted, either may match.
  if (c.domAny || c.dowAny) return domOk && dowOk;
  return domOk || dowOk;
}

/**
 * Did a tick fall after `since` and at or before `now`? Looks back at most
 * `windowMs` (default 26 hours: a daily wake plus slack), minute by minute.
 * @param {string} expr @param {string | null} since @param {Date} [now] @param {number} [windowMs]
 */
export function isDue(expr, since, now = new Date(), windowMs = 26 * 3_600_000) {
  const c = parseCron(expr);
  if (!c) return false;
  const floor = Math.max(since ? new Date(since).getTime() : 0, now.getTime() - windowMs);
  const t = new Date(now); t.setUTCSeconds(0, 0);
  for (let ms = t.getTime(); ms > floor; ms -= 60_000) if (matches(c, new Date(ms))) return true;
  return false;
}
