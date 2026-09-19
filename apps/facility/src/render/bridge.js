/**
 * BRIDGE — the command centre. Five questions, answered from the same
 * tables every room writes, never from a copy:
 *
 *   TODAY     what matters — the day's focus line, P0/P1 orders across the floor, moves tagged now, anything due
 *   WAITING   what needs Leo — drafts waiting, blocked and review orders, Council verdicts with no outcome, stale P0s
 *   ACTIVE    what is moving — agent runs, rooms with open work
 *   SIGNALS   what changed — VIGIL, computed from the state
 *   VENTURES  each in one line — rank and allocation from THE WAR ROOM, open orders, the top one
 *
 * plus doctrine, goals with progress, Counsel. Orders, moves, decisions,
 * focus, goals and the day come from the store (server-backed); drafts,
 * runs and events from /api/bridge. Every row links to its room.
 */
import { VENTURES, ROOMS, ROOM_BY_ID, AGENT_BY_ID } from '@arcane/config';
import { api } from '../core/api.js';
import { signals } from '../core/vigil.js';
import { reason } from '../core/reason.js';
import { esc, chip, when, stampFull, num, failed, handleKeyForm, STATUS_TONE } from './ui.js';
import { DOCTRINE_FALLBACK } from '../config/roomdata.js';

const PRIO = ['P0', 'P1', 'P2', 'P3'];
const PRIO_TONE = ['deny', 'flare', 'arcane', 'ash'];
const STATE_TONE = { open: 'ash', active: 'cyan', blocked: 'deny', review: 'flare', done: 'vital', killed: 'deny' };
const ALLOC_TONE = { push: 'vital', maintain: 'ash', starve: 'deny' };
const VERDICT_TONE = { BUILD: 'vital', DELAY: 'flare', WATCH: 'cyan', KILL: 'deny' };
const DAY = 86400000;

const st = { extra: null, extraError: null, loadedAt: 0, busy: '' };
let el = null, go = null, store = null, brain = null, onCounts = null;

export function bindBridge(view, ctx) {
  el = view; go = ctx.go; store = ctx.store; brain = ctx.brain; onCounts = ctx.onCounts;
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('change', onChange);
  el.addEventListener('keydown', (e) => { if (e.target.id === 'day-focus' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  el.addEventListener('focusout', (e) => { if (e.target.id === 'day-focus') { const v = e.target.value; setTimeout(() => saveFocus(v), 0); } });
}

export function renderBridge(view, ctx, hash = '#bridge', { keepScroll = false } = {}) {
  el = view;
  if (!st.extra && !st.extraError || Date.now() - st.loadedAt > 60_000) loadExtra();
  paint({ keepScroll });
}

async function loadExtra() {
  st.loadedAt = Date.now();
  try { st.extra = await api.bridge(); st.extraError = null; if (st.extra.drafts) onCounts?.(st.extra.drafts); }
  catch (e) { st.extraError = e; }
  paint({ keepScroll: true });
}

/* ---------- paint ---------- */
const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const ageOf = (ts) => (ts ? Math.floor((Date.now() - ts) / DAY) : null);
const holderOf = (o, room) => o.holder || (o.actor === 'agent' ? AGENT_BY_ID[ROOM_BY_ID[room]?.agent]?.name : '') || '';

function orderRow(o, { showRoom = true } = {}) {
  const age = ageOf(o.ts);
  return `<div class="order-row ${o.state === 'blocked' ? 'blocked' : ''}" data-id="${esc(o.id)}" data-room="${esc(o.room)}">
    <input type="checkbox" data-act="order-done" data-room="${esc(o.room)}" data-id="${esc(o.id)}" ${o.done ? 'checked' : ''} title="done">
    ${chip(PRIO[o.p], PRIO_TONE[o.p])}
    <span class="text">${esc(o.t)}</span>
    ${showRoom ? `<a class="room" href="#room/${esc(o.room)}">${esc(ROOM_BY_ID[o.room]?.name || o.room)}</a>` : ''}
    ${o.state && o.state !== 'open' ? chip(o.state, STATE_TONE[o.state]) : ''}
    ${o.blocked ? `<span class="flare">blocked: ${esc(o.blocked)}</span>` : ''}
    ${holderOf(o, o.room) ? `<span class="faint">${esc(holderOf(o, o.room))}</span>` : ''}
    ${o.due ? `<span class="${o.due <= today() ? 'breach' : 'faint'}">due ${esc(o.due)}</span>` : ''}
    <span class="faint nowrap">${age === null ? (o.fromBrain ? 'from the vault' : '') : age === 0 ? 'today' : `${age}d`}</span>
    <span class="row-acts">${o.state !== 'blocked' ? `<button class="tiny ghost" data-act="order-block" data-room="${esc(o.room)}" data-id="${esc(o.id)}">block</button>` : `<button class="tiny ghost" data-act="order-unblock" data-room="${esc(o.room)}" data-id="${esc(o.id)}">unblock</button>`}<button class="tiny ghost" data-act="order-kill" data-room="${esc(o.room)}" data-id="${esc(o.id)}" title="kill">×</button></span>
  </div>`;
}

function paint({ keepScroll = false } = {}) {
  if (!el || !store) return;
  const scroll = keepScroll ? el.scrollTop : 0;
  const focusEl = el.querySelector('#day-focus'); const focusDraft = focusEl && document.activeElement === focusEl ? focusEl.value : null;
  const x = st.extra;
  const day = today();
  const d = store.day(day);
  const open = store.allOpenOrders();
  const p01 = open.filter((o) => o.p <= 1 && o.state !== 'blocked').sort((a, b) => a.p - b.p || a.ts - b.ts);
  const due = open.filter((o) => o.due && o.due <= day);
  const blocked = open.filter((o) => o.state === 'blocked');
  const review = open.filter((o) => o.state === 'review');
  const stale = open.filter((o) => o.p === 0 && ageOf(o.ts) !== null && ageOf(o.ts) > 2);
  const moves = store.openItems('moves');
  const now = moves.filter((m) => m.tag === 'now');
  const awaiting = store.decisions().filter((x) => !x.outcome && ['BUILD', 'DELAY'].includes(x.verdict));
  const sig = signals(store.state, brain);
  const byRoom = {}; for (const o of open) byRoom[o.room] = (byRoom[o.room] || 0) + 1;
  const rooms = ROOMS.filter((r) => byRoom[r.id]).map((r) => ({ r, n: byRoom[r.id], top: open.filter((o) => o.room === r.id).sort((a, b) => a.p - b.p)[0] })).sort((a, b) => b.n - a.n);
  const waitingCount = (x?.drafts ? (x.drafts.draft || 0) + (x.drafts.review || 0) : 0) + blocked.length + review.length + awaiting.length;
  const sv = store.serverStatus();

  el.innerHTML = `<div class="wrap app bridge">
    <div class="view-head">
      <button class="back ghost" data-act="back">← Floor</button>
      <h1>BRIDGE</h1>
      <span class="sub">${esc(day)} · brief <b>${esc(brain?.brief?.date || '—')}</b> · <b>${open.length}</b> open · <b>${waitingCount}</b> waiting on you · <b>${sig.length}</b> signal${sig.length === 1 ? '' : 's'}</span>
      <span class="spacer"></span>
      <span class="${sv.tone}" title="${esc(sv.text)}">● ${esc(sv.tone === 'vital' ? 'state on the server' : sv.text)}</span>
    </div>
    ${sv.tone === 'breach' ? `<p class="flash breach">${esc(sv.text)}</p>` : ''}
    ${store.server.needsKey || (!store.server.ready && store.server.reason === 'no operator key') ? failed({ needsKey: true, status: 401 }) : ''}
    <div class="bridge-grid">
      <div class="bridge-main">
        <section>
          <h2>Today</h2>
          <input id="day-focus" class="focus-line" placeholder="What matters today — one line. Enter to keep it." value="${esc(focusDraft ?? d.focus)}" autocomplete="off" ${store.server.ready ? '' : 'disabled'}>
          ${due.length ? `<h3 class="breach">Due</h3>${due.map((o) => orderRow(o)).join('')}` : ''}
          ${now.length ? `<h3>Now <span class="faint">from THE WAR ROOM</span></h3>${now.map((m) => `<div class="order-row"><input type="checkbox" data-act="move-done" data-id="${esc(m.id)}" title="done">${chip('now', 'vital')}<span class="text">${esc(m.text)}</span>${m.venture ? chip(m.venture) : ''}<a class="room" href="#warroom">THE WAR ROOM</a></div>`).join('')}` : ''}
          <h3>P0 · P1 <span class="faint">${p01.length}</span></h3>
          ${p01.length ? p01.map((o) => orderRow(o)).join('') : '<p class="empty">Nothing at P0 or P1. Either the floor is clear or the priorities are wrong.</p>'}
          <form class="inline add-order" data-act="order-add">
            <select name="room">${ROOMS.map((r) => `<option value="${r.id}" ${r.id === 'bridge' ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
            <input name="text" placeholder="A new order, routed to a room" style="flex:1;min-width:220px" autocomplete="off">
            <select name="p"><option value="0">P0</option><option value="1" selected>P1</option><option value="2">P2</option><option value="3">P3</option></select>
            <select name="actor"><option value="human">Leo</option><option value="agent">the room's agent</option></select>
            <button type="submit">Add</button>
          </form>
        </section>

        <section>
          <h2>Waiting on you <span class="faint">${waitingCount}</span></h2>
          <div class="wait-grid">
            <a class="wait" href="#beacon"><b>${x?.drafts ? num((x.drafts.draft || 0) + (x.drafts.review || 0)) : '—'}</b><span>drafts waiting</span></a>
            <a class="wait" href="#beacon/approved"><b>${x?.drafts ? num(x.drafts.approved || 0) : '—'}</b><span>approved, unscheduled</span></a>
            <a class="wait" href="#room/council"><b>${awaiting.length}</b><span>verdicts without an outcome</span></a>
            <span class="wait"><b>${blocked.length}</b><span>blocked orders</span></span>
          </div>
          ${blocked.length ? `<h3>Blocked</h3>${blocked.map((o) => orderRow(o)).join('')}` : ''}
          ${review.length ? `<h3>For review</h3>${review.map((o) => orderRow(o)).join('')}` : ''}
          ${stale.length ? `<h3 class="flare">P0 open for more than two days</h3>${stale.map((o) => orderRow(o)).join('')}` : ''}
          ${awaiting.length ? `<h3>Verdicts waiting for an outcome</h3>${awaiting.map((dcs) => `<div class="order-row"><span>${chip(dcs.verdict, VERDICT_TONE[dcs.verdict])}</span><span class="text">${esc(dcs.question)}</span><span class="faint nowrap">${when(dcs.ts)}</span><form class="inline row-form" data-act="decision-outcome" data-id="${esc(dcs.id)}"><input name="outcome" placeholder="What actually happened" style="width:220px"><button class="tiny" type="submit">record</button></form></div>`).join('')}` : ''}
          ${!blocked.length && !review.length && !stale.length && !awaiting.length ? '<p class="empty">Nothing waiting on the floor. The queue in BEACON is the rest.</p>' : ''}
        </section>

        <section>
          <h2>Active</h2>
          ${st.extraError ? failed(st.extraError, { retry: 'reload-extra' }) : ''}
          ${x?.active?.running?.length ? `<h3>Running now</h3>${x.active.running.map(runRow).join('')}` : ''}
          <h3>Runs <span class="faint">last two days</span></h3>
          ${x ? (x.active.runs.length ? x.active.runs.map(runRow).join('') : '<p class="empty">No agent has run in two days.</p>') : '<p class="state loading">loading…</p>'}
          <h3>Where the work is</h3>
          ${rooms.length ? `<table class="grid"><thead><tr><th>Room</th><th class="r">Open</th><th>Top order</th></tr></thead><tbody>${rooms.map(({ r, n, top }) => `<tr class="row" data-act="open-room" data-room="${r.id}"><td><a href="#room/${r.id}">${esc(r.name)}</a></td><td class="r"><b>${n}</b></td><td class="ash">${chip(PRIO[top.p], PRIO_TONE[top.p])} ${esc(top.t)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No open orders anywhere.</p>'}
        </section>

        <section>
          <h2>Counsel <span class="faint">Leo ↔ ARCANE</span></h2>
          ${counselBlock()}
        </section>
      </div>

      <aside class="bridge-side">
        <h2>Doctrine</h2>
        ${brain?.doctrine ? `<p class="doctrine">${esc(brain.doctrine)}</p>` : '<p class="empty">No current intent in 01-System/Doctrine.md.</p>'}
        <ol class="list principles">${(brain?.principles?.length ? brain.principles : DOCTRINE_FALLBACK).map((p) => `<li>${esc(p)}</li>`).join('')}</ol>

        <h2>Ventures <span class="faint">ranked in THE WAR ROOM</span></h2>
        ${VENTURES.map((v) => { const f = store.focusOf(v.id); return { v, f }; }).sort((a, b) => (a.f.rank || 9) - (b.f.rank || 9)).map(({ v, f }) => {
          const roomsOf = ROOMS.filter((r) => r.venture === v.id).map((r) => r.id);
          const vo = open.filter((o) => o.venture === v.id || roomsOf.includes(o.room));
          const top = vo.sort((a, b) => a.p - b.p)[0];
          return `<div class="venture-card">
            <div class="vc-head"><b>${f.rank ? `${f.rank}. ` : ''}${esc(v.name)}</b> ${chip(f.allocation, ALLOC_TONE[f.allocation])} <span class="spacer"></span><a class="faint" href="#room/${v.room}">${esc(ROOM_BY_ID[v.room]?.name || '')}</a></div>
            ${f.why ? `<p class="ash">${esc(f.why)}</p>` : ''}
            <p class="faint">${vo.length} open${vo.filter((o) => o.p === 0).length ? ` · <span class="breach">${vo.filter((o) => o.p === 0).length} P0</span>` : ''}${vo.filter((o) => o.state === 'blocked').length ? ` · <span class="flare">${vo.filter((o) => o.state === 'blocked').length} blocked</span>` : ''}${v.id === 'archives' && x?.drafts ? ` · ${num((x.drafts.draft || 0) + (x.drafts.review || 0))} drafts waiting` : ''}${v.id === 'peptides' ? (() => { const l = store.lab(); return ` · <a href="#lab">${num(l.vials)} vials · COA ${l.coaPct === null ? '—' : `${l.coaPct}%`}${l.noCoa.length ? ` · <span class="breach">${l.noCoa.length} without COA</span>` : ''} · ${l.dispatch.packing + l.dispatch.ready} to dispatch</a>`; })() : ''}</p>
            ${top ? `<p class="ash">${chip(PRIO[top.p], PRIO_TONE[top.p])} ${esc(top.t)}</p>` : ''}
          </div>`; }).join('')}

        <h2>Signals <span class="faint">VIGIL</span></h2>
        ${sig.length ? sig.map((s) => `<p class="signal ${s.severity}"><a href="#room/${esc(s.room)}">${chip(s.severity, s.severity === 'breach' ? 'deny' : s.severity === 'warn' ? 'flare' : 'ash')}</a> ${esc(s.text)} <span class="faint">— ${esc(s.clear)}</span></p>`).join('') : '<p class="vital">Nothing moved that needs you.</p>'}

        <h2>Goals</h2>
        <table class="grid goals">${store.goalList().map((g) => { const gp = store.goalProgress(g.id); const v = store.goalValue(g); const pct = store.goalPct(g); return `<tr><td>${esc(g.goal)}<br><span class="faint">${esc(g.target)} · ${esc(g.room)}</span></td><td class="r nowrap">${['g-coa', 'g-mrr', 'g-posts'].includes(g.id) ? `<b>${esc(String(v))}</b> <span class="faint">computed</span>` : `<input class="num" type="number" min="0" step="any" data-act="goal" data-id="${esc(g.id)}" value="${esc(gp?.value ?? '')}" placeholder="—" style="width:70px" ${store.server.ready ? '' : 'disabled'}>`}<br><span class="bar"><span class="bar-fill ${g.kind === 'money' ? 'gold' : 'arcane'}" style="width:${pct}%"></span></span> <span class="faint">${pct}%</span></td></tr>`; }).join('')}</table>

        <h2>Recent <span class="faint">the record</span></h2>
        ${x?.events?.length ? x.events.slice(0, 12).map((e) => `<p class="faint small"><span title="${esc(stampFull(e.at))}">${when(e.at)}</span> · ${esc(e.summary)}</p>`).join('') : '<p class="empty">Nothing recorded yet.</p>'}
      </aside>
    </div>
  </div>`;
  if (keepScroll) el.scrollTop = scroll;
}

function runRow(r) {
  const tone = r.status === 'ok' ? 'vital' : r.status === 'running' ? 'cyan' : 'deny';
  return `<div class="order-row"><span>${chip(r.agent, 'arcane')}${chip(r.status, tone)}</span><span class="text">${esc(r.objective)}</span>${r.error ? `<span class="breach">${esc(r.error).slice(0, 120)}</span>` : ''}<span class="faint nowrap" title="${esc(stampFull(r.started_at))}">${when(r.started_at)}</span></div>`;
}

function counselBlock() {
  const turns = store.counsel().slice(-12);
  return `<div class="counsel">${turns.length ? turns.map((t) => `<div class="turn ${t.who}"><span class="who">${t.who === 'leo' ? 'LEO' : 'ARCANE'}${t.specialist ? ` <span class="faint">· ${esc(t.specialist)}</span>` : ''} <span class="faint">${when(t.ts)}</span></span><p>${esc(t.text)}</p>${t.order ? `<p class="proposal">proposes ${chip(t.order.priority, PRIO_TONE[PRIO.indexOf(t.order.priority)])} ${esc(ROOM_BY_ID[t.order.room]?.name || t.order.room)}: ${esc(t.order.text)} <button class="tiny" data-act="counsel-order" data-room="${esc(t.order.room)}" data-text="${esc(t.order.text)}" data-p="${PRIO.indexOf(t.order.priority)}" data-actor="${esc(t.order.actor || 'human')}">add order</button></p>` : ''}</div>`).join('') : '<p class="empty">Ask the network something. ARCANE answers from the brief and the floor, names the specialist it concerns, and may propose one order.</p>'}</div>
    <form class="inline" data-act="counsel-ask"><input name="q" placeholder="Speak to the network…" style="flex:1;min-width:240px" autocomplete="off"><button type="submit" class="primary" ${st.busy === 'counsel' ? 'disabled' : ''}>${st.busy === 'counsel' ? 'thinking…' : 'Ask'}</button>${turns.length ? '<button type="button" class="tiny ghost" data-act="counsel-clear">clear</button>' : ''}</form>`;
}

/* ---------- events ---------- */
function saveFocus(value) { const day = today(); if (String(value).trim() !== store.day(day).focus) store.setDay(day, { focus: String(value).trim() }); }

function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'FORM') return;
  const act = b.dataset.act, id = b.dataset.id, room = b.dataset.room;
  if (act === 'back') go('#');
  else if (act === 'reload-extra') loadExtra();
  else if (act === 'open-room' && !e.target.closest('a')) go(`#room/${room}`);
  else if (act === 'order-kill') { if (confirm('Kill this order? It stays in the record as killed.')) store.setOrderState(room, id, 'killed'); }
  else if (act === 'order-block') { const why = prompt('Blocked on what?'); if (why !== null) store.setOrderState(room, id, 'blocked', why.trim() || 'unspecified'); }
  else if (act === 'order-unblock') store.setOrderState(room, id, 'open');
  else if (act === 'counsel-order') store.addOrder(room, b.dataset.text, Number(b.dataset.p), { actor: b.dataset.actor, source: 'counsel' });
  else if (act === 'counsel-clear') store.clearCounsel();
}
function onChange(e) {
  const i = e.target; const act = i.dataset.act; if (!act) return;
  if (act === 'order-done') store.setOrderState(i.dataset.room, i.dataset.id, i.checked ? 'done' : 'open');
  else if (act === 'move-done') store.doneItem('moves', i.dataset.id, true);
  else if (act === 'goal') store.setGoalProgress(i.dataset.id, i.value);
}
async function onSubmit(e) {
  const f = e.target; if (!f.dataset.act) return;
  e.preventDefault();
  if (handleKeyForm(f)) return;
  const act = f.dataset.act;
  if (act === 'order-add') { const text = f.text.value; if (!text.trim()) return; store.addOrder(f.room.value, text, Number(f.p.value), { actor: f.actor.value }); f.text.value = ''; }
  else if (act === 'decision-outcome') { const o = f.outcome.value.trim(); if (o) store.setDecisionOutcome(f.dataset.id, o); }
  else if (act === 'counsel-ask') {
    const q = f.q.value.trim(); if (!q) return;
    store.addCounsel('leo', q); f.q.value = ''; st.busy = 'counsel'; paint({ keepScroll: true });
    try { const r = await reason.ask(store, brain, q); store.addCounsel('arcane', r.answer, { specialist: r.specialist, order: r.order || null }); }
    catch (err) { store.addCounsel('arcane', `— ${err.message}`); }
    st.busy = ''; paint({ keepScroll: true });
  }
}
