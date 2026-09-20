/**
 * The navigator — every room and every application, one keystroke or one
 * thumb away.
 *
 *   ≡ in the bar, Cmd/Ctrl-K, or the MORE tab on a phone
 *
 * The floor is the map, but a map is a poor way to reach a room when the
 * screen is 390 pixels wide, so this is the way that always works: a
 * searchable list of every destination, with what is waiting in each, on
 * every screen size. Arrow keys and Enter on a keyboard; a full-height
 * sheet with big rows under a thumb.
 */
import { ROOMS, ROOM_BY_ID, WING_BY_ID, AGENT_BY_ID } from '@arcane/config';
import { esc } from './ui.js';

/** Everywhere you can go: the rooms, then the views that are not rooms. */
function destinations(store, counts) {
  const open = (id) => (store ? store.openCount(id) : 0);
  const rooms = ROOMS.map((r) => ({
    id: r.id,
    hash: r.opens || `#room/${r.id}`,
    name: r.name,
    sub: r.sub,
    wing: WING_BY_ID[r.wing]?.name || '',
    agent: r.agent ? AGENT_BY_ID[r.agent]?.name : '',
    badge: open(r.id) ? `${open(r.id)} open` : '',
    keys: `${r.name} ${r.sub} ${r.domain || ''} ${r.agent || ''}`,
  }));
  const waiting = counts ? (counts.draft || 0) + (counts.review || 0) : 0;
  const extra = [
    { id: 'floor', hash: '#', name: 'THE FLOOR', sub: 'the facility, from above', wing: '', keys: 'floor map facility home' },
    { id: 'graph', hash: '#graph', name: 'BRAIN GRAPH', sub: 'the vault as a graph', wing: '', keys: 'graph brain obsidian notes' },
    { id: 'journal', hash: '#journal', name: 'THE JOURNAL', sub: 'trades, reviews, the playbook', wing: '', keys: 'journal trades trading xauusd gold' },
  ];
  // BEACON carries the one count that is always worth seeing from anywhere.
  const out = [...rooms, ...extra];
  const beacon = out.find((d) => d.id === 'beacon');
  if (beacon && waiting) beacon.badge = `${waiting} waiting`;
  return out;
}

const st = { open: false, q: '', i: 0, list: [] };
let el = null, go = null, store = null, counts = null;

export function installNav(ctx) {
  go = ctx.go; store = ctx.store;
  el = document.getElementById('nav');
  el.addEventListener('click', (e) => {
    const row = e.target.closest('[data-hash]');
    if (row) { choose(row.dataset.hash); return; }
    if (e.target.closest('[data-act=close]') || e.target === el) close();
  });
  el.addEventListener('input', (e) => { if (e.target.id === 'nav-q') { st.q = e.target.value; st.i = 0; paint(); } });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); st.i = Math.min(st.list.length - 1, st.i + 1); paint({ keepQuery: true }); }
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); st.i = Math.max(0, st.i - 1); paint({ keepQuery: true }); }
    else if (e.key === 'Enter') { e.preventDefault(); const d = st.list[st.i]; if (d) choose(d.hash); }
  });
  // Cmd/Ctrl-K anywhere, and "g" on the floor when nothing is focused.
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); toggle(); return; }
    if (st.open) return;
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'g') { e.preventDefault(); open(); }
  });
}

/** BEACON's counts, when a view has loaded them, so the sheet can show what waits. */
export function navCounts(c) { counts = c; if (st.open) paint({ keepQuery: true }); }

export function open() { st.open = true; st.q = ''; st.i = 0; el.classList.remove('hidden'); document.documentElement.classList.add('nav-open'); paint(); const q = el.querySelector('#nav-q'); if (q && !matchMedia('(hover: none)').matches) q.focus(); }
export function close() { st.open = false; el.classList.add('hidden'); document.documentElement.classList.remove('nav-open'); }
export function toggle() { st.open ? close() : open(); }
export const isOpen = () => st.open;

function choose(hash) { close(); go(hash); }

function paint({ keepQuery = false } = {}) {
  const q = st.q.trim().toLowerCase();
  const all = destinations(store, counts);
  st.list = q ? all.filter((d) => d.keys.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)) : all;
  if (st.i >= st.list.length) st.i = Math.max(0, st.list.length - 1);
  const byWing = {};
  for (const d of st.list) (byWing[d.wing || 'ELSEWHERE'] || (byWing[d.wing || 'ELSEWHERE'] = [])).push(d);
  const row = (d) => `<button class="nav-row ${st.list[st.i] === d ? 'on' : ''}" data-hash="${esc(d.hash)}">
      <span class="n">${esc(d.name)}</span>
      <span class="s">${esc(d.sub)}</span>
      ${d.agent ? `<span class="a">${esc(d.agent)}</span>` : ''}
      ${d.badge ? `<span class="b">${esc(d.badge)}</span>` : ''}
    </button>`;
  el.innerHTML = `<div class="nav-sheet" role="dialog" aria-label="Go to a room">
      <div class="nav-head">
        <input id="nav-q" type="search" placeholder="Go to…  (a room, an agent, a word)" value="${esc(st.q)}" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button class="ghost" data-act="close">Close</button>
      </div>
      <div class="nav-list">
        ${st.list.length ? Object.entries(byWing).map(([wing, ds]) => `<div class="nav-group"><h3>${esc(wing)}</h3>${ds.map(row).join('')}</div>`).join('') : '<p class="empty">Nothing by that name.</p>'}
      </div>
      <p class="nav-foot"><span class="faint">Enter to go · Esc to close · Cmd-K or g from anywhere</span></p>
    </div>`;
  if (keepQuery) { const q2 = el.querySelector('#nav-q'); if (q2 && document.activeElement !== q2 && !matchMedia('(hover: none)').matches) q2.focus(); }
  const on = el.querySelector('.nav-row.on'); if (on) on.scrollIntoView({ block: 'nearest' });
}
