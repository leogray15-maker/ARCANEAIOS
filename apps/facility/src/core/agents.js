/**
 * AGENT HQ — what each agent is doing, derived, pure.
 *
 * An agent's status is never typed. It is read from three tables: its
 * runs (`agent_runs`, by the agent's name), the orders in its hands
 * (`orders` with actor 'agent', by its id or its room), and — new in the
 * OpenJarvis pass — its budget ceiling (`agent_budgets`) and its runs'
 * heartbeats. The same function answers the roster, the per-agent
 * dashboard, the Bridge's AGENTS block and the brief, so "what is CIPHER
 * doing?" has one answer.
 *
 *   working          a run is in flight and has reported in recently
 *   stalled          a run is in flight but has gone quiet past the reap window
 *   budget_exceeded  its ceiling for today or this month is spent
 *   error            the last run failed or was refused, and nothing since has succeeded
 *   needs_approval   it has put forward orders nobody has answered
 *   blocked          an order in its hands is blocked
 *   waiting          an order in its hands is in review
 *   idle             it has an endpoint and nothing in flight
 *   offline          it has no code behind it yet — a card in the config and nothing more
 *
 * Cost is tokens, summed from the runs; the pounds depend on the model's
 * price list, which this file does not carry, so it says tokens and not
 * money — never an invented figure. Gamification is computed the same
 * way: a level from real completed runs, a streak from real days worked,
 * achievements from thresholds actually crossed. Nothing here is a point
 * awarded for its own sake.
 */
import { AGENTS, AGENT_BY_ID, ROOM_BY_ID, CAPS, MODE_OF_GRADE, STALE_RUN_MS } from '../../../../packages/config/src/index.js';

/** The agents with code behind them, and where. Everyone else is a card. */
export const AGENT_ENDPOINTS = {
  arcane:   { path: '/api/counsel', kind: 'counsel', label: 'Counsel and the Council' },
  herald:   { path: '/api/herald',  kind: 'herald',  label: 'Generate content from a module' },
  intel:    { path: '/api/intel',   kind: 'intel',   label: 'The watch, on the open web' },
  // All three readers share one function (/api/agent, chosen by an `agent`
  // field in the body) — a deliberate merge, not three routes that happen
  // to look alike: Vercel's Hobby plan caps a deployment at 12 serverless
  // functions (docs/OPENJARVIS_PORT.md), and these three were the cheapest
  // three to fold into one without losing anything.
  tally:    { path: '/api/agent', kind: 'reader', label: 'The reading of the books' },
  meridian: { path: '/api/agent', kind: 'reader', label: 'The reading of the chain' },
  vector:   { path: '/api/agent', kind: 'reader', label: 'The reading of the position' },
};

const isOpen = (o) => !['done', 'killed', 'proposed'].includes(o.state);
const pad = (n) => String(n).padStart(2, '0');
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localMonth = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** The orders an agent holds: those that name it, or agent-actor orders in its room with no agent named. */
export function ordersOfAgent(agent, orders = []) {
  return (orders || []).filter((o) => o.actor === 'agent' && ((o.agent && o.agent === agent.id) || (!o.agent && ROOM_BY_ID[o.room]?.agent === agent.id)) || (o.state === 'proposed' && o.agent === agent.id));
}

/** Today's and this month's usage against a budget's ceiling — computed from the runs, never stored twice. `null` fields mean no ceiling is set, so there is nothing to exceed. */
export function budgetUsage(mine, budget, now = new Date()) {
  const today = localDay(now), month = localMonth(now);
  const todays = mine.filter((r) => String(r.started_at || '').slice(0, 10) === today);
  const months = mine.filter((r) => String(r.started_at || '').slice(0, 7) === month);
  const tokensToday = todays.reduce((n, r) => n + (Number(r.usage?.in) || 0) + (Number(r.usage?.out) || 0), 0);
  const tokensMonth = months.reduce((n, r) => n + (Number(r.usage?.in) || 0) + (Number(r.usage?.out) || 0), 0);
  const exceeded = !!budget?.active && (
    (budget.runs_daily !== null && budget.runs_daily !== undefined && todays.length >= budget.runs_daily) ||
    (budget.tokens_daily !== null && budget.tokens_daily !== undefined && tokensToday >= budget.tokens_daily) ||
    (budget.tokens_monthly !== null && budget.tokens_monthly !== undefined && tokensMonth >= budget.tokens_monthly)
  );
  return { runsToday: todays.length, tokensToday, tokensMonth, exceeded };
}

/** Consecutive days, most recent first, with at least one 'ok' run — a habit, not a badge. */
export function streakOf(mine, now = new Date()) {
  const days = new Set(mine.filter((r) => r.status === 'ok').map((r) => String(r.started_at || '').slice(0, 10)));
  let n = 0; const d = new Date(now);
  // A streak counts through today only once today has a run; otherwise it starts counting from yesterday, so a quiet morning does not zero a real streak.
  if (!days.has(localDay(d))) d.setDate(d.getDate() - 1);
  while (days.has(localDay(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/** Thresholds actually crossed, computed from the record — never a point invented for its own sake. */
export function achievementsOf({ okRuns, streak, approvals, last20 }) {
  const defs = [
    { id: 'runs_10', name: '10 missions completed', met: okRuns >= 10 },
    { id: 'runs_50', name: '50 missions completed', met: okRuns >= 50 },
    { id: 'runs_100', name: '100 missions completed', met: okRuns >= 100 },
    { id: 'streak_7', name: '7-day streak', met: streak >= 7 },
    { id: 'streak_30', name: '30-day streak', met: streak >= 30 },
    { id: 'clean_20', name: 'zero failures in the last 20 runs', met: last20.length >= 20 && last20.every((r) => !['failed', 'refused'].includes(r.status)) },
    { id: 'trusted', name: '100% of proposals approved (5+ decided)', met: approvals.rate === 100 && (approvals.approved + approvals.rejected) >= 5 },
  ];
  return defs;
}

/** A level from real work: the square-root curve means each level costs more than the last, and it never needs a hand-maintained table of tiers. */
export function levelOf(okRuns) { return Math.min(30, Math.floor(Math.sqrt(okRuns)) + 1); }

export function agentStatus(agent, { runs = [], orders = [], budgets = [], now = Date.now() } = {}) {
  const nowD = new Date(now);
  const mine = (runs || []).filter((r) => r.agent === agent.name).slice().sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  const last = mine[0] || null;
  const inFlight = mine.find((r) => r.status === 'running') || null;
  const heartbeatAge = inFlight ? now - new Date(inFlight.heartbeat_at || inFlight.started_at).getTime() : null;
  const stalled = !!inFlight && heartbeatAge > STALE_RUN_MS;
  const running = inFlight && !stalled ? inFlight : null;
  const held = ordersOfAgent(agent, orders);
  const proposals = held.filter((o) => o.state === 'proposed');
  const queue = held.filter(isOpen).sort((a, b) => a.priority - b.priority || String(a.created_at).localeCompare(String(b.created_at)));
  const blocked = queue.filter((o) => o.state === 'blocked');
  const review = queue.filter((o) => o.state === 'review');
  const endpoint = AGENT_ENDPOINTS[agent.id] || null;
  const budget = (budgets || []).find((b) => b.agent === agent.id) || null;
  const usage = budgetUsage(mine, budget, nowD);
  let status = 'idle';
  if (running) status = 'working';
  else if (stalled) status = 'stalled';
  else if (usage.exceeded) status = 'budget_exceeded';
  else if (last && ['failed', 'refused'].includes(last.status)) status = 'error';
  else if (proposals.length) status = 'needs_approval';
  else if (blocked.length) status = 'blocked';
  else if (review.length) status = 'waiting';
  else if (!endpoint && !mine.length && !queue.length) status = 'offline';
  const by = { ok: 0, failed: 0, refused: 0, evidence: 0, running: 0 };
  let tokensIn = 0, tokensOut = 0, cached = 0;
  for (const r of mine) { by[r.status] = (by[r.status] || 0) + 1; tokensIn += Number(r.usage?.in) || 0; tokensOut += Number(r.usage?.out) || 0; cached += Number(r.usage?.cached) || 0; }
  // Proposals it made that were answered: let in (any state past proposed except killed) or refused (killed).
  const answered = (orders || []).filter((o) => o.agent === agent.id && o.source === 'agent' && o.state !== 'proposed');
  const approved = answered.filter((o) => o.state !== 'killed').length;
  const rejected = answered.length - approved;
  const approvals = { approved, rejected, rate: answered.length ? Math.round(approved / answered.length * 100) : null };
  const job = running ? { kind: 'run', id: running.id, text: running.current_activity || running.objective, since: running.started_at }
    : stalled ? { kind: 'stalled', id: inFlight.id, text: inFlight.objective, since: inFlight.heartbeat_at || inFlight.started_at }
    : queue.filter((o) => o.state === 'active')[0] ? { kind: 'order', id: queue.filter((o) => o.state === 'active')[0].id, text: queue.filter((o) => o.state === 'active')[0].text }
    : queue[0] ? { kind: 'order', id: queue[0].id, text: queue[0].text } : null;
  const streak = streakOf(mine, nowD);
  return {
    id: agent.id, name: agent.name, role: agent.role, room: agent.room, colour: agent.colour, council: !!agent.council,
    status, wired: !!endpoint, endpoint,
    job, last, running, stalled: stalled ? inFlight : null, heartbeatAge, queue, proposals, blocked, review,
    runs: mine.length, by, tokens: { in: tokensIn, out: tokensOut, cached },
    approvals,
    budget, usage,
    level: levelOf(by.ok || 0), streak, achievements: achievementsOf({ okRuns: by.ok || 0, streak, approvals, last20: mine.slice(0, 20) }),
    lastAt: last?.finished_at || last?.started_at || null,
    modes: CAPS.map((c) => ({ cap: c.id, name: c.name, grade: agent.caps[c.id] || 'deny', mode: MODE_OF_GRADE[agent.caps[c.id] || 'deny'] })),
  };
}

export function rosterStatus({ runs = [], orders = [], budgets = [], now = Date.now() } = {}) {
  const list = AGENTS.map((a) => agentStatus(a, { runs, orders, budgets, now }));
  const counts = { active: 0, waiting: 0, blocked: 0, needs_approval: 0, error: 0, stalled: 0, budget_exceeded: 0, idle: 0, offline: 0 };
  for (const s of list) { if (s.status === 'working') counts.active++; else counts[s.status] = (counts[s.status] || 0) + 1; }
  return { agents: list, counts };
}

export const STATUS_TONE = { idle: 'ash', working: 'cyan', waiting: 'flare', blocked: 'deny', needs_approval: 'arcane', error: 'deny', stalled: 'flare', budget_exceeded: 'deny', offline: 'faint' };
export const STATUS_NAME = { idle: 'IDLE', working: 'ACTIVE', waiting: 'WAITING', blocked: 'BLOCKED', needs_approval: 'NEEDS APPROVAL', error: 'ERROR', stalled: 'STALLED', budget_exceeded: 'BUDGET EXCEEDED', offline: 'OFFLINE' };
export { AGENT_BY_ID };
