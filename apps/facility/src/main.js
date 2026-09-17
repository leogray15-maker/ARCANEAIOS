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
import { BrainGraph } from './render/graph.js';
import { Sim } from './core/sim.js';
import { Store } from './core/store.js';
import { exampleTrades } from './core/journal.js';
import { auth } from './core/auth.js';
import { cloud } from './core/cloud.js';

const $ = (id) => document.getElementById(id);
// Back from a magic link? Take the session out of the URL before the router sees the hash.
auth.acceptHash();
const stage = $('stage'), canvas = $('floor'), tip = $('tip');
const views = { dash: $('dash'), journal: $('journal'), graph: $('graph') };
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
const graph = new BrainGraph($('graph-canvas'), $('graph-legend'), ctx, (roomId) => go(`#room/${roomId}`));

/* ============================================================
   ZOOM + PAN
   ============================================================ */

const dpr = () => Math.max(1, window.devicePixelRatio || 1);

function fit() {
  const s = Math.max(1, Math.floor(Math.min(stage.clientWidth / PW, stage.clientHeight / PH)));
  view.scale = s;
  view.x = Math.floor((stage.clientWidth - PW * s) / 2);
  view.y = Math.floor((stage.clientHeight - PH * s) / 2);
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
  if (r) go(`#room/${r.id}`);
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
  if (e.key === 'Escape') { if (state.screen !== 'floor') go('#'); return; }
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
  const screen = room && ROOM_BY_ID[room] ? 'dash' : h.startsWith('#journal') ? 'journal' : h.startsWith('#graph') ? 'graph' : 'floor';
  state.screen = screen;
  state.selected = room && ROOM_BY_ID[room] ? room : null;
  for (const [k, el] of Object.entries(views)) el.classList.toggle('hidden', k !== screen);
  for (const b of document.querySelectorAll('#views button')) b.classList.toggle('on', b.dataset.view === (screen === 'dash' ? 'floor' : screen));
  if (screen === 'dash') { sim.command(state.selected); renderDash(views.dash, state.selected, ctx); views.dash.scrollTop = 0; }
  if (screen === 'journal') renderJournal(views.journal, ctx, h);
  if (screen === 'graph') graph.show();
  else graph.hide();
  state.staticDirty = true;
  barStatus();
}
window.addEventListener('hashchange', route);
for (const b of document.querySelectorAll('#views button')) b.addEventListener('click', () => go(b.dataset.view === 'floor' ? '#' : `#${b.dataset.view}`));
bindDash(views.dash, { store, getRoom: () => state.selected, go });
bindJournal(views.journal, { store, go });
store.onChange(() => {
  if (state.screen === 'dash') renderDash(views.dash, state.selected, ctx, { keepScroll: true });
  if (state.screen === 'journal') renderJournal(views.journal, ctx, location.hash, { keepScroll: true });
  barStatus();
});
store.loadCloud().then((ok) => { if (ok) { route(); store.startPolling(); } });
auth.onChange(() => { renderAuth(); store.loadCloud().then((ok) => { if (ok) { route(); store.startPolling(); } }); });

/** Sign-in control in the bar: an email box until signed in, then the address and a sign-out. */
function renderAuth() {
  const el = $('auth');
  if (!cloud.enabled) { el.innerHTML = `<span class="faint" title="${cloud.reason}">no sync</span>`; return; }
  if (auth.session) { el.innerHTML = `<span class="who" title="synced through Supabase">● ${auth.email}</span><button class="tiny ghost" id="signout">sign out</button>`; $('signout').onclick = () => { auth.signOut(); }; return; }
  el.innerHTML = `<form id="signin"><input type="email" name="email" placeholder="email for a sign-in link" required><button class="tiny" type="submit">SIGN IN</button></form>`;
  $('signin').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, email = f.email.value.trim(); f.querySelector('button').disabled = true;
    try { await auth.signIn(email); el.innerHTML = `<span class="ash">link sent to <b>${email}</b> — open it on this device</span>`; }
    catch (err) { el.innerHTML = `<span class="breach">${err.message}</span> <button class="tiny ghost" id="retry">retry</button>`; $('retry').onclick = renderAuth; }
  };
}
renderAuth();

function barStatus() {
  const away = sim.agents.filter((a) => a.id !== 'arcane' && a.room !== a.home).length;
  $('bar-status').innerHTML = `${brain?.brief?.date ? `brief <b>${brain.brief.date}</b> · ` : ''}memory <b>${store.where()}</b> · <b>${store.totalOpen()}</b> open orders · <b>${store.drafts().filter((d) => d.status === 'draft').length}</b> drafts waiting · ${away ? `<b>${away}</b> crew away from station` : 'all crew at station'}`;
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
