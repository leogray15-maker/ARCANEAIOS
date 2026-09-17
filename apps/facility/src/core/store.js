/**
 * Shared memory for the facility — ported from LEOOS v2, re-seeded from v3.
 *
 * Three rungs, best first:
 *   cloud   — Supabase, when the build had a URL and anon key and the table answers
 *   local   — localStorage
 *   memory  — when even that is blocked (private windows, cleared storage)
 *
 * The brain (Obsidian) is the durable truth; `public/brain.json` is its
 * export at build time and seeds what it knows about — orders, drafts,
 * goals, the brief. The store holds what the operator edits on the floor:
 * order state, stock lines, ledger figures, the split, draft status,
 * funnel numbers, where the crew are. Everything below is written against
 * one state shape and never learns which rung it got.
 */
import { VENTURES, ROOMS, ROOM_BY_ID, GOALS_FALLBACK } from './seeds.js';
import { INVENTORY, BUDGET, FUNNEL, COA_STATES } from '../config/roomdata.js';
import { cloud } from './cloud.js';
import { sync } from './sync.js';
import { SEED_SETUPS } from './journal.js';

const LS_KEY = 'arcane.v3';
const LOG_MAX = 80;
const uid = () => Math.random().toString(36).slice(2, 10);
const PRIORITY = { P0: 0, P1: 1, P2: 2, P3: 3 };

function seedState(brain) {
  const orders = {};
  for (const r of ROOMS) orders[r.id] = [];
  for (const o of brain?.orders?.open || []) {
    const room = ROOMS.find((r) => r.name === o.room)?.id || 'bridge';
    orders[room].push({ id: `brain-${o.n}`, t: o.order, p: PRIORITY[o.priority] ?? 2, done: /done|killed/.test(o.state), holder: o.holder, actor: o.actor, blocked: o.blocked, ts: 0, fromBrain: true });
  }
  const ledger = {};
  for (const v of VENTURES) ledger[v.id] = { mrr: 0, units: 0, calibrated: false };
  const goals = {};
  for (const g of brain?.goals?.length ? brain.goals : GOALS_FALLBACK) goals[g.id] = { progress: Number(String(g.progress).replace(/[^\d.]/g, '')) || 0 };
  const budget = { cash: 0, fixed: {}, split: {} };
  for (const f of BUDGET.fixed) budget.fixed[f.id] = f.amount;
  for (const sp of BUDGET.split) budget.split[sp.id] = sp.pct;
  const stock = INVENTORY.rows.map((r) => ({ id: uid(), ...r }));
  return { v: 3, updated: 0, brainBuilt: brain?.built || '', orders, ledger, goals, budget, stock, funnel: { ...FUNNEL.seed }, drafts: {}, positions: {}, log: [], lists: {}, protocol: {}, counsel: [], decisions: [], journal: { trades: [], setups: SEED_SETUPS.map((x) => ({ ...x })), checkins: [] } };
}

export class Store {
  constructor(brain = null) {
    this.brain = brain;
    this.state = seedState(brain);
    this.rung = 'memory';
    this.listeners = new Set();
    this.saveTimer = null;
    this.loadLocal();
  }

  /* ---------- change events ---------- */
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }
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
    s.journal = { trades: saved.journal?.trades || [], setups: saved.journal?.setups?.length ? saved.journal.setups : fresh.journal.setups, checkins: saved.journal?.checkins || [] };
    this.state = s;
  }
  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); if (this.rung === 'memory') this.rung = 'local'; } catch {}
      if (cloud.ready) cloud.save(this.state).then((ok) => { if (ok) { this.rung = 'cloud'; this.cloudStamp = null; } });
    }, 250);
  }
  where() {
    if (!cloud.enabled) return `local (${cloud.reason})`;
    if (cloud.lastError) return `local (Supabase: ${cloud.lastError})`;
    return this.rung === 'cloud' ? 'synced' : 'syncing';
  }

  /* ---------- orders ---------- */
  orders(roomId) { return this.state.orders[roomId] || []; }
  openOrders(roomId) { return this.orders(roomId).filter((o) => !o.done).sort((a, b) => a.p - b.p); }
  openCount(roomId) { return this.openOrders(roomId).length; }
  /** Attention: P0 weighs 8, P1 4, P2 2, P3 1. */
  attention(roomId) { return this.openOrders(roomId).reduce((n, o) => n + [8, 4, 2, 1][o.p], 0); }
  totalOpen() { return ROOMS.reduce((n, r) => n + this.openCount(r.id), 0); }
  addOrder(roomId, text, p = 2) {
    const t = String(text).trim(); if (!t) return null;
    const o = { id: uid(), t, p, done: false, holder: ROOM_BY_ID[roomId]?.agent ? undefined : 'Leo', ts: Date.now() };
    this.state.orders[roomId].unshift(o);
    this.log(`Order in ${ROOM_BY_ID[roomId].name}: ${t}`, 'order'); this.touch();
    return o;
  }
  toggleOrder(roomId, id) {
    const o = this.orders(roomId).find((x) => x.id === id); if (!o) return;
    o.done = !o.done; o.ts = Date.now();
    this.log(`${o.done ? 'Done' : 'Reopened'}: ${o.t}`, 'order'); this.touch();
  }
  removeOrder(roomId, id) { this.state.orders[roomId] = this.orders(roomId).filter((x) => x.id !== id); this.touch(); }

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
    return this.state.goals[g.id]?.progress || 0;
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
  addItem(key, text, tag = '') { const t = String(text).trim(); if (!t) return; this.list(key).unshift({ id: uid(), text: t, tag, ts: Date.now() }); this.touch(); }
  tagItem(key, id, tag) { const it = this.list(key).find((x) => x.id === id); if (it) { it.tag = tag; this.touch(); } }
  removeItem(key, id) { this.state.lists[key] = this.list(key).filter((x) => x.id !== id); this.touch(); }

  /* ---------- the operator's daily protocol ---------- */
  protocolDay(day) { return this.state.protocol[day] || (this.state.protocol[day] = {}); }
  toggleProtocol(day, item) { const d = this.protocolDay(day); d[item] = !d[item]; this.touch(); }
  protocolStreak(item) { let n = 0; const d = new Date(); for (;;) { const k = d.toISOString().slice(0, 10); if (!this.state.protocol[k]?.[item]) break; n++; d.setDate(d.getDate() - 1); } return n; }

  /* ---------- counsel and the council ---------- */
  counsel() { return this.state.counsel; }
  addCounsel(who, text, extra = {}) { this.state.counsel.push({ who, text, ts: Date.now(), ...extra }); if (this.state.counsel.length > 40) this.state.counsel.shift(); this.touch(); }
  clearCounsel() { this.state.counsel = []; this.touch(); }
  decisions() { return this.state.decisions; }
  addDecision(d) { const id = `DEC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(this.state.decisions.length + 1).padStart(3, '0')}`; this.state.decisions.unshift({ id, ts: Date.now(), outcome: '', ...d }); this.log(`Council: ${d.verdict} — ${d.question}`, 'council'); this.touch(); return id; }
  setDecisionOutcome(id, outcome) { const d = this.state.decisions.find((x) => x.id === id); if (d) { d.outcome = outcome; d.reviewed = Date.now(); this.touch(); } }

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
