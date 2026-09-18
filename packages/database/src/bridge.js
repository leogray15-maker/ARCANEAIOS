/**
 * The Bridge's picture, assembled once, server-side.
 *
 * Nothing here is stored: it is the same tables the rooms write, read in
 * one pass and arranged the way the Commander needs them — what matters
 * today, what is waiting on Leo, what is active, and each venture in one
 * line. `api/bridge.js` serves it to the floor; `tools/brief.mjs` writes
 * the brief from it. One function, two readers, no second copy.
 */
import { ROOMS, ROOM_BY_ID, VENTURES, AGENT_BY_ID } from '../../config/src/index.js';
import { drafts, runs, events } from './content.js';
import { state } from './state.js';

const DAY = 86400000;
const OPEN = ['open', 'active', 'blocked', 'review'];

export async function aggregate(db, { now = new Date() } = {}) {
  const t = now.getTime();
  const day = localDay(now);
  const [orders, items, decisions, counsel, focus, goals, days] = await Promise.all([
    state.list(db, 'orders'), state.list(db, 'list_items'), state.list(db, 'decisions', { limit: 50 }), state.list(db, 'counsel_turns', { limit: 40 }),
    state.list(db, 'venture_focus'), state.list(db, 'goal_progress'), state.list(db, 'days', { limit: 14 }),
  ]);
  let draftCounts = null, recentRuns = [], recentEvents = [];
  try { draftCounts = await drafts.counts(db); } catch {}
  try { recentRuns = await runs.list(db, { limit: 20 }); } catch {}
  try { recentEvents = await events.list(db, { limit: 25 }); } catch {}

  const open = orders.filter((o) => OPEN.includes(o.state));
  const age = (o) => Math.floor((t - new Date(o.created_at).getTime()) / DAY);
  const withAge = (o) => ({ ...o, age_days: age(o), room_name: ROOM_BY_ID[o.room]?.name || o.room, holder_name: o.actor === 'agent' ? (AGENT_BY_ID[ROOM_BY_ID[o.room]?.agent]?.name || o.holder) : o.holder });
  const byRoom = {};
  for (const o of open) byRoom[o.room] = (byRoom[o.room] || 0) + 1;
  const rooms = ROOMS.filter((r) => byRoom[r.id]).map((r) => { const list = open.filter((o) => o.room === r.id).sort((a, b) => a.priority - b.priority); return { room: r.id, name: r.name, open: list.length, top: withAge(list[0]), blocked: list.filter((o) => o.state === 'blocked').length }; }).sort((a, b) => b.open - a.open);

  const moves = items.filter((i) => i.list === 'moves' && !i.done).sort((a, b) => a.position - b.position || new Date(a.created_at) - new Date(b.created_at));
  const stop = items.filter((i) => i.list === 'stop' && !i.done);
  const awaiting = decisions.filter((d) => !d.outcome && ['BUILD', 'DELAY'].includes(d.verdict));

  const today = days.find((d) => d.day === day) || { day, focus: '', note: '' };
  const ventures = VENTURES.map((v) => {
    const f = focus.find((x) => x.venture === v.id) || { rank: 0, allocation: 'maintain', why: '' };
    const roomsOf = ROOMS.filter((r) => r.venture === v.id).map((r) => r.id);
    const vOrders = open.filter((o) => o.venture === v.id || roomsOf.includes(o.room));
    return { id: v.id, name: v.name, room: v.room, rank: f.rank, allocation: f.allocation, why: f.why, open: vOrders.length, p0: vOrders.filter((o) => o.priority === 0).length, blocked: vOrders.filter((o) => o.state === 'blocked').length, top: vOrders.length ? withAge(vOrders.sort((a, b) => a.priority - b.priority)[0]) : null, moves: moves.filter((m) => m.venture === v.id).length };
  }).sort((a, b) => (a.rank || 9) - (b.rank || 9));

  return {
    at: now.toISOString(), day: today,
    today: {
      focus: today.focus,
      orders: open.filter((o) => o.priority <= 1 && o.state !== 'blocked').sort((a, b) => a.priority - b.priority || new Date(a.created_at) - new Date(b.created_at)).map(withAge),
      moves: moves.filter((m) => m.tag === 'now'),
      due: open.filter((o) => o.due && o.due <= day).map(withAge),
    },
    waiting: {
      drafts: draftCounts ? (draftCounts.draft || 0) + (draftCounts.review || 0) : null,
      approved: draftCounts ? (draftCounts.approved || 0) : null,
      blocked: open.filter((o) => o.state === 'blocked').map(withAge),
      review: open.filter((o) => o.state === 'review').map(withAge),
      decisions: awaiting.map((d) => ({ id: d.id, question: d.question, verdict: d.verdict, age_days: Math.floor((t - new Date(d.created_at).getTime()) / DAY), conditions: d.conditions })),
      stale: open.filter((o) => o.priority === 0 && age(o) > 2).map(withAge),
    },
    active: {
      running: recentRuns.filter((r) => r.status === 'running'),
      runs: recentRuns.filter((r) => t - new Date(r.started_at).getTime() < 2 * DAY).slice(0, 10),
      rooms,
      open: open.length,
      by_room: byRoom,
    },
    ventures,
    moves: { now: moves.filter((m) => m.tag === 'now'), next: moves.filter((m) => m.tag === 'next'), other: moves.filter((m) => !['now', 'next'].includes(m.tag)), stop },
    decisions: decisions.slice(0, 8),
    goals: goals,
    counsel: counsel.slice(-16),
    drafts: draftCounts,
    events: recentEvents,
  };
}

export function localDay(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
