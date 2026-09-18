/**
 * The reasoning layer, from the browser: Counsel and the Council live in
 * two serverless functions; this assembles the context they need from the
 * brain export and the store — the brief, the open orders, the numbers,
 * today's focus, the venture ranking and the moves — and sends it with the
 * operator key.
 */
import { ROOM_BY_ID, VENTURES } from '@arcane/config';
import { api } from './api.js';
import { stats, fmtR, fmtPct } from './journal.js';

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
    `- today's focus: ${store.day(new Date().toISOString().slice(0, 10)).focus || '(none set)'}`,
    `- venture ranking (THE WAR ROOM): ${VENTURES.map((v) => ({ v, f: store.focusOf(v.id) })).sort((a, b) => (a.f.rank || 9) - (b.f.rank || 9)).map(({ v, f }, i) => `${i + 1}. ${v.name} — ${f.allocation}${f.why ? ` (${f.why})` : ''}`).join('; ')}`,
    `- moves: ${store.openItems('moves').map((m) => `[${m.tag}] ${m.text}`).join('; ') || '(none)'}`,
    `- stop doing: ${store.openItems('stop').map((m) => m.text).join('; ') || '(none)'}`,
  ].join('\n');
  return { brief: brain?.brief, doctrine: brain?.doctrine, memory: brain?.memory, orders, extra };
}

// Through the API client: the operator key goes with it, and Claude may take a while.
const post = (path, body) => api.post(path, body, { timeout: 180_000 });

export const reason = {
  ask: (store, brain, question) => post('/api/counsel', { question, context: context(store, brain), history: store.counsel().slice(-8) }),
  council: (store, brain, question) => post('/api/council', { question, context: context(store, brain) }),
};
