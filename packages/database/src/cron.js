/**
 * Five-field cron, enough for standing missions and no more: minute,
 * hour, day of month, month, day of week; `*`, lists, ranges and steps
 * (`*\/15`, `1-5`, `9,17`). Read in the worker's local time, because the
 * operator means "nine in the morning" where he is. No dependency: the
 * whole grammar is the few lines below.
 */
const FIELDS = [
  { name: 'minute', lo: 0, hi: 59 },
  { name: 'hour', lo: 0, hi: 23 },
  { name: 'day', lo: 1, hi: 31 },
  { name: 'month', lo: 1, hi: 12 },
  { name: 'weekday', lo: 0, hi: 7 },
];

function field(text, { name, lo, hi }) {
  const set = new Set();
  for (const part of text.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`cron ${name}: "${part}" is not a value, range or step`);
    const step = m[2] ? Number(m[2]) : 1;
    if (step < 1) throw new Error(`cron ${name}: a step must be at least 1`);
    let [a, b] = m[1] === '*' ? [lo, hi] : m[1].split('-').map(Number);
    if (b === undefined) b = m[2] ? hi : a;
    if (a < lo || b > hi || a > b) throw new Error(`cron ${name}: ${part} is outside ${lo}–${hi}`);
    for (let v = a; v <= b; v += step) set.add(name === 'weekday' && v === 7 ? 0 : v);
  }
  return set;
}

/** Parse a cron, or throw a sentence saying what is wrong with it. */
export function parseCron(expr) {
  const parts = String(expr || '').trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('a schedule is five fields: minute hour day month weekday (e.g. "0 9 * * 1" for Mondays at nine)');
  const [minute, hour, day, month, weekday] = parts.map((p, i) => field(p, FIELDS[i]));
  // Cron's own rule: when both day fields are restricted, either may match.
  return { minute, hour, day, month, weekday, dayAny: parts[2] === '*', weekdayAny: parts[4] === '*' };
}

/** The first minute strictly after `from` that the cron matches. */
export function nextRun(expr, from = new Date()) {
  const c = typeof expr === 'string' ? parseCron(expr) : expr;
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  // A year of minutes is the bound: a cron that never matches (30 February) says so instead of spinning.
  for (let i = 0; i < 366 * 24 * 60; i++) {
    const dayOk = c.dayAny && c.weekdayAny ? true
      : c.dayAny ? c.weekday.has(d.getDay())
      : c.weekdayAny ? c.day.has(d.getDate())
      : c.day.has(d.getDate()) || c.weekday.has(d.getDay());
    if (c.month.has(d.getMonth() + 1) && dayOk && c.hour.has(d.getHours()) && c.minute.has(d.getMinutes())) return d;
    if (!c.month.has(d.getMonth() + 1) || !dayOk) { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); continue; }
    if (!c.hour.has(d.getHours())) { d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); continue; }
    d.setMinutes(d.getMinutes() + 1);
  }
  throw new Error(`the schedule "${expr}" never falls due`);
}
