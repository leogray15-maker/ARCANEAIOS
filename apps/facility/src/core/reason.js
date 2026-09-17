/**
 * The reasoning layer, from the browser: Counsel and the Council live in
 * two serverless functions; this assembles the context they need from the
 * brain export and the store, and sends this device's sync code so only a
 * known device can ask.
 */
import { ROOM_BY_ID } from '@arcane/config';
import { sync } from './sync.js';
import { stats } from './journal.js';
import { fmtR, fmtPct } from './journal.js';

function context(store, brain) {
  const orders = [];
  for (const r of Object.keys(store.state.orders)) for (const o of store.openOrders(r)) orders.push({ room: ROOM_BY_ID[r].name, text: o.t, priority: ['P0', 'P1', 'P2', 'P3'][o.p], holder: o.holder });
  const js = stats(store.trades());
  const extra = [
    `- revenue this month (typed): £${Math.round(store.monthlyRevenue())} · fixed £${Math.round(store.monthlyFixed())} · cash £${Math.round(store.state.budget.cash)}`,
    `- stock: ${store.totalVials()} vials · COA published ${store.coaPct()}%`,
    `- content: ${store.draftsBy('draft').length} drafts waiting · ${store.draftsBy('approved').length + store.draftsBy('scheduled').length} approved · ${store.draftsBy('posted').length} posted`,
    `- journal: ${js.n} closed trades · win rate ${fmtPct(js.winRate)} · total ${fmtR(js.totalR)} · expectancy ${fmtR(js.avgR)} · plan followed ${fmtPct(js.planRate)}`,
    `- funnel: ${store.state.funnel.visitors} visitors → ${store.state.funnel.leads} leads → ${store.state.funnel.orders} orders`,
  ].join('\n');
  return { brief: brain?.brief, doctrine: brain?.doctrine, memory: brain?.memory, orders, extra };
}

async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: sync.code, ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `${r.status}`);
  return j;
}

export const reason = {
  ask: (store, brain, question) => post('/api/counsel', { question, context: context(store, brain), history: store.counsel().slice(-8) }),
  council: (store, brain, question) => post('/api/council', { question, context: context(store, brain) }),
};
