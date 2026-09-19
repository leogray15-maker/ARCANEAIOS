/**
 * THE ARCANE — facility.
 *
 * One buffer, one canvas, integer zoom, drag to pan. Views: the floor, a
 * full-page room dashboard, the Trading Journal, the Brain Graph — routed
 * by the URL hash so every screen is a link. The floor keeps simulating
 * under any view, so the commander is still walking when you come back.
 *
 * Zoom is an integer in *device* pixels: the canvas backing store is sized
 * to devicePixelRatio, and 2x means two device pixels per buffer pixel, so
 * the art stays sharp on a Retina display instead of being resampled.
 */
import { AGENTS, ROOM_BY_ID } from '@arcane/config';
import { PW, PH, PLAN_BY_ID, roomAt } from './config/floorplan.js';
import { createBuffer, bakeStatic, drawLive, present } from './render/factory.js';
import { bakeSprites } from './render/sprites.js';
import { renderDash, bindDash } from './render/panel.js';
import { renderJournal, bindJournal } from './render/journal.js';
import { renderLibrary, bindLibrary, libraryKey } from './render/library.js';
import { renderBeacon, bindBeacon } from './render/beacon.js';
import { renderBridge, bindBridge } from './render/bridge.js';
import { renderWarroom, bindWarroom } from './render/warroom.js';
import { renderLab, bindLab } from './render/lab.js';
import { renderVault, bindVault } from './render/vault.js';
import { renderSanctum, bindSanctum } from './render/sanctum.js';
import { renderRecords, bindRecords } from './render/records.js';
import { renderControl, bindControl } from './render/control.js';
import { renderIntel, bindIntel } from './render/intel.js';
import { BrainGraph } from './render/graph.js';
import { Strip } from './render/strip.js';
import { signals } from './core/vigil.js';
import { Sim } from './core/sim.js';
import { Store } from './core/store.js';
import { exampleTrades } from './core/journal.js';
import { sync } from './core/sync.js';
import { cloud } from './core/cloud.js';
import { operator } from './core/operator.js';

const $ = (id) => document.getElementById(id);

const stage = $('stage'), canvas = $('floor'), tip = $('tip');
const views = { dash: $('dash'), library: $('library'), beacon: $('beacon'), bridge: $('bridge'), warroom: $('warroom'), lab: $('lab'), vault: $('vault'), sanctum: $('sanctum'), records: $('records'), control: $('control'), intel: $('intel'), journal: $('journal'), graph: $('graph') };
const staticBuf = createBuffer();
const buf = createBuffer();
const sprites = bakeSprites(AGENTS);
const view = { scale: 2, x: 0, y: 0, mode: 'fit' };
const state = { hover: null, selected: null, staticDirty: true, screen: 'floor' };

// The brain export is baked into the site at build time; without it the
// store still works from its seeds, and the dashboards say so.
let brain = null;
try { const r = await fetch('/brain.json', { cache: 'no-store' }); if (r.ok) brain = await r.json(); } catch {}
const store = new Store(brain);
store.sessionStart = Date.now();
const sim = new Sim(store);
const ctx = { sim, store, brain };
window.arcane = { store, sim, brain };   // for the console; nothing reads it
let contentCounts = null;   // BEACON's counts by status, once it has loaded them; the bar reads them
const graph = new BrainGraph($('graph-canvas'), $('graph-legend'), ctx, (roomId) => go(`#room/${roomId}`));
const strip = new Strip($('strip'), ctx);

/* ============================================================
   ZOOM + PAN
   ============================================================ */

const dpr = () => Math.max(1, window.devicePixelRatio || 1);

function fit() {
  const H = stage.clientHeight - 34;
  const s = Math.max(1, Math.floor(Math.min(stage.clientWidth / PW, H / PH)));
  view.scale = s;
  view.x = Math.floor((stage.clientWidth - PW * s) / 2);
  view.y = Math.floor((H - PH * s) / 2);
}
/** Set a zoom, keeping the point under `cx,cy` (stage pixels) fixed; defaults to the centre. */
function setZoom(mode, cx = stage.clientWidth / 2, cy = stage.clientHeight / 2) {
  view.mode = mode;
  if (mode === 'fit') fit();
  else {
    const bx = (cx - view.x) / view.scale, by = (cy - view.y) / view.scale;
    view.scale = Number(mode);
    view.x = Math.round(cx - bx * view.scale); view.y = Math.round(cy - by * view.scale);
  }
  for (const b of document.querySelectorAll('#hud button')) b.classList.toggle('on', b.dataset.zoom === String(mode));
}
function centreOn(roomId) {
  const p = PLAN_BY_ID[roomId]; if (!p) return;
  const [x, y, w, h] = p.rect;
  view.x = Math.round(stage.clientWidth / 2 - (x + w / 2) * view.scale);
  view.y = Math.round(stage.clientHeight / 2 - (y + h / 2) * view.scale);
  view.mode = 'pan';
  for (const b of document.querySelectorAll('#hud button')) b.classList.remove('on');
}
function resize() {
  const d = dpr();
  canvas.width = Math.round(stage.clientWidth * d); canvas.height = Math.round(stage.clientHeight * d);
  canvas.style.width = `${stage.clientWidth}px`; canvas.style.height = `${stage.clientHeight}px`;
  if (view.mode === 'fit') fit();
}

const toBuffer = (e) => { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.scale, y: (e.clientY - r.top - view.y) / view.scale }; };

let drag = null;
stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; stage.classList.add('dragging'); view.mode = 'pan'; view.x = drag.vx + dx; view.y = drag.vy + dy; for (const b of document.querySelectorAll('#hud button')) b.classList.remove('on'); }
    tip.style.display = 'none';
    return;
  }
  const p = toBuffer(e); const r = roomAt(p.x, p.y);
  const id = r ? r.id : null;
  if (id !== state.hover) { state.hover = id; state.staticDirty = true; }
  showTip(id, e);
});
stage.addEventListener('pointerleave', () => { tip.style.display = 'none'; if (state.hover) { state.hover = null; state.staticDirty = true; } });
stage.addEventListener('pointerup', (e) => {
  stage.classList.remove('dragging');
  const wasDrag = drag?.moved; drag = null;
  if (wasDrag) return;
  const p = toBuffer(e); const r = roomAt(p.x, p.y);
  if (r) { sim.command(r.id); go(ROOM_BY_ID[r.id].opens || `#room/${r.id}`); }
});
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  const steps = [1, 2, 3, 4];
  const i = steps.indexOf(view.scale);
  const next = e.deltaY < 0 ? steps[Math.min(steps.length - 1, i + 1)] : steps[Math.max(0, i - 1)];
  if (next !== view.scale) setZoom(String(next), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
for (const b of document.querySelectorAll('#hud button')) b.addEventListener('click', () => setZoom(b.dataset.zoom));
window.addEventListener('resize', () => { resize(); graph.resize(); });
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === 'Escape') { if (state.screen === 'beacon' && /^#beacon\/draft\//.test(location.hash)) go('#beacon'); else if (state.screen === 'library' && /^#library\//.test(location.hash)) go('#library'); else if (state.screen === 'lab' && /^#lab\//.test(location.hash)) go('#lab'); else if (['vault', 'sanctum', 'records'].includes(state.screen) && /^#[a-z]+\//.test(location.hash)) go(`#${state.screen}`); else if (state.screen !== 'floor') go('#'); return; }
  if (state.screen === 'floor' && !e.metaKey && !e.ctrlKey && !e.altKey) { if (e.key === 'b') return go('#bridge'); if (e.key === 'w') return go('#warroom'); if (e.key === 'l') return go('#library'); if (e.key === 'n') return go('#beacon'); if (e.key === 'p') return go('#lab'); if (e.key === 'v') return go('#vault'); if (e.key === 's') return go('#sanctum'); if (e.key === 'r') return go('#records'); if (e.key === 'j') return go('#journal'); if (e.key === 'i') return go('#intel'); if (e.key === 'c') return go('#control'); }
  if (state.screen === 'library') return libraryKey(e);
  if (state.screen !== 'floor') return;
  if (e.key === '0') setZoom('fit'); else if (e.key === '1') setZoom('1'); else if (e.key === '2') setZoom('2'); else if (e.key === '3') setZoom('3'); else if (e.key === '4') setZoom('4');
});

function showTip(roomId, e) {
  if (!roomId) { tip.style.display = 'none'; return; }
  const room = ROOM_BY_ID[roomId];
  const here = sim.occupants(roomId);
  const open = store.openCount(roomId);
  tip.innerHTML = `<b>${room.name}</b> <span>· ${room.sub}</span><br>${open ? `${open} open order${open === 1 ? '' : 's'}` : 'no open orders'}${here.length ? ' · ' + here.map((a) => `<span class="dot" style="background:${a.cfg.colour}"></span>${a.cfg.name}`).join(' ') : ''}`;
  const r = stage.getBoundingClientRect();
  tip.style.left = `${e.clientX - r.left + 14}px`; tip.style.top = `${e.clientY - r.top + 14}px`;
  tip.style.display = 'block';
}

/* ============================================================
   VIEWS — routed by the hash
   ============================================================ */

function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }
function route() {
  const h = location.hash || '#';
  const room = /^#room\/([a-z]+)/.exec(h)?.[1];
  if (room && ROOM_BY_ID[room]?.opens) { location.hash = ROOM_BY_ID[room].opens; return; }
  const screen = room && ROOM_BY_ID[room] ? 'dash' : h.startsWith('#journal') ? 'journal' : h.startsWith('#library') ? 'library' : h.startsWith('#beacon') ? 'beacon' : h.startsWith('#content') ? 'beacon' : h.startsWith('#bridge') ? 'bridge' : h.startsWith('#warroom') ? 'warroom' : h.startsWith('#lab') ? 'lab' : h.startsWith('#vault') ? 'vault' : h.startsWith('#sanctum') ? 'sanctum' : h.startsWith('#records') ? 'records' : h.startsWith('#control') ? 'control' : h.startsWith('#intel') ? 'intel' : h.startsWith('#graph') ? 'graph' : 'floor';
  state.screen = screen;
  state.selected = room && ROOM_BY_ID[room] ? room : null;
  for (const [k, el] of Object.entries(views)) el.classList.toggle('hidden', k !== screen);
  for (const b of document.querySelectorAll('#views button')) b.classList.toggle('on', b.dataset.view === (screen === 'dash' ? 'floor' : screen));
  if (screen === 'dash') { sim.command(state.selected); renderDash(views.dash, state.selected, ctx); views.dash.scrollTop = 0; }
  if (screen === 'journal') { sim.command('trading'); renderJournal(views.journal, ctx, h); }
  if (screen === 'bridge') { sim.command('bridge'); renderBridge(views.bridge, ctx, h); }
  if (screen === 'warroom') { sim.command('warroom'); renderWarroom(views.warroom, ctx, h); }
  if (screen === 'lab') { sim.command('apothecary'); renderLab(views.lab, ctx, h); }
  if (screen === 'vault') { sim.command('vault'); renderVault(views.vault, ctx, h); }
  if (screen === 'sanctum') { sim.command('sanctum'); renderSanctum(views.sanctum, ctx, h); }
  if (screen === 'records') { sim.command('records'); renderRecords(views.records, ctx, h); }
  if (screen === 'control') { sim.command('control'); renderControl(views.control, ctx, h); }
  if (screen === 'intel') { sim.command('intel'); renderIntel(views.intel, ctx, h); }
  if (screen === 'library') { sim.command('archives'); renderLibrary(views.library, ctx, h); }
  if (screen === 'beacon') { sim.command('beacon'); renderBeacon(views.beacon, ctx, h.startsWith('#content') ? '#beacon' : h); }
  if (screen === 'graph') graph.show();
  else graph.hide();
  state.staticDirty = true;
  barStatus();
}
window.addEventListener('hashchange', route);
for (const b of document.querySelectorAll('#views button')) b.addEventListener('click', () => go(b.dataset.view === 'floor' ? '#' : `#${b.dataset.view}`));
bindDash(views.dash, { store, getRoom: () => state.selected, go, brain });
bindJournal(views.journal, { store, go });
bindLibrary(views.library, { go, brain });
bindBeacon(views.beacon, { go, onCounts: (c) => { contentCounts = c; barStatus(); } });
bindBridge(views.bridge, { store, go, brain, onCounts: (c) => { contentCounts = c; barStatus(); } });
bindWarroom(views.warroom, { store, go, brain });
bindLab(views.lab, { store, go });
bindVault(views.vault, { store, go });
bindSanctum(views.sanctum, { store, go });
bindRecords(views.records, { store, go, brain });
bindControl(views.control, { store, go });
bindIntel(views.intel, { store, go, brain });
store.onChange(() => {
  if (state.screen === 'dash') renderDash(views.dash, state.selected, ctx, { keepScroll: true });
  if (state.screen === 'journal') renderJournal(views.journal, ctx, location.hash, { keepScroll: true });
  if (state.screen === 'bridge') renderBridge(views.bridge, ctx, location.hash, { keepScroll: true });
  if (state.screen === 'warroom') renderWarroom(views.warroom, ctx, location.hash, { keepScroll: true });
  if (state.screen === 'lab') renderLab(views.lab, ctx, location.hash, { keepScroll: true });
  if (state.screen === 'vault') renderVault(views.vault, ctx, location.hash, { keepScroll: true });
  if (state.screen === 'sanctum') renderSanctum(views.sanctum, ctx, location.hash, { keepScroll: true });
  if (state.screen === 'records') renderRecords(views.records, ctx, location.hash, { keepScroll: true });
  if (state.screen === 'control') renderControl(views.control, ctx, location.hash, { keepScroll: true });
  if (state.screen === 'intel') renderIntel(views.intel, ctx, location.hash, { keepScroll: true });
  barStatus();
});
store.loadCloud().then((ok) => { if (ok) { route(); store.startPolling(); } });
// The server rung: orders, moves, decisions, counsel, focus, goals, the day. Loads now, again when the key changes, and every minute.
store.loadServer().then(() => { route(); store.startServerRefresh(); });
operator.onChange(() => { store.loadServer().then(() => route()); });
sync.onChange(() => { store.loadCloud().then((ok) => { if (ok) { route(); store.startPolling(); } }); renderSync(); });

/**
 * The device control in the bar: the sync code (state across devices) and
 * the operator key (the API). Click to open; nothing is shown until asked.
 */
function renderSync() {
  const el = $('auth');
  const dot = `<span class="${operator.present ? 'vital' : 'flare'}" title="${operator.present ? 'operator key on this device' : 'no operator key — the Library and BEACON will ask for one'}">●</span>`;
  el.innerHTML = `<button class="tiny ghost" id="sync-toggle" title="this device: sync code and operator key">${dot} ${cloud.enabled ? 'SYNC' : 'DEVICE'}</button>`;
  $('sync-toggle').onclick = () => {
    el.innerHTML = `${cloud.enabled ? `<span class="ash">sync:</span> <code id="sync-code" title="click to copy" style="cursor:pointer">${sync.code}</code>
      <form id="sync-join" style="display:inline-flex;gap:4px"><input name="code" placeholder="paste another device's code" style="width:200px"><button class="tiny" type="submit">join</button></form>` : `<span class="faint" title="${cloud.reason}">no sync</span>`}
      <form id="op-key" style="display:inline-flex;gap:4px;margin-left:12px"><input name="key" type="password" placeholder="${operator.present ? 'operator key is set — paste to replace' : 'operator key'}" style="width:180px" autocomplete="off"><button class="tiny" type="submit">${operator.present ? 'replace' : 'set'}</button>${operator.present ? '<button class="tiny ghost" type="button" id="op-clear">forget</button>' : ''}</form>
      <button class="tiny ghost" id="sync-close">close</button>`;
    if (cloud.enabled) {
      $('sync-code').onclick = () => navigator.clipboard?.writeText(sync.code).then(() => { $('sync-code').textContent = 'copied'; setTimeout(renderSync, 900); });
      $('sync-join').onsubmit = (e) => { e.preventDefault(); if (!sync.use(e.target.code.value)) { e.target.code.value = ''; e.target.code.placeholder = 'that is not a sync code'; } };
    }
    $('op-key').onsubmit = (e) => { e.preventDefault(); if (e.target.key.value.trim()) { operator.set(e.target.key.value); renderSync(); route(); } };
    const clr = $('op-clear'); if (clr) clr.onclick = () => { operator.clear(); renderSync(); };
    $('sync-close').onclick = renderSync;
  };
}
renderSync();

function barStatus() {
  const away = sim.agents.filter((a) => a.id !== 'arcane' && a.room !== a.home).length;
  const sig = signals(store.state, brain); const worst = sig.some((s) => s.severity === 'breach') ? 'breach' : sig.some((s) => s.severity === 'warn') ? 'flare' : 'ash';
  const waiting = contentCounts ? (contentCounts.draft || 0) + (contentCounts.review || 0) : store.drafts().filter((d) => d.status === 'draft').length;
  const sv = store.serverStatus();
  const notice = store.noticeNow();
  if (notice) { $('bar-status').innerHTML = `<span class="${notice.tone}">${notice.text}</span>`; return; }
  $('bar-status').innerHTML = `<span class="${sv.tone}" title="${sv.text}">●</span> ${brain?.brief?.date ? `<a href="#bridge">brief <b>${brain.brief.date}</b></a> · ` : ''}<a href="#bridge"><b>${store.totalOpen()}</b> open orders</a> · <a href="#beacon"><b>${waiting}</b> draft${waiting === 1 ? '' : 's'} waiting</a> · <a href="#room/observatory" class="${worst}"><b>${sig.length}</b> signal${sig.length === 1 ? '' : 's'}</a> · ${away ? `<b>${away}</b> crew away` : 'all crew at station'}${sv.tone !== 'vital' ? ` · <span class="${sv.tone}">${sv.text}</span>` : ''}`;
}

/* ============================================================
   LOOP
   ============================================================ */

const FRAME = 1000 / 30;
let last = performance.now(), acc = 0, panelClock = 0, occupantsKey = '';

function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  sim.update(dt);
  acc += dt * 1000;
  if (acc >= FRAME) {
    acc %= FRAME;
    if (state.screen === 'floor') {
      if (state.staticDirty) { bakeStatic(staticBuf, state); state.staticDirty = false; }
      drawLive(buf, staticBuf, sim, sprites, now / 1000);
      present(canvas, buf, view, state, sim, dpr());
    } else if (state.screen === 'graph') graph.draw(now / 1000);
  }
  panelClock += dt;
  if (panelClock > 0.5) {
    panelClock = 0;
    if (state.screen === 'dash') {
      const key = sim.occupants(state.selected).map((a) => a.id + a.state).join();
      if (key !== occupantsKey) { occupantsKey = key; renderDash(views.dash, state.selected, ctx, { keepScroll: true }); }
    }
    barStatus();
  }
  requestAnimationFrame(loop);
}

window.addEventListener('error', (e) => { $('bar-status').innerHTML = `<span class="breach">runtime error: ${e.message} (${e.filename?.split('/').pop()}:${e.lineno})</span>`; });

// Deep links: ?zoom=2|3 and ?room=<id> still work; the hash carries the view.
const params = new URLSearchParams(location.search);
if (params.get('demo') === 'journal' && !store.trades().length) for (const t of exampleTrades()) store.saveTrade(t);
resize();
setZoom(['1', '2', '3', '4'].includes(params.get('zoom')) ? params.get('zoom') : 'fit');
if (params.get('room') && PLAN_BY_ID[params.get('room')]) { centreOn(params.get('room')); sim.command(params.get('room')); }
route();
loop(performance.now());
