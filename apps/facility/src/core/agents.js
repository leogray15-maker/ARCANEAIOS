/**
 * AGENT HQ — what each agent is doing, derived, pure.
 *
 * An agent's status is never typed. It is read from two tables: its runs
 * (`agent_runs`, by the agent's name) and the orders in its hands
 * (`orders` with actor 'agent', by its id or its room). The same function
 * answers the roster, the per-agent dashboard, the Bridge's AGENTS block
 * and the brief, so "what is CIPHER doing?" has one answer.
 *
 *   working         a run is in flight
 *   error           the last run failed or was refused, and nothing since has succeeded
 *   needs_approval  it has put forward orders nobody has answered
 *   blocked         an order in its hands is blocked
 *   waiting         an order in its hands is in review
 *   idle            it has an endpoint and nothing in flight
 *   offline         it has no code behind it yet — a card in the config and nothing more
 *
 * Cost is tokens, summed from the runs; the pounds depend on the model's
 * price list, which this file does not carry, so it says tokens and not
 * money. Performance is what the record can prove: runs by outcome, and
 * how many of its proposals the operator let in.
 */
import { AGENTS, AGENT_BY_ID, ROOM_BY_ID, CAPS, MODE_OF_GRADE } from '../../../../packages/config/src/index.js';

/** The agents with code behind them, and where. Everyone else is a card. */
export const AGENT_ENDPOINTS = {
  arcane:   { path: '/api/counsel',  kind: 'counsel',  label: 'Counsel and the Council' },
  herald:   { path: '/api/herald',   kind: 'herald',   label: 'Generate content from a module' },
  intel:    { path: '/api/intel',    kind: 'intel',    label: 'The watch, on the open web' },
  tally:    { path: '/api/tally',    kind: 'reader',   label: 'The reading of the books' },
  meridian: { path: '/api/meridian', kind: 'reader',   label: 'The reading of the chain' },
  vector:   { path: '/api/vector',   kind: 'reader',   label: 'The reading of the position' },
};

const MIN = 60000;
const isOpen = (o) => !['done', 'killed', 'proposed'].includes(o.state);

/** The orders an agent holds: those that name it, or agent-actor orders in its room with no agent named. */
export function ordersOfAgent(agent, orders = []) {
  return (orders || []).filter((o) => o.actor === 'agent' && ((o.agent && o.agent === agent.id) || (!o.agent && ROOM_BY_ID[o.room]?.agent === agent.id)) || (o.state === 'proposed' && o.agent === agent.id));
}

export function agentStatus(agent, { runs = [], orders = [], now = Date.now() } = {}) {
  const mine = (runs || []).filter((r) => r.agent === agent.name).slice().sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  const last = mine[0] || null;
  const running = mine.find((r) => r.status === 'running' && now - new Date(r.started_at).getTime() < 15 * MIN) || null;
  const held = ordersOfAgent(agent, orders);
  const proposals = held.filter((o) => o.state === 'proposed');
  const queue = held.filter(isOpen).sort((a, b) => a.priority - b.priority || String(a.created_at).localeCompare(String(b.created_at)));
  const blocked = queue.filter((o) => o.state === 'blocked');
  const review = queue.filter((o) => o.state === 'review');
  const endpoint = AGENT_ENDPOINTS[agent.id] || null;
  let status = 'idle';
  if (running) status = 'working';
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
  const job = running ? { kind: 'run', id: running.id, text: running.objective, since: running.started_at } : queue.filter((o) => o.state === 'active')[0] ? { kind: 'order', id: queue.filter((o) => o.state === 'active')[0].id, text: queue.filter((o) => o.state === 'active')[0].text } : queue[0] ? { kind: 'order', id: queue[0].id, text: queue[0].text } : null;
  return {
    id: agent.id, name: agent.name, role: agent.role, room: agent.room, colour: agent.colour, council: !!agent.council,
    status, wired: !!endpoint, endpoint,
    job, last, running, queue, proposals, blocked, review,
    runs: mine.length, by, tokens: { in: tokensIn, out: tokensOut, cached },
    approvals: { approved, rejected, rate: answered.length ? Math.round(approved / answered.length * 100) : null },
    lastAt: last?.finished_at || last?.started_at || null,
    modes: CAPS.map((c) => ({ cap: c.id, name: c.name, grade: agent.caps[c.id] || 'deny', mode: MODE_OF_GRADE[agent.caps[c.id] || 'deny'] })),
  };
}

export function rosterStatus({ runs = [], orders = [], now = Date.now() } = {}) {
  const list = AGENTS.map((a) => agentStatus(a, { runs, orders, now }));
  const counts = { active: 0, waiting: 0, blocked: 0, needs_approval: 0, error: 0, idle: 0, offline: 0 };
  for (const s of list) { if (s.status === 'working') counts.active++; else counts[s.status] = (counts[s.status] || 0) + 1; }
  return { agents: list, counts };
}

export const STATUS_TONE = { idle: 'ash', working: 'cyan', waiting: 'flare', blocked: 'deny', needs_approval: 'arcane', error: 'deny', offline: 'faint' };
export const STATUS_NAME = { idle: 'IDLE', working: 'WORKING', waiting: 'WAITING', blocked: 'BLOCKED', needs_approval: 'NEEDS APPROVAL', error: 'ERROR', offline: 'OFFLINE' };
export { AGENT_BY_ID };
