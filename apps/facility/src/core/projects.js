/**
 * MISSION CONTROL — a project's health, computed from its orders, pure.
 *
 * A project is a row in `projects`; its tasks are the orders that name it
 * (`orders.project_id`). Health is never typed: it is read from the state
 * of those orders and the deadline, and every verdict carries its reasons
 * so the room can show why rather than a colour.
 *
 *   complete   the project is done, or every order is and there is at least one
 *   blocked    the project says so, or a P0/P1 order is blocked
 *   at_risk    past due with open work; due within seven days with less than half done;
 *              an order past its own due date; spent over budget
 *   on_track   otherwise
 */
import { AGENT_BY_ID, ROOM_BY_ID } from '../../../../packages/config/src/index.js';

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Calendar days from `now` to a YYYY-MM-DD, local: today is 0, tomorrow 1, yesterday −1. */
export const daysUntil = (day, now = new Date()) => { const [y, m, d] = String(day).split('-').map(Number); const a = new Date(y, m - 1, d).getTime(); const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); return Math.round((a - b) / DAY); };
const isOpen = (o) => !['done', 'killed', 'proposed'].includes(o.state);

/** The orders that belong to a project. Accepts table rows or the store's shape. */
export function ordersOf(project, orders = []) {
  return (orders || []).filter((o) => (o.project_id ?? o.projectId) === project.id);
}

export function projectSummary(project, orders = [], { now = new Date() } = {}) {
  const today = dayOf(now);
  const mine = ordersOf(project, orders).filter((o) => o.state !== 'killed');
  const open = mine.filter(isOpen);
  const done = mine.filter((o) => o.state === 'done');
  const blocked = open.filter((o) => o.state === 'blocked');
  const overdue = open.filter((o) => o.due && o.due < today);
  const pct = mine.length ? Math.round(done.length / mine.length * 100) : null;
  const daysLeft = project.due ? daysUntil(project.due, now) : null;
  const budget = project.budget_gbp === null || project.budget_gbp === undefined ? null : Number(project.budget_gbp);
  const spent = project.spent_gbp === null || project.spent_gbp === undefined ? null : Number(project.spent_gbp);
  const estimate = open.reduce((n, o) => n + (Number(o.estimate_h ?? o.estimateH) || 0), 0);
  const actual = mine.reduce((n, o) => n + (Number(o.actual_h ?? o.actualH) || 0), 0);
  const agents = [...new Set(mine.filter((o) => o.actor === 'agent').map((o) => o.agent || ROOM_BY_ID[o.room]?.agent).filter(Boolean))].map((id) => AGENT_BY_ID[id]?.name || id);

  const reasons = [];
  let health = 'on_track';
  if (project.status === 'done' || project.status === 'dropped') { health = 'complete'; reasons.push(project.status === 'done' ? 'marked done' : 'dropped'); }
  else if (mine.length && !open.length) { health = 'complete'; reasons.push(`all ${mine.length} orders done`); }
  else if (project.status === 'blocked') { health = 'blocked'; reasons.push('marked blocked'); }
  else if (blocked.some((o) => (o.priority ?? o.p) <= 1)) { health = 'blocked'; reasons.push(`${blocked.filter((o) => (o.priority ?? o.p) <= 1).length} P0/P1 blocked: ${blocked.filter((o) => (o.priority ?? o.p) <= 1).map((o) => o.blocked_on || o.blocked || 'unspecified').join('; ')}`); }
  else {
    if (daysLeft !== null && daysLeft < 0 && open.length) reasons.push(`${-daysLeft} day${-daysLeft === 1 ? '' : 's'} past due with ${open.length} open`);
    if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && pct !== null && pct < 50) reasons.push(`due in ${daysLeft} day${daysLeft === 1 ? '' : 's'} at ${pct}%`);
    if (overdue.length) reasons.push(`${overdue.length} order${overdue.length === 1 ? '' : 's'} past due`);
    if (budget !== null && spent !== null && spent > budget) reasons.push(`£${Math.round(spent).toLocaleString('en-GB')} spent of £${Math.round(budget).toLocaleString('en-GB')}`);
    if (blocked.length) reasons.push(`${blocked.length} blocked (P2/P3)`);
    if (reasons.length) health = 'at_risk';
  }
  if (health === 'on_track') reasons.push(mine.length ? `${done.length} of ${mine.length} done${daysLeft !== null ? `, ${daysLeft} days left` : ''}` : 'no orders yet');
  return { id: project.id, health, reasons, total: mine.length, open: open.length, done: done.length, blocked: blocked.length, overdue: overdue.length, pct, daysLeft, budget, spent, estimate, actual, agents, top: open.slice().sort((a, b) => (a.priority ?? a.p) - (b.priority ?? b.p))[0] || null };
}

export function projectsSummary(projects = [], orders = [], opts = {}) {
  return (projects || []).map((p) => ({ ...p, summary: projectSummary(p, orders, opts) }));
}

export const HEALTH_TONE = { on_track: 'vital', at_risk: 'flare', blocked: 'deny', complete: 'ash' };
export const HEALTH_NAME = { on_track: 'ON TRACK', at_risk: 'AT RISK', blocked: 'BLOCKED', complete: 'COMPLETE' };
