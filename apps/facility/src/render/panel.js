/**
 * The room dashboard. Every room renders the same four sections — State,
 * Orders, Crew, Files — so the operator never relearns a screen. State is
 * the room's widget (widgets.js); Orders is the store's board for that
 * room, editable; Crew is who is stationed here and who is here now;
 * Files is the brain folder the room owns, from the export.
 *
 * Controls carry data-act attributes; `bindPanel` routes them to the store.
 */
import { ROOM_BY_ID, AGENT_BY_ID, AGENTS, WING_BY_ID, VENTURE_BY_ID, CAPS, DASHBOARD_FRAME, SKILL_BY_ID } from '@arcane/config';
import { WIDGETS, esc } from './widgets.js';

const PRIO = ['P0', 'P1', 'P2', 'P3'];

export function renderPanel(el, roomId, { sim, store, brain } = {}) {
  if (!roomId) {
    el.innerHTML = `
      <h1>THE ARCANE</h1>
      <div class="sub">LEOOS v3 · ${AGENTS.length} agents · 20 rooms · 4 wings · ${store ? `${store.totalOpen()} open orders` : ''}</div>
      <p>Click a room. The commander walks there and its dashboard opens. Crew walk toward rooms with open orders.</p>
      ${brain?.brief?.date ? `<p class="ash">Brief of ${esc(brain.brief.date)} · brain exported ${esc(brain.built)} · memory on ${esc(store?.where())}</p>` : ''}
      <h2>Standing rules</h2>
      <p>No agent holds <span class="chip deny">allow</span>. Spend is <span class="chip deny">deny</span> for everyone. Notion is read-only. Nothing publishes unattended.</p>
      <h2>Crew</h2>
      ${AGENTS.map((a) => { const s = sim?.byId[a.id]; return `<p><span class="dot" style="background:${a.colour}"></span>${esc(a.name)} <span class="ash">· ${esc(a.role)} · ${esc(ROOM_BY_ID[s?.room || a.room].name)}${s && s.room !== a.room ? ' (visiting)' : ''}</span></p>`; }).join('')}`;
    return;
  }
  const room = ROOM_BY_ID[roomId];
  const wing = WING_BY_ID[room.wing];
  const agent = room.agent ? AGENT_BY_ID[room.agent] : null;
  const venture = room.venture ? VENTURE_BY_ID[room.venture] : null;
  const widget = WIDGETS[roomId];

  const sections = {
    state: `
      <p class="ash">${esc(room.domain)}</p>
      ${venture ? `<p>${venture.facts.map((f) => `<span class="chip">${esc(f)}</span>`).join('')}</p>` : ''}
      ${widget && store ? widget(store, brain, room) : '<p class="empty">No widget yet.</p>'}`,
    orders: store ? ordersBoard(store, roomId) : '',
    crew: (agent ? `
      <p><span class="dot" style="background:${agent.colour}"></span><strong>${esc(agent.name)}</strong> · ${esc(agent.role)} · <code>${esc(agent.call)}</code></p>
      <p class="ash">${esc(agent.brief)}</p>
      <p>${CAPS.map((c) => `<span class="chip ${agent.caps[c.id]}">${esc(c.name)}: ${agent.caps[c.id]}</span>`).join('')}</p>
      ${agent.skills.length ? `<p>Skills: ${agent.skills.map((s) => `<span class="chip">${esc(SKILL_BY_ID[s].invoke)}</span>`).join('')}</p>` : ''}`
      : '<p class="empty">No resident. Nine seats convene here.</p>') + hereNow(roomId, sim),
    files: filesList(room, brain),
  };
  el.innerHTML = `
    <h1>${esc(room.name)}</h1>
    <div class="sub">${esc(room.sub)} · ${esc(wing.name)}</div>
    ${DASHBOARD_FRAME.map((s) => `<h2>${esc(s.name)}</h2>${sections[s.id]}`).join('')}`;
}

function ordersBoard(store, roomId) {
  const open = store.openOrders(roomId);
  const done = store.orders(roomId).filter((o) => o.done).slice(0, 5);
  const row = (o) => `<label class="order ${o.done ? 'done' : ''}"><input type="checkbox" data-act="order-toggle" data-id="${o.id}" ${o.done ? 'checked' : ''}> <span class="chip ${['deny', 'flare', 'arcane', 'ash'][o.p]}">${PRIO[o.p]}</span> <span>${esc(o.t)}</span>${o.holder ? ` <span class="faint">· ${esc(o.holder)}</span>` : ''}${o.blocked ? ` <span class="flare">· blocked: ${esc(o.blocked)}</span>` : ''}${o.fromBrain ? '' : ` <button class="tiny ghost" data-act="order-remove" data-id="${o.id}">×</button>`}</label>`;
  return `
    ${open.map(row).join('') || '<p class="empty">No open orders here.</p>'}
    <form class="inline" data-act="order-add"><input name="text" placeholder="New order for this room" style="width:180px"><select name="p"><option value="0">P0</option><option value="1">P1</option><option value="2" selected>P2</option><option value="3">P3</option></select><button type="submit">Add</button></form>
    ${done.length ? `<details><summary class="ash">${done.length} done</summary>${done.map(row).join('')}</details>` : ''}
    <p class="ash">Crew are drawn to rooms with open orders — P0 pulls hardest. Orders from the brain carry the holder named in 06-Orders.</p>`;
}

/** Who is physically in the room right now, from the sim. */
function hereNow(roomId, sim) {
  if (!sim) return '';
  const here = sim.occupants(roomId);
  const verb = (a) => a.state === 'walk' ? 'arriving' : a.state === 'drift' ? 'moving about' : a.room === a.home ? 'at station' : 'visiting';
  return `<p style="margin-top:8px;color:var(--ash)">Here now: ${here.length ? here.map((a) => `<span class="dot" style="background:${a.cfg.colour}"></span>${esc(a.cfg.name)} <span style="color:var(--faint)">(${verb(a)})</span>`).join(' · ') : '<span class="empty">nobody</span>'}</p>`;
}

function filesList(room, brain) {
  if (!room.brain) return '<p class="empty">This room reads shared memory only.</p>';
  const folder = room.brain.split('/')[0];
  const files = (brain?.files?.[folder] || []).filter((f) => f.path.startsWith(room.brain)).slice(0, 10);
  return `<p><code>brain/${esc(room.brain)}</code></p>${files.length ? files.map((f) => `<p><span class="chip">${esc(f.type || 'note')}</span> ${esc(f.name)} <span class="faint">${esc(f.updated)}</span></p>`).join('') : '<p class="empty">Nothing here yet.</p>'}`;
}

/** Route control events to the store. Call once; re-rendering keeps working because it listens on the panel element. */
export function bindPanel(el, { store, getRoom }) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'FORM') return;
    const act = b.dataset.act, id = b.dataset.id, room = getRoom();
    if (act === 'order-toggle') return;
    if (act === 'order-remove') store.removeOrder(room, id);
    else if (act === 'stock-adj') store.adjustStock(id, Number(b.dataset.delta));
    else if (act === 'coa') store.cycleCoa(id);
    else if (act === 'draft') store.markDraft(id, b.dataset.status);
    else if (act === 'draft-open') { const pre = el.querySelector(`#draft-${CSS.escape(id)}`); if (pre) pre.classList.toggle('hidden'); }
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
  });
  el.addEventListener('submit', (e) => {
    const f = e.target; if (!f.dataset.act) return;
    e.preventDefault();
    const room = getRoom();
    if (f.dataset.act === 'order-add') { store.addOrder(room, f.text.value, Number(f.p.value)); f.reset(); }
    else if (f.dataset.act === 'stock-add') { store.addStockLine(f.code.value, f.size.value, f.vials.value); f.reset(); }
  });
}
