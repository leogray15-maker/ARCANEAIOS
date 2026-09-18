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
import { INVENTORY, BUDGET, FUNNEL, COA_STATES } from '../config/roomdata.js';
import { cloud } from './cloud.js';
import { sync } from './sync.js';
import { api } from './api.js';
import { operator } from './operator.js';
import { SEED_SETUPS } from './journal.js';

const LS_KEY = 'arcane.v3';
const LOG_MAX = 80;
const uid = () => Math.random().toString(36).slice(2, 10);
const PRIORITY = { P0: 0, P1: 1, P2: 2, P3: 3 };
/** The parts of the state that live on the server; never written into the blob. */
const SERVER_KEYS = ['orders', 'lists', 'decisions', 'counsel', 'focus', 'goalProgress', 'days'];
const OPEN_STATES = ['open', 'active', 'blocked', 'review'];
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
  const ledger = {};
  for (const v of VENTURES) ledger[v.id] = { mrr: 0, units: 0, calibrated: false };
  const goals = {};
  for (const g of brain?.goals?.length ? brain.goals : GOALS_FALLBACK) goals[g.id] = { progress: Number(String(g.progress).replace(/[^\d.]/g, '')) || 0 };
  const budget = { cash: 0, fixed: {}, split: {} };
  for (const f of BUDGET.fixed) budget.fixed[f.id] = f.amount;
  for (const sp of BUDGET.split) budget.split[sp.id] = sp.pct;
  const stock = INVENTORY.rows.map((r) => ({ id: uid(), ...r }));
  return { v: 3, updated: 0, brainBuilt: brain?.built || '', orders, ledger, goals, budget, stock, funnel: { ...FUNNEL.seed }, drafts: {}, positions: {}, log: [], lists: {}, protocol: {}, counsel: [], decisions: [], focus: {}, goalProgress: {}, days: {}, journal: { trades: [], setups: SEED_SETUPS.map((x) => ({ ...x })), checkins: [] } };
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
    s.ledger = { ...fresh.ledger, ...(saved.ledger || {}) };
    s.budget = { cash: saved.budget?.cash ?? 0, fixed: { ...fresh.budget.fixed, ...(saved.budget?.fixed || {}) }, split: { ...fresh.budget.split, ...(saved.budget?.split || {}) } };
    s.stock = saved.stock?.length ? saved.stock : fresh.stock;
    s.funnel = { ...fresh.funnel, ...(saved.funnel || {}) };
    s.drafts = saved.drafts || {};
    s.positions = saved.positions || {};
    s.log = (saved.log || []).slice(-LOG_MAX);
    s.lists = saved.lists || {};
    s.protocol = saved.protocol || {};
    s.counsel = (saved.counsel || []).slice(-40);
    s.decisions = saved.decisions || [];
    s.focus = saved.focus || {}; s.goalProgress = saved.goalProgress || {}; s.days = saved.days || {};
    // Once the server has answered, its rows are the truth for its keys; a blob or cache never overwrites them.
    if (this.server?.ready) for (const k of SERVER_KEYS) s[k] = fresh[k];
    s.journal = { trades: saved.journal?.trades || [], setups: saved.journal?.setups?.length ? saved.journal.setups : fresh.journal.setups, checkins: saved.journal?.checkins || [] };
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
    for (const o of t.orders || []) (orders[o.room] || (orders[o.room] = [])).push({ id: o.id, t: o.text, p: o.priority, state: o.state, done: ['done', 'killed'].includes(o.state), holder: o.holder, actor: o.actor, blocked: o.blocked_on, venture: o.venture, due: o.due, note: o.note, source: o.source, brain_n: o.brain_n, ts: ts(o.created_at), doneTs: ts(o.done_at) });
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
    try { await Promise.all(jobs); if (jobs.length) { this.log(`Imported ${jobs.length} items from this device into the server`, 'system'); this.applyServer(await api.state.all()); } localStorage.setItem(flag, '1'); }
    catch (e) { this.server.error = `import of this device's state failed: ${e.message}`; }
  }
  /**
   * A server write: apply locally at once, send, and if the server refuses,
   * reload and say why. `apply` mutates the state; `send` returns the API call.
   */
  async commit(apply, send, note) {
    if (!this.server.ready) { this.server.error = `${note}: not saved — ${this.server.needsKey || this.server.reason === 'no operator key' ? 'enter the operator key (DEVICE in the bar)' : this.server.reason}`; this.emit(); return null; }
    apply(); this.server.error = ''; this.emit();
    try { const r = await send(); this.save(); this.emit(); return r; }   // emit again: send() may have given the row its real id
    catch (e) { this.server.error = `${note}: ${e.message}`; await this.loadServer({ quiet: true }); this.emit(); return null; }
  }
  startServerRefresh(every = 60_000) {
    clearInterval(this.serverTimer);
    this.serverTimer = setInterval(() => { if (this.server.ready && !document.hidden) this.loadServer({ quiet: true }); }, every);
  }

  /* ---------- orders ---------- */
  orders(roomId) { return this.state.orders[roomId] || []; }
  openOrders(roomId) { return this.orders(roomId).filter((o) => !o.done).sort((a, b) => a.p - b.p); }
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
      () => { o.state = state; o.done = ['done', 'killed'].includes(state); o.blocked = state === 'blocked' ? blockedOn : ''; if (o.done) o.doneTs = Date.now(); this.log(`${o.done ? (state === 'killed' ? 'Killed' : 'Done') : state === 'open' && was ? 'Reopened' : state}: ${o.t}`, 'order'); },
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

  /* ---------- stock ---------- */
  stock() { return this.state.stock; }
  lowStock() { return this.stock().filter((r) => r.vials > 0 && r.vials < 12); }
  totalVials() { return this.stock().reduce((n, r) => n + (Number(r.vials) || 0), 0); }
  setStock(id, field, value) { const r = this.stock().find((x) => x.id === id); if (!r) return; r[field] = field === 'vials' ? Math.max(0, Number(value) || 0) : value; this.touch(); }
  adjustStock(id, delta) { const r = this.stock().find((x) => x.id === id); if (!r) return; r.vials = Math.max(0, (Number(r.vials) || 0) + delta); this.touch(); }
  cycleCoa(id) { const r = this.stock().find((x) => x.id === id); if (!r) return; r.coa = COA_STATES[(COA_STATES.indexOf(r.coa) + 1) % COA_STATES.length]; this.log(`COA ${r.code}: ${r.coa}`, 'lab'); this.touch(); }
  addStockLine(code, size, vials) { const c = String(code).trim(); if (!c) return; this.state.stock.push({ id: uid(), code: c, size: size || '—', vials: Number(vials) || 0, batch: '—', coa: 'none', tint: /ghk/i.test(c) ? 'blue' : /ss-31|nad|cerebro/i.test(c) ? 'amber' : 'clear' }); this.touch(); }
  removeStockLine(id) { this.state.stock = this.stock().filter((x) => x.id !== id); this.touch(); }
  coaPct() { const s = this.stock().filter((r) => r.vials > 0); return s.length ? Math.round(s.filter((r) => r.coa === 'published').length / s.length * 100) : 0; }

  /* ---------- money ---------- */
  ledger(ventureId) { return this.state.ledger[ventureId] || { mrr: 0, units: 0 }; }
  setLedger(ventureId, field, value) { const l = this.state.ledger[ventureId] || (this.state.ledger[ventureId] = { mrr: 0, units: 0 }); l[field] = Math.max(0, Number(value) || 0); l.calibrated = true; this.touch(); }
  ventureRevenue(v) { const l = this.ledger(v.id); return v.price ? l.units * v.price : l.mrr; }
  monthlyRevenue() { return VENTURES.reduce((n, v) => n + this.ventureRevenue(v), 0); }
  monthlyFixed() { return Object.values(this.state.budget.fixed).reduce((n, a) => n + (Number(a) || 0), 0); }
  monthlyNet() { return this.monthlyRevenue() - this.monthlyFixed(); }
  runwayMonths() { const burn = this.monthlyFixed() - this.monthlyRevenue(); const cash = Number(this.state.budget.cash) || 0; return burn <= 0 ? Infinity : cash / burn; }
  setBudget(field, id, value) { if (field === 'cash') this.state.budget.cash = Math.max(0, Number(value) || 0); else this.state.budget[field][id] = Math.max(0, Number(value) || 0); this.touch(); }
  allocations() { const rev = this.monthlyRevenue(); return BUDGET.split.map((sp) => ({ ...sp, pct: this.state.budget.split[sp.id] ?? sp.pct, amount: rev * ((this.state.budget.split[sp.id] ?? sp.pct) / 100) })); }
  splitTotal() { return Object.values(this.state.budget.split).reduce((n, p) => n + (Number(p) || 0), 0); }

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

  /* ---------- funnel ---------- */
  setFunnel(field, value) { this.state.funnel[field] = Math.max(0, Number(value) || 0); this.touch(); }

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

  /* ---------- the operator's daily protocol ---------- */
  protocolDay(day) { return this.state.protocol[day] || (this.state.protocol[day] = {}); }
  toggleProtocol(day, item) { const d = this.protocolDay(day); d[item] = !d[item]; this.touch(); }
  protocolStreak(item) { let n = 0; const d = new Date(); for (;;) { const k = d.toISOString().slice(0, 10); if (!this.state.protocol[k]?.[item]) break; n++; d.setDate(d.getDate() - 1); } return n; }

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

  /* ---------- the trading journal ---------- */
  journal() { return this.state.journal; }
  trades() { return this.state.journal.trades; }
  trade(id) { return this.trades().find((t) => t.id === id); }
  saveTrade(t) {
    const cur = t.id ? this.trade(t.id) : null;
    if (cur) Object.assign(cur, t, { updated: Date.now() });
    else if (t.id) this.trades().unshift({ ...t, created: Date.now(), updated: Date.now() });
    else { const id = `T-${(t.opened || new Date().toISOString()).slice(0, 10).replace(/-/g, '')}-${String(this.trades().length + 1).padStart(2, '0')}`; this.trades().unshift({ ...t, id, created: Date.now(), updated: Date.now() }); t.id = id; }
    this.log(`Journal: ${cur ? 'updated' : 'logged'} ${t.id}`, 'journal'); this.touch();
    return t.id;
  }
  removeTrade(id) { this.state.journal.trades = this.trades().filter((t) => t.id !== id); this.touch(); }
  setups() { return this.state.journal.setups; }
  saveSetup(s) {
    const cur = s.id ? this.setups().find((x) => x.id === s.id) : null;
    if (cur) Object.assign(cur, s); else this.setups().push({ ...s, id: s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid() });
    this.touch();
  }
  removeSetup(id) { if (id === 'unplanned') return; this.state.journal.setups = this.setups().filter((x) => x.id !== id); this.touch(); }
  checkins() { return this.state.journal.checkins; }
  addCheckin(c) { this.checkins().unshift({ ...c, id: uid(), ts: Date.now() }); this.touch(); }
  removeCheckin(id) { this.state.journal.checkins = this.checkins().filter((x) => x.id !== id); this.touch(); }
  importJournal(json) { if (!json || !Array.isArray(json.trades)) throw new Error('not a journal export'); this.state.journal = { trades: json.trades, setups: json.setups?.length ? json.setups : this.setups(), checkins: json.checkins || [] }; this.touch(); }

  /* ---------- log ---------- */
  log(text, kind = 'event') { this.state.log.push({ ts: Date.now(), text, kind }); if (this.state.log.length > LOG_MAX) this.state.log.shift(); }
  records(limit = 30) { return this.state.log.slice(-limit).reverse(); }
}
