/**
 * THE ARCANE — facility.
 *
 * One buffer, one canvas, integer zoom, drag to pan. Click a room: its
 * dashboard opens and the commander walks there. The crew idle at their
 * stations and drift about their rooms. Rendering runs at a fixed 30 fps;
 * pixel art does not need more and the props redraw every frame.
 */
import { AGENTS } from '@arcane/config';
import { PW, PH, PLAN_BY_ID, roomAt } from './config/floorplan.js';
import { createBuffer, bakeStatic, drawLive, present } from './render/factory.js';
import { bakeSprites } from './render/sprites.js';
import { renderPanel, bindPanel } from './render/panel.js';
import { Sim } from './core/sim.js';
import { Store } from './core/store.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('floor');
const panel = document.getElementById('panel');
const staticBuf = createBuffer();
const buf = createBuffer();
const sprites = bakeSprites(AGENTS);
const view = { scale: 2, x: 0, y: 0, mode: 'fit' };
const state = { hover: null, selected: null, staticDirty: true };

// The brain export is baked into the site at build time; without it the
// store still works from its seeds, and the dashboards say so.
let brain = null;
try { const r = await fetch('/brain.json', { cache: 'no-store' }); if (r.ok) brain = await r.json(); } catch {}
const store = new Store(brain);
store.sessionStart = Date.now();
store.loadCloud().then((ok) => { if (ok) refreshPanel(); });
const sim = new Sim(store);
const ctx = { sim, store, brain };
const refreshPanel = () => renderPanel(panel, state.selected, ctx);
store.onChange(() => refreshPanel());
bindPanel(panel, { store, getRoom: () => state.selected });

function fit() {
  const s = Math.max(1, Math.floor(Math.min(stage.clientWidth / PW, stage.clientHeight / PH)));
  view.scale = s;
  view.x = Math.floor((stage.clientWidth - PW * s) / 2);
  view.y = Math.floor((stage.clientHeight - PH * s) / 2);
}
function setZoom(mode) {
  view.mode = mode;
  if (mode === 'fit') fit();
  else {
    const cx = stage.clientWidth / 2, cy = stage.clientHeight / 2;
    const bx = (cx - view.x) / view.scale, by = (cy - view.y) / view.scale;
    view.scale = Number(mode);
    view.x = Math.floor(cx - bx * view.scale); view.y = Math.floor(cy - by * view.scale);
  }
  for (const b of document.querySelectorAll('#hud button')) b.classList.toggle('on', b.dataset.zoom === mode);
}
function resize() {
  canvas.width = stage.clientWidth; canvas.height = stage.clientHeight;
  if (view.mode === 'fit') fit();
}

const toBuffer = (e) => { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.scale, y: (e.clientY - r.top - view.y) / view.scale }; };

let drag = null;
stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; stage.setPointerCapture(e.pointerId); });
stage.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; stage.classList.add('dragging'); view.mode = 'pan'; view.x = drag.vx + dx; view.y = drag.vy + dy; }
    return;
  }
  const p = toBuffer(e); const r = roomAt(p.x, p.y);
  const id = r ? r.id : null;
  if (id !== state.hover) { state.hover = id; state.staticDirty = true; }
});
stage.addEventListener('pointerup', (e) => {
  stage.classList.remove('dragging');
  const wasDrag = drag?.moved; drag = null;
  if (wasDrag) return;
  const p = toBuffer(e); const r = roomAt(p.x, p.y);
  state.selected = r ? r.id : null;
  if (r) sim.command(r.id);
  refreshPanel();
  state.staticDirty = true;
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { state.selected = null; refreshPanel(); state.staticDirty = true; } });
for (const b of document.querySelectorAll('#hud button')) b.addEventListener('click', () => setZoom(b.dataset.zoom));
window.addEventListener('resize', resize);

const FRAME = 1000 / 30;
let last = performance.now(), acc = 0, panelClock = 0, occupantsKey = '';

function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  sim.update(dt);
  acc += dt * 1000;
  if (acc >= FRAME) {
    acc %= FRAME;
    if (state.staticDirty) { bakeStatic(staticBuf, state); state.staticDirty = false; }
    drawLive(buf, staticBuf, sim, sprites, now / 1000);
    present(canvas, buf, view, state, sim);
  }
  // Keep the open dashboard's "here now" line honest without re-rendering it every frame.
  panelClock += dt;
  if (state.selected && panelClock > 0.5) {
    panelClock = 0;
    const key = sim.occupants(state.selected).map((a) => a.id + a.state).join();
    if (key !== occupantsKey) { occupantsKey = key; refreshPanel(); }
  }
  requestAnimationFrame(loop);
}

window.addEventListener('error', (e) => { panel.insertAdjacentHTML('afterbegin', `<p style="color:var(--breach)">runtime error: ${e.message} (${e.filename?.split('/').pop()}:${e.lineno})</p>`); });

/** Centre the view on a room at the current scale. */
function centreOn(roomId) {
  const p = PLAN_BY_ID[roomId]; if (!p) return;
  const [x, y, w, h] = p.rect;
  view.x = Math.floor(stage.clientWidth / 2 - (x + w / 2) * view.scale);
  view.y = Math.floor(stage.clientHeight / 2 - (y + h / 2) * view.scale);
  view.mode = 'pan';
}

// Deep links: ?zoom=2|3 and ?room=<id> open the floor already zoomed and on a room.
const params = new URLSearchParams(location.search);
refreshPanel();
resize();
setZoom(['2', '3'].includes(params.get('zoom')) ? params.get('zoom') : 'fit');
if (params.get('room') && PLAN_BY_ID[params.get('room')]) {
  state.selected = params.get('room');
  centreOn(state.selected);
  sim.command(state.selected);
  refreshPanel();
  state.staticDirty = true;
}
loop(performance.now());
