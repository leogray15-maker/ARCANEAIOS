/**
 * Shared memory for the facility.
 *
 * Two kinds of state, one shape the rooms read:
 *
 *   server — orders, list items (moves, stop-doing, watchlist, pipeline,
 *            ideas), Council decisions, Counsel turns, the venture focus,
 *            goal progress and the day. These live in Postgres behind
 *            /api/state (packages/database/src/state.js). The store is a
 *            cache: a change applies here at once, goes to the server, and
 *            if the server refuses it the store reloads and the bar says
 *            why. Without the operator key these cannot change.
 *   blob   — stock, ledger, budget, funnel, protocol, the journal, crew
 *            positions, the floor log: still one JSON row per device
 *            (arcane_sync) until their rooms are built on tables too.
 *
 * The brain (Obsidian) seeds what it knows — orders from 06-Orders,
 * drafts, goals, the brief — from `public/brain.json` at build time, and
 * the server rows take over once they load.
 */
import { VENTURES, ROOMS, ROOM_BY_ID, GOALS_FALLBACK } from './seeds.js';
import { ORDER_OPEN_STATES, AGENT_BY_ID } from '@arcane/config';
import { stockLines, labSummary, settingsOf, stockOf } from './lab.js';
import { moneySummary, monthOf, ventureRow, history as moneyHistory } from './money.js';
import { cloud } from './cloud.js';
import { sync } from './sync.js';
import { api } from './api.js';
import { operator } from './operator.js';

const LS_KEY = 'arcane.v3';
const LOG_MAX = 80;
const uid = () => Math.random().toString(36).slice(2, 10);
const PRIORITY = { P0: 0, P1: 1, P2: 2, P3: 3 };
/** The parts of the state that live on the server; never written into the blob. */
const SERVER_KEYS = ['orders', 'lists', 'decisions', 'counsel', 'focus', 'goalProgress', 'days', 'products', 'lots', 'dispatch', 'settings', 'ledger', 'fixedCosts', 'cash', 'pots', 'protocolItems', 'protocolTicks', 'entries', 'journal'];
const OPEN_STATES = ORDER_OPEN_STATES;   // a proposal is not open work: it is waiting to be answered
const ts = (iso) => (iso ? new Date(iso).getTime() : 0);

function seedState(brain) {
  const orders = {};
  for (const r of ROOMS) orders[r.id] = [];
  // 06-Orders rows: "Blocked on: #5" is a dependency; the row counts as blocked only while #5 is still open.
  const rows = brain?.orders?.open || [];
  const doneN = new Set([...(brain?.orders?.closed || []).map((o) => o.n), ...rows.filter((o) => /done|killed/.test(o.state)).map((o) => o.n)]);
  for (const o of rows) {
    const room = ROOMS.find((r) => r.name === o.room)?.id || 'bridge';
    const deps = [...String(o.blocked || '').matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
    const waiting = deps.filter((n) => !doneN.has(n));
    const isDone = /done|killed/.test(o.state);
    const blocked = waiting.length ? `#${waiting.join(', #')}` : deps.length ? '' : o.blocked || '';
    orders[room].push({ id: `brain-${o.n}`, brain_n: o.n, t: o.order, p: PRIORITY[o.priority] ?? 2, done: isDone, state: isDone ? 'done' : blocked ? 'blocked' : 'open', holder: o.holder, actor: o.actor, blocked, ts: 0, fromBrain: true });
  }
  const goals = {};
  for (const g of brain?.goals?.length ? brain.goals : GOALS_FALLBACK) goals[g.id] = { progress: Number(String(g.progress).replace(/[^\d.]/g, '')) || 0 };
  return { v: 3, updated: 0, brainBuilt: brain?.built || '', orders, goals, drafts: {}, positions: {}, log: [], lists: {}, counsel: [], decisions: [], focus: {}, goalProgress: {}, days: {}, products: [], lots: [], dispatch: [], settings: [], ledger: [], fixedCosts: [], cash: [], pots: [], protocolItems: [], protocolTicks: [], entries: [], journal: { trades: [], setups: [], checkins: [] } };
}

export class Store {
  constructor(brain = null) {
    this.brain = brain;
    this.state = seedState(brain);
    this.rung = 'memory';
    this.listeners = new Set();
    this.saveTimer = null;
    // The server rung: ready once /api/state has answered; `error` is the last refusal, shown in the bar.
    this.server = { ready: false, error: '', reason: operator.present ? 'loading' : 'no operator key', loading: false };
    // What the machine itself says is wrong (migrations, imports, the model).
    // From /api/health, which computes it from the tables — never from here.
    this.system = { ready: null, counts: null, at: 0, error: '', loading: false };
    // The last write the server refused, kept whole so it can be tried
    // again instead of retyped. Cleared by a success or by the operator.
    this.failed = null;
    this.loadLocal();
  }

  /* ---------- change events ---------- */
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }
  /** A line for the bar that fades after a while: what just failed, or just happened. */
  say(text, tone = 'flare') { this.notice = { text, tone, ts: Date.now() }; this.log(text, tone === 'breach' ? 'error' : 'event'); this.emit(); }
  noticeNow() { return this.notice && Date.now() - this.notice.ts < 12_000 ? this.notice : null; }
  touch() { this.state.updated = Date.now(); this.emit(); this.save(); }

  /* ---------- persistence ---------- */
  loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      this.rung = 'local';
      if (raw) this.merge(JSON.parse(raw));
    } catch { this.rung = 'memory'; }
  }
  /** Pull this sync code's row; newest state wins. On a fresh code, seed the row. */
  async loadCloud() {
    if (!cloud.ready) return false;
    const row = await cloud.load();
    if (row === null && cloud.lastError) return false;
    if (row && (row.body?.updated || 0) > (this.state.updated || 0)) { this.merge(row.body); this.emit(); }
    else if (!row) cloud.save(this.state);
    this.rung = 'cloud';
    this.cloudStamp = row?.updated || null;
    return true;
  }
  /** Every so often, ask whether another device wrote something newer. */
  startPolling(every = 30_000) {
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      if (!cloud.ready) return;
      const stamp = await cloud.stamp();
      if (stamp && stamp !== this.cloudStamp) { const row = await cloud.load(); if (row && (row.body?.updated || 0) > (this.state.updated || 0)) { this.merge(row.body); this.emit(); } this.cloudStamp = stamp; }
    }, every);
  }
  /** Bring a saved state in without losing what a newer brain export knows. */
  merge(saved) {
    if (!saved || saved.v !== 3) return;
    const fresh = this.state;
    const s = { ...fresh, ...saved };
    // Orders: the brain's list wins for what exists; local done-flags survive
    // by text, and a local order the vault has since absorbed (vault:sync
    // writes it into Orders.md) is dropped so it does not appear twice.
    if (fresh.brainBuilt && fresh.brainBuilt !== saved.brainBuilt) {
      const done = new Set(Object.values(saved.orders || {}).flat().filter((o) => o.done).map((o) => o.t));
      const absorbed = new Set(Object.values(fresh.orders).flat().map((o) => o.t));
      s.orders = {};
      for (const r of ROOMS) s.orders[r.id] = (fresh.orders[r.id] || []).map((o) => ({ ...o, done: o.done || done.has(o.t) })).concat((saved.orders?.[r.id] || []).filter((o) => !o.fromBrain && !absorbed.has(o.t)));
      s.brainBuilt = fresh.brainBuilt;
    }
    for (const r of ROOMS) if (!s.orders[r.id]) s.orders[r.id] = [];
    s.goals = { ...fresh.goals, ...(saved.goals || {}) };
    // The blob's old shapes — stock, ledger, budget, funnel, protocol — are on tables now and are left behind.
    for (const k of ['stock', 'budget', 'funnel', 'protocol']) delete s[k];
    s.drafts = saved.drafts || {};
    s.positions = saved.positions || {};
    s.log = (saved.log || []).slice(-LOG_MAX);
    // The cache of the server's tables, in the shapes the floor draws.
    s.lists = saved.lists || {}; s.counsel = (saved.counsel || []).slice(-40); s.decisions = saved.decisions || [];
    s.focus = saved.focus || {}; s.goalProgress = saved.goalProgress || {}; s.days = saved.days || {};
    s.products = saved.products || []; s.lots = saved.lots || []; s.dispatch = saved.dispatch || []; s.settings = saved.settings || [];
    s.ledger = Array.isArray(saved.ledger) ? saved.ledger : []; s.fixedCosts = saved.fixedCosts || []; s.cash = saved.cash || []; s.pots = saved.pots || [];
    s.protocolItems = saved.protocolItems || []; s.protocolTicks = saved.protocolTicks || []; s.entries = saved.entries || [];
    s.journal = { trades: saved.journal?.trades || [], setups: saved.journal?.setups || [], checkins: saved.journal?.checkins || [] };
    // Once the server has answered, its rows are the truth for its keys; a blob or cache never overwrites them.
    if (this.server?.ready) for (const k of SERVER_KEYS) s[k] = fresh[k];
    this.state = s;
  }
  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); if (this.rung === 'memory') this.rung = 'local'; } catch {}
      if (cloud.ready) { const blob = { ...this.state }; for (const k of SERVER_KEYS) delete blob[k]; cloud.save(blob).then((ok) => { if (ok) { this.rung = 'cloud'; this.cloudStamp = null; } }); }
    }, 250);
  }
  where() {
    if (!cloud.enabled) return `local (${cloud.reason})`;
    if (cloud.lastError) return `local (Supabase: ${cloud.lastError})`;
    return this.rung === 'cloud' ? 'synced' : 'syncing';
  }
  /** One line on the server rung for the bar: ready, or why not. */
  serverStatus() {
    if (this.server.error) return { tone: 'breach', text: `not saved: ${this.server.error}` };
    if (this.server.ready) return { tone: 'vital', text: 'state on the server' };
    return { tone: 'flare', text: this.server.reason === 'no operator key' ? 'state read-only — enter the operator key (DEVICE)' : this.server.reason };
  }

  /* ---------- the server rung ---------- */
  /** Pull every server table and take it as the truth for those keys. Quiet on a refresh; loud on the first load. */
  async loadServer({ quiet = false } = {}) {
    if (!operator.present) { this.server = { ready: false, error: '', reason: 'no operator key', loading: false }; this.emit(); return false; }
    if (this.server.loading) return false;
    this.server.loading = true; if (!quiet) { this.server.reason = 'loading'; }
    try {
      const t = await api.state.all();
      this.applyServer(t);
      this.server = { ready: true, error: '', reason: '', loading: false };
      await this.importLocalOnce(t);
      this.emit();
      return true;
    } catch (e) {
      this.server = { ready: false, error: '', reason: e.message, loading: false, needsKey: !!e.needsKey };
      this.emit();
      return false;
    }
  }
  /** Server rows → the shapes the floor draws. Brain-seeded orders stay until the vault sync has imported them. */
  applyServer(t) {
    const s = this.state;
    const orders = {}; for (const r of ROOMS) orders[r.id] = [];
    const imported = new Set((t.orders || []).filter((o) => o.brain_n !== null && o.brain_n !== undefined).map((o) => o.brain_n));
    for (const o of t.orders || []) (orders[o.room] || (orders[o.room] = [])).push({ id: o.id, t: o.text, p: o.priority, state: o.state, done: ['done', 'killed'].includes(o.state), proposed: o.state === 'proposed', holder: o.holder, actor: o.actor, agent: o.agent || '', blocked: o.blocked_on, venture: o.venture, due: o.due, note: o.note, source: o.source, sourceId: o.source_id || '', brain_n: o.brain_n, ts: ts(o.created_at), doneTs: ts(o.done_at) });
    for (const r of ROOMS) for (const o of s.orders[r.id] || []) if (o.fromBrain && !imported.has(o.brain_n)) orders[r.id].push(o);
    s.orders = orders;
    const lists = {};
    for (const i of t.list_items || []) (lists[i.list] || (lists[i.list] = [])).push({ id: i.id, text: i.text, tag: i.tag, venture: i.venture, position: i.position, done: i.done, outcome: i.outcome, ts: ts(i.created_at), doneTs: ts(i.done_at) });
    for (const k of Object.keys(lists)) lists[k].sort((a, b) => a.position - b.position || b.ts - a.ts);
    s.lists = lists;
    s.decisions = (t.decisions || []).map((d) => ({ id: d.id, ts: ts(d.created_at), question: d.question, verdict: d.verdict, summary: d.summary, conditions: d.conditions || [], dissent: d.dissent, positions: d.positions || [], outcome: d.outcome, reviewed: ts(d.reviewed_at), source: d.source }));
    s.counsel = (t.counsel_turns || []).map((c) => ({ id: c.id, who: c.who, text: c.text, ts: ts(c.created_at), specialist: c.specialist, order: c.proposal || null }));
    s.focus = Object.fromEntries((t.venture_focus || []).map((f) => [f.venture, { rank: f.rank, allocation: f.allocation, why: f.why, ts: ts(f.updated_at) }]));
    s.goalProgress = Object.fromEntries((t.goal_progress || []).map((g) => [g.goal_id, { value: Number(g.value), note: g.note, ts: ts(g.updated_at) }]));
    s.days = Object.fromEntries((t.days || []).map((d) => [d.day, { focus: d.focus, note: d.note, energy: d.energy, sleep: d.sleep }]));
    s.products = t.products || []; s.lots = t.stock_lots || []; s.dispatch = t.dispatch || []; s.settings = t.settings || [];
    s.ledger = t.ledger_months || []; s.fixedCosts = t.fixed_costs || []; s.cash = t.cash_snapshots || []; s.pots = t.pots || [];
    s.protocolItems = t.protocol_items || []; s.protocolTicks = t.protocol_ticks || []; s.entries = t.entries || [];
    s.journal = { trades: (t.trades || []).map(fromTradeRow), setups: t.setups || [], checkins: (t.checkins || []).map((c) => ({ ...c, ts: ts(c.created_at) })) };
    this.save();
  }
  /** The first time the server answers empty, what this device kept in its blob goes up once, so nothing typed before the tables existed is lost. */
  async importLocalOnce(t) {
    const flag = 'arcane.imported.v4';
    try { if (localStorage.getItem(flag)) return; } catch {}
    let raw = null; try { raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch {}
    const local = raw && raw.v === 3 ? raw : null;
    if (!local) { try { localStorage.setItem(flag, '1'); } catch {} return; }
    const jobs = [];
    if (!(t.orders || []).length) for (const [room, list] of Object.entries(local.orders || {})) for (const o of list) if (!o.fromBrain && ROOM_BY_ID[room]) jobs.push(api.state.insert('orders', { room, text: o.t, priority: o.p ?? 2, state: o.done ? 'done' : 'open', holder: o.holder || 'Leo', blocked_on: o.blocked || '' }));
    if (!(t.list_items || []).length) for (const [list, items] of Object.entries(local.lists || {})) for (const i of items) if (['moves', 'stop', 'watch', 'pipeline', 'ideas'].includes(list)) jobs.push(api.state.insert('list_items', { list, text: i.text, tag: i.tag || '' }));
    if (!(t.decisions || []).length) for (const d of local.decisions || []) jobs.push(api.state.insert('decisions', { question: d.question, verdict: d.verdict || 'WATCH', summary: d.summary || '', conditions: d.conditions || [], dissent: d.dissent || '', positions: d.positions || [], outcome: d.outcome || '' }));
    if (!(t.counsel_turns || []).length) for (const c of local.counsel || []) jobs.push(api.state.insert('counsel_turns', { who: c.who, text: c.text, specialist: c.specialist || '', proposal: c.order || null }));
    if (!(t.trades || []).length) for (const tr of local.journal?.trades || []) if (/^T-\d{8}-\d{2,3}$/.test(tr.id)) jobs.push(api.state.insert('trades', toTradeRow(tr)));
    try { await Promise.all(jobs); if (jobs.length) { this.log(`Imported ${jobs.length} items from this device into the server`, 'system'); this.applyServer(await api.state.all()); } localStorage.setItem(flag, '1'); }
    catch (e) { this.server.error = `import of this device's state failed: ${e.message}`; }
  }
  /**
   * A server write: apply locally at once, send, and if the server refuses,
   * reload and say why. `apply` mutates the state; `send` returns the API call.
   */
  async commit(apply, send, note) {
    if (!this.server.ready) { this.server.error = `${note}: not saved — ${this.server.needsKey || this.server.reason === 'no operator key' ? 'enter the operator key (DEVICE in the bar)' : this.server.reason}`; this.emit(); return null; }
    apply(); this.server.error = ''; this.failed = null; this.emit();
    try { const r = await send(); this.save(); this.emit(); return r; }   // emit again: send() may have given the row its real id
    catch (e) {
      this.server.error = `${note}: ${e.message}`;
      // The rollback is the reload below — it throws away the optimistic
      // change because the server is the truth. What it must not throw
      // away is what Leo meant: that is kept here, whole, so the bar can
      // offer a retry instead of asking him to type it again.
      this.failed = { note, message: e.message, at: Date.now(), apply, send, tries: (this.failed?.note === note ? this.failed.tries : 0) + 1 };
      await this.loadServer({ quiet: true });
      this.emit();
      return null;
    }
  }
  /** The refused write, while it is still worth offering back (ten minutes). */
  lastFailure() { return this.failed && Date.now() - this.failed.at < 600_000 ? this.failed : null; }
  /** Try it again, exactly as it was meant. On success the tables are re-read, because the rollback moved on without it. */
  async retry() {
    const f = this.lastFailure(); if (!f) return null;
    this.failed = null;
    const r = await this.commit(f.apply, f.send, f.note);
    if (r !== null) { this.say(`${f.note}: saved`, 'vital'); await this.loadServer({ quiet: true }); }
    return r;
  }
  /** Let it go: the change is gone, and the bar stops offering it. */
  dismissFailure() { this.failed = null; this.server.error = ''; this.emit(); }
  /**
   * Ask the machine what is wrong with it. The answer is computed
   * server-side from the tables (packages/database/src/readiness.js), so
   * the bar, THE CONTROL ROOM and a test all read the same judgement.
   */
  async loadSystem({ force = false } = {}) {
    if (!operator.present) { this.system = { ready: null, counts: null, at: Date.now(), error: 'no operator key', loading: false }; return null; }
    if (this.system.loading) return this.system.ready;
    if (!force && this.system.at && Date.now() - this.system.at < 120_000) return this.system.ready;
    this.system.loading = true;
    try { const h = await api.health(); this.system = { ready: h.ready, counts: h.counts, at: Date.now(), error: '', loading: false }; }
    catch (e) { this.system = { ready: null, counts: null, at: Date.now(), error: e.message, loading: false }; }
    this.emit();
    return this.system.ready;
  }
  /** One line for the bar: the worst thing the machine says about itself, or nothing when it is ready. */
  systemStatus() {
    const r = this.system.ready;
    if (!r) return null;
    if (r.level === 'ok') return null;
    const n = r.blocked || r.degraded;
    return { tone: r.level === 'blocked' ? 'breach' : 'flare', level: r.level, count: n, text: r.summary, blocked: r.blocked, degraded: r.degraded };
  }
  startServerRefresh(every = 60_000) {
    clearInterval(this.serverTimer);
    this.serverTimer = setInterval(() => { if (this.server.ready && !document.hidden) this.loadServer({ quiet: true }); }, every);
  }

  /* ---------- orders ---------- */
  orders(roomId) { return this.state.orders[roomId] || []; }
  /** The work in a room. A proposal is not in here until it has been approved. */
  openOrders(roomId) { return this.orders(roomId).filter((o) => !o.done && !o.proposed).sort((a, b) => a.p - b.p); }
  /** What an agent has put forward in this room and nobody has answered. */
  proposals(roomId = null) {
    const list = roomId ? this.orders(roomId).map((o) => ({ ...o, room: roomId })) : ROOMS.flatMap((r) => this.orders(r.id).map((o) => ({ ...o, room: r.id })));
    return list.filter((o) => o.proposed).sort((a, b) => a.p - b.p || b.ts - a.ts);
  }
  proposalCount() { return this.proposals().length; }
  /** Approve a proposal: it becomes work, and the event records who let it in. */
  approveProposal(roomId, id) { return this.setOrderState(roomId, id, 'open'); }
  /** Refuse one: killed, never deleted, so the record still says it was put forward. */
  rejectProposal(roomId, id) { return this.setOrderState(roomId, id, 'killed'); }
  /** The agent's name for a proposal, for a UI that has to say who. */
  agentName(id) { return AGENT_BY_ID[id]?.name || id || ''; }
  openCount(roomId) { return this.openOrders(roomId).length; }
  /** Attention: P0 weighs 8, P1 4, P2 2, P3 1. */
  attention(roomId) { return this.openOrders(roomId).reduce((n, o) => n + [8, 4, 2, 1][o.p], 0); }
  totalOpen() { return ROOMS.reduce((n, r) => n + this.openCount(r.id), 0); }
  allOpenOrders() { return ROOMS.flatMap((r) => this.openOrders(r.id).map((o) => ({ ...o, room: r.id }))); }
  addOrder(roomId, text, p = 2, extra = {}) {
    const t = String(text).trim(); if (!t || !ROOM_BY_ID[roomId]) return null;
    const actor = extra.actor || 'human';
    const local = { id: `tmp-${uid()}`, t, p, state: 'open', done: false, holder: extra.holder || (actor === 'agent' ? '' : 'Leo'), actor, blocked: '', venture: extra.venture || '', source: extra.source || 'floor', ts: Date.now() };
    return this.commit(
      () => { this.state.orders[roomId].unshift(local); this.log(`Order in ${ROOM_BY_ID[roomId].name}: ${t}`, 'order'); },
      async () => { const { row } = await api.state.insert('orders', { room: roomId, text: t, priority: p, actor, holder: local.holder || undefined, venture: local.venture, source: local.source, note: extra.note || '' }); Object.assign(local, { id: row.id, holder: row.holder, ts: ts(row.created_at) }); return local; },
      'order');
  }
  /** Move an order along its life: open · active · blocked · review · done · killed. */
  setOrderState(roomId, id, state, blockedOn = '') {
    const o = this.orders(roomId).find((x) => x.id === id); if (!o) return null;
    // A brain-seeded row is not on the server yet: moving it creates it there, with its number, so the vault can match it.
    if (o.fromBrain) return this.commit(
      () => { o.state = state; o.done = ['done', 'killed'].includes(state); o.blocked = blockedOn; this.log(`${o.done ? 'Done' : state}: ${o.t}`, 'order'); },
      async () => { const { row } = await api.state.insert('orders', { room: roomId, text: o.t, priority: o.p, state, holder: String(o.holder || 'Leo').replace(/\[\[|\]\]/g, ''), actor: o.actor === 'agent' ? 'agent' : 'human', blocked_on: blockedOn, source: 'brain', brain_n: o.brain_n }); Object.assign(o, { id: row.id, fromBrain: false, source: 'brain', ts: ts(row.created_at) }); return o; },
      'order');
    const was = o.state;
    return this.commit(
      () => { o.state = state; o.done = ['done', 'killed'].includes(state); o.proposed = state === 'proposed'; o.blocked = state === 'blocked' ? blockedOn : ''; if (o.done) o.doneTs = Date.now(); this.log(`${was === 'proposed' && state === 'open' ? 'Approved' : o.done ? (state === 'killed' ? 'Killed' : 'Done') : state === 'open' && was ? 'Reopened' : state}: ${o.t}`, 'order'); },
      () => api.state.update('orders', id, { state, blocked_on: state === 'blocked' ? blockedOn : '' }),
      'order');
  }
  toggleOrder(roomId, id) { const o = this.orders(roomId).find((x) => x.id === id); if (!o) return null; return this.setOrderState(roomId, id, o.done ? 'open' : 'done'); }
  editOrder(roomId, id, patch) {
    const o = this.orders(roomId).find((x) => x.id === id); if (!o || o.fromBrain) return null;
    return this.commit(
      () => { if (patch.priority !== undefined) o.p = Number(patch.priority); if (patch.text !== undefined) o.t = patch.text; if (patch.due !== undefined) o.due = patch.due; if (patch.note !== undefined) o.note = patch.note; if (patch.venture !== undefined) o.venture = patch.venture; if (patch.holder !== undefined) o.holder = patch.holder; },
      () => api.state.update('orders', id, patch),
      'order');
  }
  /** Orders are never deleted; this is `killed`. Kept under the old name for the boards. */
  removeOrder(roomId, id) { return this.setOrderState(roomId, id, 'killed'); }

  /* ---------- THE LAB: products, lots, dispatch, settings ---------- */
  labSettings() { return settingsOf(this.state.settings); }
  setting(key) { return this.labSettings()[key]; }
  setSetting(key, value) {
    const v = String(value).trim();
    return this.commit(() => { const cur = this.state.settings.find((r) => r.key === key); if (cur) cur.value = v; else this.state.settings.push({ key, value: v }); }, () => api.state.insert('settings', { key, value: v }), 'setting');
  }
  products() { return this.state.products; }
  product(id) { return this.state.products.find((p) => p.id === id); }
  /** One line per active product: vials, COA, cost, price, margin. What the Lab lists and VIGIL reads. */
  stock() { return stockLines(this.state.products, this.state.lots, this.labSettings()); }
  lab() { return labSummary(this.state.products, this.state.lots, this.state.settings, this.state.dispatch); }
  lowStock() { return this.stock().filter((l) => l.low); }
  totalVials() { return this.stock().reduce((n, l) => n + l.vials, 0); }
  coaPct() { return this.lab().coaPct ?? 0; }
  lots(productId) { return stockOf(productId, this.state.lots).lots; }
  setProduct(id, patch) {
    const cur = this.product(id);
    const next = { ...(cur || { id, name: patch.name || id, size: '', category: '', listed: true, sell_gbp: null, supplier_id: 'jx', supplier_code: '', supplier_section: '', kit_cost_usd: null, kit_vials: 10, active: true, note: '' }), ...patch };
    return this.commit(
      () => { const i = this.state.products.findIndex((p) => p.id === id); if (i >= 0) this.state.products[i] = next; else this.state.products.push(next); this.log(`${cur ? 'Product' : 'New product'}: ${next.name} ${next.size}`, 'lab'); },
      () => api.state.insert('products', next),
      'product');
  }
  addLot(productId, { batch = '', vials = 0, coa = 'none', coa_url = '', cost_usd = null, received = null, note = '' } = {}) {
    const local = { id: `tmp-${uid()}`, product_id: productId, batch, vials: Number(vials) || 0, coa, coa_url, cost_usd, received, note, created_at: new Date().toISOString() };
    return this.commit(
      () => { this.state.lots.unshift(local); this.log(`Stock in: ${this.product(productId)?.name || productId} × ${local.vials}`, 'lab'); },
      async () => { const { row } = await api.state.insert('stock_lots', { product_id: productId, batch, vials: local.vials, coa, coa_url, cost_usd, received, note }); Object.assign(local, row); return local; },
      'stock');
  }
  adjustLot(id, delta) {
    const l = this.state.lots.find((x) => x.id === id); if (!l) return null;
    const vials = Math.max(0, (Number(l.vials) || 0) + delta);
    return this.commit(() => { l.vials = vials; }, () => api.state.update('stock_lots', id, { vials }), 'stock');
  }
  setLot(id, patch) {
    const l = this.state.lots.find((x) => x.id === id); if (!l) return null;
    return this.commit(() => { Object.assign(l, patch); if (patch.coa) this.log(`COA ${this.product(l.product_id)?.name || l.product_id}${l.batch ? ` ${l.batch}` : ''}: ${patch.coa}`, 'lab'); }, () => api.state.update('stock_lots', id, patch), 'stock');
  }
  removeLot(id) { return this.commit(() => { this.state.lots = this.state.lots.filter((x) => x.id !== id); }, () => api.state.remove('stock_lots', id), 'stock'); }
  dispatchQueue() { return this.state.dispatch.filter((d) => ['packing', 'ready'].includes(d.stage)); }
  addDispatch(ref, items = '', note = '') {
    const local = { id: `tmp-${uid()}`, ref, items, stage: 'packing', tracking: '', note, created_at: new Date().toISOString() };
    return this.commit(
      () => { this.state.dispatch.unshift(local); this.log(`Dispatch: ${ref} packing`, 'lab'); },
      async () => { const { row } = await api.state.insert('dispatch', { ref, items, note }); Object.assign(local, row); return local; },
      'dispatch');
  }
  setDispatch(id, patch) {
    const d = this.state.dispatch.find((x) => x.id === id); if (!d) return null;
    return this.commit(() => { Object.assign(d, patch); if (patch.stage) { if (patch.stage === 'shipped') d.shipped_at = new Date().toISOString(); this.log(`Dispatch: ${d.ref} ${patch.stage}`, 'lab'); } }, () => api.state.update('dispatch', id, patch), 'dispatch');
  }

  /* ---------- THE VAULT: the ledger by month, fixed costs, cash, the pots ---------- */
  money(month = monthOf()) { return moneySummary({ ledger: this.state.ledger, fixed: this.state.fixedCosts, cash: this.state.cash, pots: this.state.pots }, month); }
  moneyHistory(n = 12) { return moneyHistory(this.state.ledger, this.state.fixedCosts, n); }
  ledgerRow(month, venture) { return ventureRow(this.state.ledger, month, venture); }
  setLedger(month, venture, patch) {
    const id = `${month}:${venture}`;
    const cur = this.ledgerRow(month, venture);
    const next = { ...(cur || { id, month, venture, revenue_gbp: null, units: null, visitors: null, leads: null, orders: null, note: '' }), ...patch };
    return this.commit(() => { const i = this.state.ledger.findIndex((r) => r.id === id); if (i >= 0) this.state.ledger[i] = next; else this.state.ledger.push(next); }, () => api.state.insert('ledger_months', next), 'ledger');
  }
  monthlyRevenue() { return this.money().revenue || 0; }
  monthlyFixed() { return this.money().fixed; }
  ventureRevenue(v) { return this.money().ventures.find((x) => x.id === v.id)?.revenue || 0; }
  setFixed(id, patch) {
    const cur = this.state.fixedCosts.find((f) => f.id === id);
    const next = { ...(cur || { id, name: patch.name || id, amount_gbp: 0, room: '', active: true, note: '' }), ...patch };
    return this.commit(() => { const i = this.state.fixedCosts.findIndex((f) => f.id === id); if (i >= 0) this.state.fixedCosts[i] = next; else this.state.fixedCosts.push(next); }, () => api.state.insert('fixed_costs', next), 'cost');
  }
  setCash(day, cash, note = '') {
    const row = { day, cash_gbp: Math.max(0, Number(cash) || 0), note };
    return this.commit(() => { const i = this.state.cash.findIndex((c) => c.day === day); if (i >= 0) this.state.cash[i] = row; else this.state.cash.push(row); }, () => api.state.insert('cash_snapshots', row), 'cash');
  }
  setPot(id, patch) {
    const cur = this.state.pots.find((p) => p.id === id); if (!cur) return null;
    const next = { ...cur, ...patch };
    return this.commit(() => { const i = this.state.pots.findIndex((p) => p.id === id); this.state.pots[i] = next; }, () => api.state.insert('pots', next), 'pot');
  }

  /* ---------- goals ---------- */
  goalList() { return this.brain?.goals?.length ? this.brain.goals : GOALS_FALLBACK; }
  goalValue(g) {
    if (g.id === 'g-coa') return this.coaPct();
    if (g.id === 'g-mrr') return this.monthlyRevenue();
    if (g.id === 'g-posts') return this.draftsBy('posted').length;
    return this.state.goalProgress[g.id]?.value ?? this.state.goals[g.id]?.progress ?? 0;
  }
  goalTarget(g) { return Number(String(g.target).replace(/[^\d.]/g, '')) || 0; }
  goalPct(g) { const t = this.goalTarget(g); return t ? Math.min(100, Math.round(this.goalValue(g) / t * 100)) : 0; }
  setGoal(id, progress) { this.state.goals[id] = { progress: Math.max(0, Number(progress) || 0) }; this.touch(); }

  /* ---------- drafts (the brain's, with local status) ---------- */
  drafts() { return (this.brain?.drafts || []).map((d) => ({ ...d, status: this.state.drafts[d.id]?.status || d.status })); }
  draftsBy(status) { return this.drafts().filter((d) => d.status === status); }
  markDraft(id, status) { this.state.drafts[id] = { status, ts: Date.now() }; this.log(`Draft ${id} → ${status}`, 'content'); this.touch(); }

  /* ---------- crew positions ---------- */
  setPosition(agentId, room) { if (this.state.positions[agentId]?.room === room) return; this.state.positions[agentId] = { room, ts: Date.now() }; this.save(); }

  /* ---------- editable lists (watchlists, pipelines, ideas, moves) ---------- */
  list(key) { return this.state.lists[key] || (this.state.lists[key] = []); }
  openItems(key) { return this.list(key).filter((i) => !i.done); }
  addItem(key, text, tag = '', extra = {}) {
    const t = String(text).trim(); if (!t) return null;
    const local = { id: `tmp-${uid()}`, text: t, tag, venture: extra.venture || '', position: extra.position ?? 0, done: false, outcome: '', ts: Date.now() };
    return this.commit(
      () => { const l = this.list(key); l.push(local); l.sort((a, b) => a.position - b.position || b.ts - a.ts); },
      async () => { const { row } = await api.state.insert('list_items', { list: key, text: t, tag, venture: local.venture, position: local.position }); Object.assign(local, { id: row.id, ts: ts(row.created_at) }); return local; },
      key);
  }
  tagItem(key, id, tag) { const it = this.list(key).find((x) => x.id === id); if (!it) return null; return this.commit(() => { it.tag = tag; }, () => api.state.update('list_items', id, { tag }), key); }
  editItem(key, id, patch) { const it = this.list(key).find((x) => x.id === id); if (!it) return null; return this.commit(() => { Object.assign(it, patch); }, () => api.state.update('list_items', id, patch), key); }
  doneItem(key, id, done = true, outcome = '') { const it = this.list(key).find((x) => x.id === id); if (!it) return null; return this.commit(() => { it.done = done; it.outcome = outcome; it.doneTs = done ? Date.now() : 0; }, () => api.state.update('list_items', id, { done, outcome }), key); }
  removeItem(key, id) { return this.commit(() => { this.state.lists[key] = this.list(key).filter((x) => x.id !== id); }, () => api.state.remove('list_items', id), key); }
  /** Reorder a list: `ids` in the new order become positions 0..n. */
  reorderList(key, ids) {
    const items = this.list(key);
    return this.commit(
      () => { ids.forEach((id, i) => { const it = items.find((x) => x.id === id); if (it) it.position = i; }); items.sort((a, b) => a.position - b.position || b.ts - a.ts); },
      () => Promise.all(ids.map((id, i) => api.state.update('list_items', id, { position: i }))),
      key);
  }

  /* ---------- the venture focus, goal progress and the day ---------- */
  focusOf(ventureId) { return this.state.focus[ventureId] || { rank: 0, allocation: 'maintain', why: '' }; }
  setFocus(ventureId, patch) {
    const cur = this.focusOf(ventureId);
    const next = { ...cur, ...patch };
    return this.commit(() => { this.state.focus[ventureId] = next; }, () => api.state.insert('venture_focus', { venture: ventureId, rank: next.rank, allocation: next.allocation, why: next.why }), 'focus');
  }
  /** Rank the ventures 1..n in the order given. */
  rankVentures(ids) {
    return this.commit(
      () => { ids.forEach((id, i) => { this.state.focus[id] = { ...this.focusOf(id), rank: i + 1 }; }); },
      () => Promise.all(ids.map((id, i) => { const f = this.focusOf(id); return api.state.insert('venture_focus', { venture: id, rank: i + 1, allocation: f.allocation, why: f.why }); })),
      'focus');
  }
  goalProgress(goalId) { return this.state.goalProgress[goalId]; }
  setGoalProgress(goalId, value, note = '') {
    const v = Math.max(0, Number(value) || 0);
    return this.commit(() => { this.state.goalProgress[goalId] = { value: v, note, ts: Date.now() }; }, () => api.state.insert('goal_progress', { goal_id: goalId, value: v, note }), 'goal');
  }
  day(day) { return this.state.days[day] || { focus: '', note: '', energy: null, sleep: null }; }
  setDay(day, patch) {
    const next = { ...this.day(day), ...patch };
    return this.commit(() => { this.state.days[day] = next; }, () => api.state.insert('days', { day, ...next }), 'day');
  }

  /* ---------- SANCTUM: the protocol, the entries ---------- */
  protocolItems() { return this.state.protocolItems.filter((i) => i.active !== false).slice().sort((a, b) => a.position - b.position); }
  /** { item_id: tick } for a day. */
  protocolDay(day) { const out = {}; for (const t of this.state.protocolTicks) if (t.day === day && t.done) out[t.item_id] = t; return out; }
  protocolDone(day) { return Object.keys(this.protocolDay(day)).length; }
  toggleProtocol(day, itemId, value = null) {
    const id = `${day}:${itemId}`;
    const cur = this.state.protocolTicks.find((t) => t.id === id);
    const done = cur ? !cur.done : true;
    const row = { id, day, item_id: itemId, done, value: value ?? cur?.value ?? null };
    return this.commit(() => { const i = this.state.protocolTicks.findIndex((t) => t.id === id); if (i >= 0) this.state.protocolTicks[i] = row; else this.state.protocolTicks.push(row); }, () => api.state.insert('protocol_ticks', row), 'protocol');
  }
  protocolStreak(itemId) { let n = 0; const d = new Date(); for (;;) { const k = localDay(d); if (!this.protocolDay(k)[itemId]) break; n++; d.setDate(d.getDate() - 1); if (n > 400) break; } return n; }
  /** Ticks of an item in the last seven days — for weekly items like training. */
  protocolWeek(itemId) { const days = []; const d = new Date(); for (let i = 0; i < 7; i++) { days.push(localDay(d)); d.setDate(d.getDate() - 1); } return days.filter((k) => this.protocolDay(k)[itemId]).length; }
  setProtocolItem(id, patch) {
    const cur = this.state.protocolItems.find((i) => i.id === id);
    const next = { ...(cur || { id, name: patch.name || id, target: 0, unit: '', cadence: 'day', active: true, position: this.state.protocolItems.length }), ...patch };
    return this.commit(() => { const i = this.state.protocolItems.findIndex((x) => x.id === id); if (i >= 0) this.state.protocolItems[i] = next; else this.state.protocolItems.push(next); }, () => api.state.insert('protocol_items', next), 'protocol');
  }
  entries(kind = '') { return this.state.entries.filter((e) => !kind || e.kind === kind).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); }
  addEntry(kind, title, body) {
    const local = { id: `tmp-${uid()}`, kind, title, body, status: 'open', private: true, created_at: new Date().toISOString() };
    return this.commit(() => { this.state.entries.unshift(local); }, async () => { const { row } = await api.state.insert('entries', { kind, title, body }); Object.assign(local, row); return local; }, 'entry');
  }
  setEntry(id, patch) { const e = this.state.entries.find((x) => x.id === id); if (!e) return null; return this.commit(() => { Object.assign(e, patch); }, () => api.state.update('entries', id, patch), 'entry'); }

  /* ---------- counsel and the council ---------- */
  counsel() { return this.state.counsel; }
  addCounsel(who, text, extra = {}) {
    const local = { id: `tmp-${uid()}`, who, text, ts: Date.now(), specialist: extra.specialist || '', order: extra.order || null };
    return this.commit(
      () => { this.state.counsel.push(local); if (this.state.counsel.length > 40) this.state.counsel.shift(); },
      async () => { const { row } = await api.state.insert('counsel_turns', { who, text, specialist: local.specialist, proposal: local.order }); local.id = row.id; return local; },
      'counsel');
  }
  clearCounsel() {
    const ids = this.state.counsel.map((c) => c.id).filter((id) => !id.startsWith('tmp-'));
    return this.commit(() => { this.state.counsel = []; }, () => Promise.all(ids.map((id) => api.state.remove('counsel_turns', id))), 'counsel');
  }
  decisions() { return this.state.decisions; }
  addDecision(d) {
    const local = { id: `tmp-${uid()}`, ts: Date.now(), outcome: '', reviewed: 0, source: d.source || 'council', ...d };
    return this.commit(
      () => { this.state.decisions.unshift(local); this.log(`Council: ${d.verdict} — ${d.question}`, 'council'); },
      async () => { const { row } = await api.state.insert('decisions', { question: d.question, verdict: d.verdict, summary: d.summary || '', conditions: d.conditions || [], dissent: d.dissent || '', positions: d.positions || [], source: local.source, usage: d.usage || {} }); local.id = row.id; local.ts = ts(row.created_at); return local; },
      'decision');
  }
  setDecisionOutcome(id, outcome) { const d = this.state.decisions.find((x) => x.id === id); if (!d) return null; return this.commit(() => { d.outcome = outcome; d.reviewed = Date.now(); }, () => api.state.update('decisions', id, { outcome }), 'decision'); }

  /* ---------- THE TRADING FLOOR: the journal on tables ---------- */
  journal() { return this.state.journal; }
  trades() { return this.state.journal.trades; }
  trade(id) { return this.trades().find((t) => t.id === id); }
  saveTrade(t) {
    const cur = t.id ? this.trade(t.id) : null;
    if (!t.id) t.id = `T-${(t.opened || new Date().toISOString()).slice(0, 10).replace(/-/g, '')}-${String(this.trades().length + 1).padStart(2, '0')}`;
    while (!cur && this.trade(t.id)) t.id = t.id.replace(/-(\d+)$/, (m, n) => `-${String(Number(n) + 1).padStart(2, '0')}`);
    const next = { ...(cur || {}), ...t, updated: Date.now(), created: cur?.created || Date.now() };
    this.commit(
      () => { if (cur) Object.assign(cur, next); else this.trades().unshift(next); this.log(`Journal: ${cur ? 'updated' : 'logged'} ${t.id}`, 'journal'); },
      () => api.state.insert('trades', toTradeRow(next)),
      'trade');
    return t.id;
  }
  removeTrade(id) { return this.commit(() => { this.state.journal.trades = this.trades().filter((t) => t.id !== id); }, () => api.state.remove('trades', id), 'trade'); }
  setups() { return this.state.journal.setups; }
  saveSetup(s) {
    const id = s.id || s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
    const cur = this.setups().find((x) => x.id === id);
    const next = { ...(cur || {}), ...s, id };
    return this.commit(() => { if (cur) Object.assign(cur, next); else this.setups().push(next); }, () => api.state.insert('setups', next), 'setup');
  }
  removeSetup(id) { if (id === 'unplanned') return null; return this.commit(() => { this.state.journal.setups = this.setups().filter((x) => x.id !== id); }, () => api.state.remove('setups', id), 'setup'); }
  checkins() { return this.state.journal.checkins; }
  addCheckin(c) {
    const local = { ...c, id: `tmp-${uid()}`, ts: Date.now() };
    return this.commit(() => { this.checkins().unshift(local); }, async () => { const { row } = await api.state.insert('checkins', { type: c.type || 'Pre-market', mood: c.mood || '', stress: c.stress || null, energy: c.energy || null, sleep: c.sleep || null, streamed: !!c.streamed, acted: !!c.acted, trigger: c.trigger || '', note: c.note || '' }); Object.assign(local, row, { ts: ts(row.created_at) }); return local; }, 'checkin');
  }
  removeCheckin(id) { return this.commit(() => { this.state.journal.checkins = this.checkins().filter((x) => x.id !== id); }, () => api.state.remove('checkins', id), 'checkin'); }
  async importJournal(json) {
    if (!json || !Array.isArray(json.trades)) throw new Error('not a journal export');
    for (const t of json.trades) if (/^T-\d{8}-\d{2,3}$/.test(t.id)) await this.saveTrade({ ...t });
    for (const s of json.setups || []) await this.saveSetup(s);
    for (const c of json.checkins || []) await this.addCheckin(c);
  }

  /* ---------- log ---------- */
  log(text, kind = 'event') { this.state.log.push({ ts: Date.now(), text, kind }); if (this.state.log.length > LOG_MAX) this.state.log.shift(); }
  records(limit = 30) { return this.state.log.slice(-limit).reverse(); }
}

/* ---------- shapes ---------- */

const localDay = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const numOr = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const isoOr = (v) => (v ? new Date(v).toISOString() : null);

/** The journal form's trade → a `trades` row. Field names differ only in case. */
export function toTradeRow(t) {
  return { id: t.id, instrument: t.instrument || 'XAUUSD', direction: t.direction === 'Short' ? 'Short' : 'Long', session: t.session || '', killzone: t.killzone || '', setup: t.setup || 'unplanned', bias: t.bias || '', grade: t.grade || '', conviction: numOr(t.conviction), entry: numOr(t.entry), stop: numOr(t.stop), target: numOr(t.target), exit: numOr(t.exit), risk: numOr(t.risk), size: numOr(t.size), opened: isoOr(t.opened), closed: isoOr(t.closed), plan_followed: !!t.planFollowed, rule_breaks: Array.isArray(t.ruleBreaks) ? t.ruleBreaks : [], emotion_before: t.emotionBefore || '', emotion_during: t.emotionDuring || '', emotion_after: t.emotionAfter || '', energy: numOr(t.energy), sleep: numOr(t.sleep), stress: numOr(t.stress), streamed: !!t.streamed, process: t.process || '', thesis: t.thesis || '', execution: t.execution || '', review: t.review || '', lesson: t.lesson || '', chart: t.chart || '', example: !!t.example };
}
/** A `trades` row → the shape journal.js computes over. Times come back as the local ISO the form uses. */
export function fromTradeRow(r) {
  const local = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  return { id: r.id, instrument: r.instrument, direction: r.direction, session: r.session, killzone: r.killzone, setup: r.setup, bias: r.bias, grade: r.grade, conviction: r.conviction ?? '', entry: r.entry ?? '', stop: r.stop ?? '', target: r.target ?? '', exit: r.exit ?? '', risk: r.risk ?? '', size: r.size ?? '', opened: local(r.opened), closed: local(r.closed), planFollowed: !!r.plan_followed, ruleBreaks: r.rule_breaks || [], emotionBefore: r.emotion_before, emotionDuring: r.emotion_during, emotionAfter: r.emotion_after, energy: r.energy ?? '', sleep: r.sleep ?? '', stress: r.stress ?? '', streamed: !!r.streamed, process: r.process, thesis: r.thesis, execution: r.execution, review: r.review, lesson: r.lesson, chart: r.chart, example: !!r.example, created: ts(r.created_at), updated: ts(r.updated_at) };
}