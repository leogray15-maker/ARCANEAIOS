/**
 * THE ARCANE — facility shell.
 *
 * One buffer, one canvas, integer zoom, drag to pan, click a room to open
 * its dashboard. The commander's walk and the crew arrive on days 5–6;
 * this file already owns the loop they will run in.
 */
import { PW, PH, roomAt } from './config/floorplan.js';
import { createBuffer, drawStation, present } from './render/factory.js';
import { renderPanel } from './render/panel.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('floor');
const panel = document.getElementById('panel');
const buf = createBuffer();

const view = { scale: 2, x: 0, y: 0, mode: 'fit' };
const state = { hover: null, selected: null, dirty: true };

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
  state.dirty = true;
}
function resize() {
  canvas.width = stage.clientWidth; canvas.height = stage.clientHeight;
  if (view.mode === 'fit') fit();
  state.dirty = true;
}

const toBuffer = (e) => ({ x: (e.clientX - stage.getBoundingClientRect().left - view.x) / view.scale, y: (e.clientY - stage.getBoundingClientRect().top - view.y) / view.scale });

let drag = null;
stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; stage.setPointerCapture(e.pointerId); });
stage.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; stage.classList.add('dragging'); view.mode = 'pan'; view.x = drag.vx + dx; view.y = drag.vy + dy; state.dirty = true; }
    return;
  }
  const p = toBuffer(e); const r = roomAt(p.x, p.y);
  const id = r ? r.id : null;
  if (id !== state.hover) { state.hover = id; state.dirty = true; }
});
stage.addEventListener('pointerup', (e) => {
  stage.classList.remove('dragging');
  const wasDrag = drag?.moved; drag = null;
  if (wasDrag) return;
  const p = toBuffer(e); const r = roomAt(p.x, p.y);
  state.selected = r ? r.id : null;
  renderPanel(panel, state.selected);
  state.dirty = true;
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { state.selected = null; renderPanel(panel, null); state.dirty = true; } });
for (const b of document.querySelectorAll('#hud button')) b.addEventListener('click', () => setZoom(b.dataset.zoom));
window.addEventListener('resize', resize);

function frame() {
  if (state.dirty) {
    drawStation(buf, state);
    present(canvas, buf, view, state);
    state.dirty = false;
  }
  requestAnimationFrame(frame);
}

renderPanel(panel, null);
resize();
setZoom('fit');
frame();
