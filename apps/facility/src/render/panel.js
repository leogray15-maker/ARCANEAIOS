/**
 * The room dashboard, full page. Every room renders the same four
 * sections — State, Orders, Crew, Files — in the same places, so the
 * operator never relearns a screen. State is the room's widget
 * (widgets.js); Orders is the store's board for that room, editable;
 * Crew is who is stationed here and who is here now; Files is the brain
 * folder the room owns, from the export.
 *
 * Controls carry data-act attributes; `bindDash` routes them to the store.
 */
import { ROOM_BY_ID, AGENT_BY_ID, WING_BY_ID, VENTURE_BY_ID, CAPS, SKILL_BY_ID } from '@arcane/config';
import { WIDGETS, esc } from './widgets.js';

const PRIO = ['P0', 'P1', 'P2', 'P3'];
const PRIO_TONE = ['deny', 'flare', 'arcane', 'ash'];

export function renderDash(el, roomId, { sim, store, brain }, { keepScroll = false } = {}) {
  const room = ROOM_BY_ID[roomId]; if (!room) return;
  const scroll = keepScroll ? el.scrollTop : 0;
  const active = document.activeElement && el.contains(document.activeElement) ? { id: document.activeElement.dataset?.id, act: document.activeElement.dataset?.act, field: document.activeElement.dataset?.field } : null;
  const wing = WING_BY_ID[room.wing];
  const agent = room.agent ? AGENT_BY_ID[room.agent] : null;
  const venture = room.venture ? VENTURE_BY_ID[room.venture] : null;
  const widget = WIDGETS[roomId];
  const here = sim ? sim.occupants(roomId) : [];

  el.innerHTML = `<div class="wrap">
    <div class="view-head">
      <button class="back ghost" data-act="back">← Floor</button>
      <h1>${esc(room.name)}</h1>
      <span class="sub">${esc(room.sub)}</span>
      <span class="chip">${esc(wing.name)}</span>
      ${venture ? `<span class="chip arcane">${esc(venture.name)}</span>` : ''}
      <span class="spacer"></span>
      <span class="ash">${store.openCount(roomId)} open · ${here.length} here · <span class="faint">Esc to return</span></span>
    </div>
    <div class="dash-grid">
      <div>
        <section class="block"><h2>State</h2>
          <p class="ash">${esc(room.domain)}</p>
          ${venture ? `<p>${venture.facts.map((f) => `<span class="chip">${esc(f)}</span>`).join('')}</p>` : ''}
          ${widget ? widget(store, brain, room) : '<p class="empty">No widget yet.</p>'}
        </section>
      </div>
      <div>
        <section class="block"><h2>Orders</h2>${ordersBoard(store, roomId)}</section>
        <section class="block"><h2>Crew</h2>${crewBlock(agent, here, roomId, sim)}</section>
        <section class="block"><h2>Files</h2>${filesList(room, brain)}</section>
      </div>
    </div>
  </div>`;
  if (keepScroll) el.scrollTop = scroll;
  if (active?.act) { const again = el.querySelector(`[data-act="${active.act}"][data-id="${active.id}"]${active.field ? `[data-field="${active.field}"]` : ''}`); if (again) again.focus(); }
}

function ordersBoard(store, roomId) {
  const open = store.openOrders(roomId);
  const done = store.orders(roomId).filter((o) => o.done).slice(0, 5);
  const row = (o) => `<label class="order ${o.done ? 'done' : ''}"><input type="checkbox" data-act="order-toggle" data-id="${o.id}" ${o.done ? 'checked' : ''}> <span class="chip ${PRIO_TONE[o.p]}">${PRIO[o.p]}</span> ${esc(o.t)}${o.holder ? ` <span class="faint">· ${esc(o.holder)}</span>` : ''}${o.blocked ? ` <span class="flare">· blocked: ${esc(o.blocked)}</span>` : ''}${o.fromBrain ? '' : ` <button class="tiny ghost" data-act="order-remove" data-id="${o.id}">×</button>`}</label>`;
  return `
    ${open.map(row).join('') || '<p class="empty">No open orders here.</p>'}
    <form class="inline" data-act="order-add"><input name="text" placeholder="New order for this room" style="flex:1;min-width:160px"><select name="p"><option value="0">P0</option><option value="1">P1</option><option value="2" selected>P2</option><option value="3">P3</option></select><button type="submit">Add</button></form>
    ${done.length ? `<details><summary>${done.length} done</summary>${done.map(row).join('')}</details>` : ''}
    <p class="src">Crew are drawn to rooms with open orders — P0 pulls hardest. Orders from the brain carry the holder named in 06-Orders.</p>`;
}

function crewBlock(agent, here, roomId, sim) {
  const verb = (a) => a.state === 'walk' ? 'arriving' : a.state === 'drift' ? 'moving about' : a.room === a.home ? 'at station' : 'visiting';
  const resident = agent ? `
    <p><span class="dot" style="background:${agent.colour}"></span><strong>${esc(agent.name)}</strong> · ${esc(agent.role)} · <code>${esc(agent.call)}</code></p>
    <p class="ash">${esc(agent.brief)}</p>
    <p>${CAPS.map((c) => `<span class="chip ${agent.caps[c.id]}">${esc(c.name)}: ${agent.caps[c.id]}</span>`).join('')}</p>
    ${agent.skills.length ? `<p>Skills: ${agent.skills.map((s) => `<span class="chip">${esc(SKILL_BY_ID[s].invoke)}</span>`).join('')}</p>` : ''}
    ${agent.asks.length ? `<p class="ash">Must ask before: ${agent.asks.map(esc).join(' · ')}</p>` : ''}`
    : '<p class="empty">No resident. Nine seats convene here.</p>';
  return `${resident}<h3>Here now</h3><p>${here.length ? here.map((a) => `<span class="dot" style="background:${a.cfg.colour}"></span>${esc(a.cfg.name)} <span class="faint">(${verb(a)})</span>`).join(' · ') : '<span class="empty">nobody</span>'}</p>`;
}

function filesList(room, brain) {
  if (!room.brain) return '<p class="empty">This room reads shared memory only.</p>';
  const folder = room.brain.split('/')[0];
  const files = (brain?.files?.[folder] || []).filter((f) => f.path.startsWith(room.brain)).slice(0, 12);
  return `<p><code>brain/${esc(room.brain)}</code></p>${files.length ? `<table class="grid">${files.map((f) => `<tr><td><span class="chip">${esc(f.type || 'note')}</span></td><td>${esc(f.name)}</td><td class="faint r">${esc(f.updated)}</td></tr>`).join('')}</table>` : '<p class="empty">Nothing here yet.</p>'}`;
}

/** Route control events to the store. Call once; re-rendering keeps working because it listens on the view element. */
export function bindDash(el, { store, getRoom, go }) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'FORM') return;
    const act = b.dataset.act, id = b.dataset.id, room = getRoom();
    if (act === 'back') go('#');
    else if (act === 'order-remove') store.removeOrder(room, id);
    else if (act === 'stock-adj') store.adjustStock(id, Number(b.dataset.delta));
    else if (act === 'coa') store.cycleCoa(id);
    else if (act === 'draft') store.markDraft(id, b.dataset.status);
    else if (act === 'draft-open') { const pre = el.querySelector(`#draft-${CSS.escape(id)}`); if (pre) pre.classList.toggle('hidden'); }
    else if (act === 'open-journal') go('#journal');
  });
  el.addEventListener('change', (e) => {
    const i = e.target; const act = i.dataset.act; if (!act) return;
    const room = getRoom();
    if (act === 'order-toggle') store.toggleOrder(room, i.dataset.id);
    else if (act === 'ledger') store.setLedger(i.dataset.id, i.dataset.field, i.value);
    else if (act === 'fixed') store.setBudget('fixed', i.dataset.id, i.value);
    else if (act === 'split') store.setBudget('split', i.dataset.id, i.value);
    else if (act === 'cash') store.setBudget('cash', 'cash', i.value);
    else if (act === 'funnel') store.setFunnel(i.dataset.field, i.value);
    else if (act === 'goal') store.setGoal(i.dataset.id, i.value);
  });
  el.addEventListener('submit', (e) => {
    const f = e.target; if (!f.dataset.act) return;
    e.preventDefault();
    const room = getRoom();
    if (f.dataset.act === 'order-add') { store.addOrder(room, f.text.value, Number(f.p.value)); f.reset(); }
    else if (f.dataset.act === 'stock-add') { store.addStockLine(f.code.value, f.size.value, f.vials.value); f.reset(); }
  });
}
