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

const LS_KEY = 'arcane.v3';
const DOC_ID = 'leo';
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
  return { v: 3, updated: 0, brainBuilt: brain?.built || '', orders, ledger, goals, budget, stock, funnel: { ...FUNNEL.seed }, drafts: {}, positions: {}, log: [] };
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
  async loadCloud() {
    if (!cloud.enabled) return false;
    const row = await cloud.load(DOC_ID);
    if (!row) return false;
    const remote = row.body;
    if ((remote?.updated || 0) > (this.state.updated || 0)) { this.merge(remote); this.emit(); }
    this.rung = 'cloud';
    return true;
  }
  /** Bring a saved state in without losing what a newer brain export knows. */
  merge(saved) {
    if (!saved || saved.v !== 3) return;
    const fresh = this.state;
    const s = { ...fresh, ...saved };
    // Orders: the brain's list wins for what exists; local done-flags survive by text.
    if (fresh.brainBuilt && fresh.brainBuilt !== saved.brainBuilt) {
      const done = new Set(Object.values(saved.orders || {}).flat().filter((o) => o.done).map((o) => o.t));
      s.orders = {};
      for (const r of ROOMS) s.orders[r.id] = (fresh.orders[r.id] || []).map((o) => ({ ...o, done: o.done || done.has(o.t) })).concat((saved.orders?.[r.id] || []).filter((o) => !o.fromBrain));
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
    this.state = s;
  }
  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); if (this.rung === 'memory') this.rung = 'local'; } catch {}
      if (cloud.enabled) cloud.save(DOC_ID, this.state).then((ok) => { if (ok) this.rung = 'cloud'; });
    }, 250);
  }
  where() { return cloud.enabled ? (this.rung === 'cloud' ? 'Supabase' : `local (Supabase: ${cloud.lastError || 'not reached yet'})`) : `local (${cloud.reason})`; }

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

  /* ---------- log ---------- */
  log(text, kind = 'event') { this.state.log.push({ ts: Date.now(), text, kind }); if (this.state.log.length > LOG_MAX) this.state.log.shift(); }
  records(limit = 30) { return this.state.log.slice(-limit).reverse(); }
}
