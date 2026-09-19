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
    (() => { const m = store.money(); return `- money this month (${m.month}): revenue ${m.revenue === null ? 'not typed' : `£${Math.round(m.revenue)}`} · fixed £${Math.round(m.fixed)} · cash ${m.cash ? `£${Math.round(m.cash.cash)} (${m.cash.day})` : 'not typed'} · runway ${m.runway === null ? 'unknown' : m.runway === Infinity ? 'covered' : `${m.runway.toFixed(1)} months`}`; })(),
    `- stock: ${store.totalVials()} vials · COA published ${store.coaPct()}%`,
    `- content: ${store.draftsBy('draft').length} drafts waiting · ${store.draftsBy('approved').length + store.draftsBy('scheduled').length} approved · ${store.draftsBy('posted').length} posted`,
    `- journal: ${js.n} closed trades · win rate ${fmtPct(js.winRate)} · total ${fmtR(js.totalR)} · expectancy ${fmtR(js.avgR)} · plan followed ${fmtPct(js.planRate)}`,
    (() => { const p = store.money().ventures.find((v) => v.id === 'peptides'); const l = store.lab(); return `- peptides: ${p?.visitors ?? '—'} visitors → ${p?.leads ?? '—'} leads → ${p?.orders ?? '—'} orders this month · ${l.vials} vials in stock · COA ${l.coaPct ?? '—'}% · ${l.dispatch.packing + l.dispatch.ready} to dispatch`; })(),
    `- protocol today: ${store.protocolDone(new Date().toISOString().slice(0, 10))} of ${store.protocolItems().length}`,
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
