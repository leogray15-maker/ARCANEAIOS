/**
 * Draws the station into a 960x640 buffer at 1:1, then blits it to the
 * visible canvas at an integer scale with smoothing off. Labels are drawn
 * on the visible canvas after the blit so they stay legible at every zoom.
 *
 * Two layers inside the buffer:
 *   static  — void, hull, corridors, room floors, services, walls. Baked
 *             once and again only when hover/selection changes.
 *   live    — wall-mounted props per room, then every floor prop and every
 *             crew sprite in one list sorted by bottom edge, so a figure
 *             can stand behind a desk and in front of a rug.
 */
import { ROOM_BY_ID, WINGS, AGENT_BY_ID } from '@arcane/config';
import { PW, PH, PLAN, VCORR, CORR_X, CORR_WIDTH, HALL_Y, HALL_H, MARGIN, DOOR_W, WALL, PLAZA, ATRIUM_W, WINGS_BOTTOM } from '../config/floorplan.js';
import { ROOM_PROPS } from '../config/props.js';
import { PAINT, WALL_MOUNTED, isAnimated } from './props.js';
import { PX, accent } from './palette.js';

/** A tiny seeded PRNG so wear is the same on every load. */
function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

export function createBuffer() {
  const c = document.createElement('canvas');
  c.width = PW; c.height = PH;
  return c;
}

/* ============================================================
   STATIC LAYER
   ============================================================ */

export function bakeStatic(buf, { hover, selected } = {}) {
  const g = buf.getContext('2d');
  g.imageSmoothingEnabled = false;

  g.fillStyle = PX.space; g.fillRect(0, 0, PW, PH);
  g.fillStyle = PX.hullDark; g.fillRect(MARGIN - 10, MARGIN - 10, PW - 2 * MARGIN + 20, PH - 2 * MARGIN + 20);
  g.fillStyle = PX.hull; g.fillRect(MARGIN - 6, MARGIN - 6, PW - 2 * MARGIN + 12, PH - 2 * MARGIN + 12);
  g.fillStyle = PX.hullLit; g.fillRect(MARGIN - 6, MARGIN - 6, PW - 2 * MARGIN + 12, 1);

  // Service corridors either side, the atrium in the middle, the hall across all three, a passage to every door.
  drawGrate(g, CORR_X[0], MARGIN, CORR_WIDTH[0], WINGS_BOTTOM + 8 - MARGIN, 'v');
  drawGrate(g, CORR_X[2], MARGIN, CORR_WIDTH[2], WINGS_BOTTOM + 8 - MARGIN, 'v');
  drawAtrium(g);
  drawGrate(g, CORR_X[0], HALL_Y, CORR_X[2] + CORR_WIDTH[2] - CORR_X[0], HALL_H, 'h');
  drawPlaza(g);
  for (const p of PLAN) { const [px, py, pw, ph] = p.passage; if (pw > 0) drawGrate(g, px, py, pw, ph, 'h'); }
  drawCorridorWear(g);

  for (const p of PLAN) {
    const room = ROOM_BY_ID[p.id];
    const state = p.id === selected ? 'selected' : p.id === hover ? 'hover' : 'idle';
    drawRoomFloor(g, p, room);
    drawServices(g, p, room);
    drawRoomWalls(g, p, room, state);
    // Wall-mounted pieces that never move are part of the building.
    const [rx, ry] = p.rect;
    for (const prop of ROOM_PROPS[p.id].props) {
      if (WALL_MOUNTED.has(prop.type) && !isAnimated(prop)) PAINT[prop.type](g, rx + prop.x, ry + prop.y, prop.w, prop.h, prop.opts, 0);
    }
  }
}

/* ============================================================
   PROP CACHE — floor pieces that never move are painted once
   ============================================================ */

const GLOW_MARGIN = 40;
const propCache = new WeakMap();

function cachedFloorProp(prop) {
  let c = propCache.get(prop);
  if (c) return c;
  const cv = document.createElement('canvas');
  cv.width = prop.w + GLOW_MARGIN * 2; cv.height = prop.h + GLOW_MARGIN * 2;
  const cg = cv.getContext('2d');
  cg.imageSmoothingEnabled = false;
  PAINT[prop.type](cg, GLOW_MARGIN, GLOW_MARGIN, prop.w, prop.h, prop.opts, 0);
  c = { cv, ox: GLOW_MARGIN, oy: GLOW_MARGIN };
  propCache.set(prop, c);
  return c;
}

function drawGrate(g, x, y, w, h, dir) {
  g.fillStyle = PX.grate; g.fillRect(x, y, w, h);
  g.fillStyle = PX.grateLine;
  if (dir === 'v') { for (let yy = y; yy < y + h; yy += 8) g.fillRect(x + 4, yy, w - 8, 1); g.fillRect(x + w / 2, y, 1, h); }
  else { for (let xx = x; xx < x + w; xx += 8) g.fillRect(xx, y + 4, 1, h - 8); g.fillRect(x, y + h / 2, w, 1); }
  // Rivets along both edges, and the edges themselves darkened under the walls.
  g.fillStyle = PX.steel;
  if (dir === 'v') for (let yy = y + 6; yy < y + h; yy += 16) { g.fillRect(x + 2, yy, 1, 1); g.fillRect(x + w - 3, yy, 1, 1); }
  else for (let xx = x + 6; xx < x + w; xx += 16) { g.fillRect(xx, y + 2, 1, 1); g.fillRect(xx, y + h - 3, 1, 1); }
  g.fillStyle = 'rgba(0,0,0,0.28)';
  if (dir === 'v') { g.fillRect(x, y, 3, h); g.fillRect(x + w - 3, y, 3, h); } else { g.fillRect(x, y, w, 3); g.fillRect(x, y + h - 3, w, 3); }
}

/** The atrium: a polished tile floor rather than grating, a centre line, light strips down both walls. */
function drawAtrium(g) {
  const [x, w] = [CORR_X[1], CORR_WIDTH[1]];
  g.fillStyle = '#101019'; g.fillRect(x, MARGIN, w, PH - 2 * MARGIN);
  g.fillStyle = 'rgba(255,255,255,0.03)';
  for (let ty = MARGIN; ty < PH - MARGIN; ty += 24) for (let tx = x + (((ty - MARGIN) / 24) & 1 ? 12 : 0); tx < x + w; tx += 24) g.fillRect(tx, ty, 12, 12);
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let ty = MARGIN + 24; ty < PH - MARGIN; ty += 24) g.fillRect(x, ty, w, 1);
  g.fillStyle = hexA(PX.arcane, 0.35); g.fillRect(x + w / 2, MARGIN, 1, PH - 2 * MARGIN);
  for (const lx of [x + 2, x + w - 3]) { g.fillStyle = hexA(PX.arcane, 0.55); g.fillRect(lx, MARGIN + 8, 1, PH - 2 * MARGIN - 16); const gl = g.createLinearGradient(lx, 0, lx + (lx < x + w / 2 ? 14 : -14), 0); gl.addColorStop(0, hexA(PX.arcane, 0.16)); gl.addColorStop(1, hexA(PX.arcane, 0)); g.fillStyle = gl; g.fillRect(lx < x + w / 2 ? lx : lx - 14, MARGIN, 14, PH - 2 * MARGIN); }
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, MARGIN, 4, PH - 2 * MARGIN); g.fillRect(x + w - 4, MARGIN, 4, PH - 2 * MARGIN);
}

/** The plaza where the hall crosses the atrium: an emblem in the floor, four planters, two benches, a holo pillar. */
function drawPlaza(g) {
  const [x, y, w, h] = PLAZA; const cx = x + w / 2, cy = HALL_Y + HALL_H / 2;
  g.fillStyle = '#12121c'; g.fillRect(x, y, w, h);
  g.fillStyle = hexA(PX.gold, 0.25); g.fillRect(x + 3, y + 3, w - 6, 1); g.fillRect(x + 3, y + h - 4, w - 6, 1); g.fillRect(x + 3, y + 3, 1, h - 6); g.fillRect(x + w - 4, y + 3, 1, h - 6);
  // The emblem: a diamond in gold, and its shadow ring.
  g.strokeStyle = hexA(PX.gold, 0.35); g.lineWidth = 1;
  for (const r of [26, 18]) { g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath(); g.stroke(); }
  g.fillStyle = hexA(PX.gold, 0.5); g.fillRect(cx - 1, cy - 1, 2, 2);
  // The holo pillar at the centre, and its pool of light.
  PAINT.holo(g, cx - 8, cy - 22, 16, 18, { colour: 'arcane' }, 0);
  // Planters in the corners, benches on the long sides.
  for (const [px, py] of [[x + 6, y + 6], [x + w - 16, y + 6], [x + 6, y + h - 22], [x + w - 16, y + h - 22]]) PAINT.plant(g, px, py, 10, 16, {}, 0);
  PAINT.sofa(g, x + 8, cy - 5, 22, 10, { colour: '#3a3a52' }, 0); PAINT.sofa(g, x + w - 30, cy - 5, 22, 10, { colour: '#3a3a52' }, 0);
}

/** Scuff lines along the walking direction, and a little rust where corridors meet the hall. */
function drawCorridorWear(g) {
  const r = rng('corridors');
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (const c of [0, 2]) { const x = VCORR[c]; for (let i = 0; i < 14; i++) g.fillRect(x - 10 + r() * 20, MARGIN + r() * (WINGS_BOTTOM - MARGIN), 1, 4 + r() * 12); }
  for (let i = 0; i < 20; i++) g.fillRect(VCORR[0] + r() * (VCORR[2] - VCORR[0]), HALL_Y + 4 + r() * (HALL_H - 8), 4 + r() * 10, 1);
  g.fillStyle = hexA(PX.rust, 0.25);
  for (const c of [0, 2]) { const x = VCORR[c]; g.fillRect(x - CORR_WIDTH[c] / 2 + 2, HALL_Y - 2, 6, 4); g.fillRect(x + CORR_WIDTH[c] / 2 - 8, HALL_Y + HALL_H - 2, 6, 4); }
}

function drawRoomFloor(g, p, room) {
  const [x, y, w, h] = p.rect;
  const r = rng(room.id);
  g.fillStyle = PX.floor; g.fillRect(x, y, w, h);
  // 16px tiles: a grout line between them, and each tile a slightly different shade so the floor has grain.
  for (let ty = y + WALL; ty < y + h - WALL; ty += 16) for (let tx = x + WALL; tx < x + w - WALL; tx += 16) {
    const v = r();
    g.fillStyle = v < 0.25 ? PX.floorAlt : v > 0.92 ? '#111119' : PX.floor;
    g.fillRect(tx, ty, Math.min(16, x + w - WALL - tx), Math.min(16, y + h - WALL - ty));
  }
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let ty = y + WALL + 16; ty < y + h - WALL; ty += 16) g.fillRect(x + WALL, ty, w - 2 * WALL, 1);
  for (let tx = x + WALL + 16; tx < x + w - WALL; tx += 16) g.fillRect(tx, y + WALL, 1, h - 2 * WALL);
  // Cracks, scuffs, a stain and a drain — seeded from the room id so nothing moves between loads.
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 3; i++) { let cx = x + 20 + r() * (w - 40), cy = y + 34 + r() * (h - 44); for (let k = 0; k < 6; k++) { g.fillRect(cx, cy, 1, 1); cx += r() < 0.5 ? 1 : 0; cy += 1; if (r() < 0.3) cx -= 1; } }
  for (let i = 0; i < 14; i++) {
    g.globalAlpha = 0.25 + r() * 0.3; g.fillStyle = PX.wallDark;
    g.fillRect(x + 10 + r() * (w - 30), y + 30 + r() * (h - 40), 3 + r() * 14, 1 + (r() < 0.3 ? 1 : 0));
  }
  g.globalAlpha = 0.14; g.fillStyle = PX.rust;
  g.fillRect(x + 20 + r() * (w - 60), y + 34 + r() * (h - 50), 10 + r() * 16, 6 + r() * 10);
  g.globalAlpha = 1;
  const dx = x + 30 + r() * (w - 60), dy = y + h - 14;
  g.fillStyle = PX.wallDark; g.fillRect(dx, dy, 8, 4); g.fillStyle = PX.faint; g.fillRect(dx + 1, dy + 1, 2, 1); g.fillRect(dx + 5, dy + 1, 2, 1);
  // Occlusion: the floor is darkest in the corners and under the walls, lightest where the ceiling lights fall.
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(x, y, w, 7); g.fillRect(x, y, 7, h); g.fillRect(x + w - 7, y, 7, h); g.fillRect(x, y + h - 7, w, 7);
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    const ao = g.createRadialGradient(cx, cy, 4, cx, cy, 46);
    ao.addColorStop(0, 'rgba(0,0,0,0.42)'); ao.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = ao; g.fillRect(cx - 46, cy - 46, 92, 92);
  }
  const wash = g.createLinearGradient(0, y, 0, y + h);
  wash.addColorStop(0, hexA(accent(room.accent), 0.06)); wash.addColorStop(0.55, 'rgba(0,0,0,0)'); wash.addColorStop(1, 'rgba(0,0,0,0.2)');
  g.fillStyle = wash; g.fillRect(x, y, w, h);
  // Hazard stripes on the floor at the doorway.
  const [ddx, ddy] = p.door;
  PAINT.hazard(g, p.side === 'right' ? ddx - 14 : ddx + 4, ddy - DOOR_W / 2 - 2, 10, DOOR_W + 4, {}, 0);
}

/** Pipes along the top wall, two hanging fixtures, a conduit, a junction box, and the light pooling on the floor. */
function drawServices(g, p, room) {
  const [x, y, w] = p.rect;
  const c = accent(room.accent);
  // Main pipe with a shadow line, a thinner conduit under it, two brackets.
  g.fillStyle = PX.steel; g.fillRect(x + 6, y + WALL + 2, w - 12, 3);
  g.fillStyle = '#7a8090'; g.fillRect(x + 6, y + WALL + 2, w - 12, 1);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 6, y + WALL + 5, w - 12, 1);
  g.fillStyle = PX.faint; g.fillRect(x + 6, y + WALL + 7, w - 12, 1);
  g.fillStyle = PX.rust; g.fillRect(x + 30, y + WALL + 1, 3, 6); g.fillRect(x + w - 40, y + WALL + 1, 3, 6);
  g.fillStyle = PX.breach; g.fillRect(x + w - 60, y + WALL + 1, 2, 2);
  // Hanging fixtures: cord, shade, tube, and the pool of light on the floor beneath.
  for (const lx of [x + w * 0.3, x + w * 0.7]) {
    g.fillStyle = PX.faint; g.fillRect(lx, y + WALL + 5, 1, 4);
    g.fillStyle = '#2a2c38'; g.fillRect(lx - 9, y + WALL + 9, 18, 2); g.fillStyle = '#3e4050'; g.fillRect(lx - 9, y + WALL + 9, 18, 1);
    g.fillStyle = PX.ink; g.fillRect(lx - 7, y + WALL + 11, 14, 2);
    g.fillStyle = hexA(c, 0.5); g.fillRect(lx - 7, y + WALL + 13, 14, 1);
    const cone = g.createRadialGradient(lx, y + 60, 4, lx, y + 60, 58);
    cone.addColorStop(0, hexA(c, 0.16)); cone.addColorStop(0.6, hexA(c, 0.06)); cone.addColorStop(1, hexA(c, 0));
    g.fillStyle = cone; g.fillRect(lx - 58, y + 8, 116, 110);
  }
  g.fillStyle = PX.wallDark; g.fillRect(x + w - 22, y + WALL + 8, 10, 7);
  g.fillStyle = c; g.fillRect(x + w - 20, y + WALL + 10, 2, 2);
  g.fillStyle = PX.faint; g.fillRect(x + w - 17, y + WALL + 10, 4, 1); g.fillRect(x + w - 17, y + WALL + 12, 4, 1);
}

function drawRoomWalls(g, p, room, state) {
  const [x, y, w, h] = p.rect;
  const [, dy] = p.door;
  const lip = state === 'selected' ? accent(room.accent) : state === 'hover' ? PX.wallLip : PX.wallTop;

  g.fillStyle = PX.wallDark;
  g.fillRect(x - 1, y - 1, w + 2, WALL + 1); g.fillRect(x - 1, y + h - WALL, w + 2, WALL + 1);
  g.fillRect(x - 1, y - 1, WALL + 1, h + 2); g.fillRect(x + w - WALL, y - 1, WALL + 1, h + 2);
  g.fillStyle = PX.wall;
  g.fillRect(x, y, w, WALL); g.fillRect(x, y + h - WALL, w, WALL); g.fillRect(x, y, WALL, h); g.fillRect(x + w - WALL, y, WALL, h);
  g.fillStyle = lip;
  g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
  g.fillStyle = PX.wallLip; g.fillRect(x + 1, y + 1, w - 2, 1);
  // Panel seams on the top wall, and a skirting line where each wall meets the floor.
  g.fillStyle = PX.wallDark;
  for (let sx = x + 28; sx < x + w - 8; sx += 28) g.fillRect(sx, y + 2, 1, WALL - 2);
  g.fillRect(x + WALL, y + WALL, w - 2 * WALL, 1); g.fillRect(x + WALL, y + h - WALL - 1, w - 2 * WALL, 1);
  g.fillRect(x + WALL, y + WALL, 1, h - 2 * WALL); g.fillRect(x + w - WALL - 1, y + WALL, 1, h - 2 * WALL);

  const doorX = p.side === 'right' ? x + w - WALL - 1 : x - 1;
  g.fillStyle = PX.floor; g.fillRect(doorX, dy - DOOR_W / 2, WALL + 2, DOOR_W);
  g.fillStyle = PX.steel; g.fillRect(doorX, dy - DOOR_W / 2 - 2, WALL + 2, 2); g.fillRect(doorX, dy + DOOR_W / 2, WALL + 2, 2);
  const spillX = p.side === 'right' ? x + w + 1 : x - 9;
  g.fillStyle = hexA(accent(room.accent), state === 'idle' ? 0.10 : 0.24);
  g.fillRect(spillX, dy - DOOR_W / 2 - 2, 8, DOOR_W + 4);

  g.fillStyle = PX.wallDark; g.fillRect(x + 8, y + WALL + 14, Math.min(w - 40, 14 + room.name.length * 6), 10);
  g.fillStyle = accent(room.accent); g.fillRect(x + 8, y + WALL + 14, 2, 10);
  // The inner wings show the atrium a window: a glass strip in the wall away from the door.
  if (p.wing === 1 || p.wing === 2) {
    const wx = p.wing === 1 ? x + w - WALL : x, wy = y + 30;
    g.fillStyle = 'rgba(86,201,240,0.28)'; g.fillRect(wx, wy, WALL, 60);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(p.wing === 1 ? wx : wx + WALL - 1, wy, 1, 60);
    g.fillStyle = PX.steel; g.fillRect(wx, wy - 2, WALL, 2); g.fillRect(wx, wy + 60, WALL, 2); g.fillRect(wx, wy + 29, WALL, 2);
  }
}

/* ============================================================
   LIVE LAYER
   ============================================================ */

/**
 * Compose one frame: the static bake, every room's wall props, then floor
 * props and crew sorted together by their bottom edge.
 */
export function drawLive(buf, staticBuf, sim, sprites, t) {
  const g = buf.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(staticBuf, 0, 0);

  const floorItems = [];
  for (const p of PLAN) {
    const [rx, ry] = p.rect;
    for (const prop of ROOM_PROPS[p.id].props) {
      const ax = rx + prop.x, ay = ry + prop.y;
      const live = isAnimated(prop);
      if (WALL_MOUNTED.has(prop.type)) { if (live) PAINT[prop.type](g, ax, ay, prop.w, prop.h, prop.opts, t); continue; }
      if (live) floorItems.push({ y: ay + prop.h, draw: () => PAINT[prop.type](g, ax, ay, prop.w, prop.h, prop.opts, t) });
      else { const c = cachedFloorProp(prop); floorItems.push({ y: ay + prop.h, draw: () => g.drawImage(c.cv, ax - c.ox, ay - c.oy) }); }
    }
  }
  for (const a of sim.agents) floorItems.push({ kind: 'agent', y: a.y, draw: () => drawAgent(g, a, sprites.get(a.id), t) });
  floorItems.sort((p, q) => p.y - q.y);
  for (const it of floorItems) it.draw();
}

/** The walk plays contact → pass → contact → pass; the pass cel is raised a pixel so the body bobs. */
const WALK = ['stepA', 'stepB', 'stepC', 'stepB'];

function drawAgent(g, a, sprite, t) {
  if (!sprite) return;
  const { w, h, frames } = sprite;
  const moving = a.state === 'walk' || a.state === 'drift';
  const cel = moving ? WALK[a.cel] : a.talking ? (Math.floor(t * 2.5 + a.phase) % 2 ? 'talk' : 'stand') : a.working ? 'work' : a.blinking ? 'blink' : 'stand';
  const lift = moving && cel === 'stepB' ? 1 : a.bob;
  const fx = Math.round(a.x - w / 2), fy = Math.round(a.y - h - lift);
  // Contact shadow, and the commander's pulse on the floor.
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(fx + 3, a.y - 1, w - 6, 2);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(fx + 1, a.y - 1, w - 2, 1);
  if (a.cfg.kind === 'arcane') {
    const pulse = 0.14 + 0.1 * (0.5 + 0.5 * Math.sin(t * 2.1));
    const gr = g.createRadialGradient(a.x, a.y - 2, 2, a.x, a.y - 2, 26);
    gr.addColorStop(0, hexA(PX.arcaneLt, pulse)); gr.addColorStop(1, hexA(PX.arcaneLt, 0));
    g.fillStyle = gr; g.fillRect(a.x - 26, a.y - 28, 52, 52);
  }
  g.drawImage(frames[a.face][cel], fx, fy);
}

/* ============================================================
   PRESENT — blit + labels + atmosphere at display resolution
   ============================================================ */

export function present(canvas, buf, view, { hover, selected } = {}, sim = null, dpr = 1) {
  const g = canvas.getContext('2d');
  // Work in CSS pixels; the transform puts every fill and blit on device pixels.
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = false;
  const W = canvas.width / dpr, H = canvas.height / dpr;
  g.fillStyle = PX.space; g.fillRect(0, 0, W, H);
  g.drawImage(buf, 0, 0, PW, PH, view.x, view.y, PW * view.scale, PH * view.scale);

  const s = view.scale;
  g.textBaseline = 'top';
  for (const p of PLAN) {
    const room = ROOM_BY_ID[p.id];
    const [x, y, w] = p.rect;
    const px = view.x + (x + 12) * s, py = view.y + (y + WALL + 15) * s;
    // The name belongs to the room, so it never leaves it: on a phone the
    // whole plan is a third of its size and a full name would run over the
    // wall into the next wing. Shrink first, then clip.
    const max = (w - 24) * s;
    let size = Math.max(9, 4.5 * s);
    g.font = `${size}px ui-monospace, Menlo, monospace`;
    let text = room.name;
    const width = g.measureText(text).width;
    if (width > max) {
      size = Math.max(7, size * (max / width));
      g.font = `${size}px ui-monospace, Menlo, monospace`;
      while (text.length > 4 && g.measureText(`${text}\u2026`).width > max) text = text.slice(0, -1);
      if (text !== room.name) text += '\u2026';
    }
    g.fillStyle = p.id === selected ? accent(room.accent) : p.id === hover ? PX.ink : PX.ash;
    g.fillText(text, px, py);
  }
  // Equipment labels at 2x and above: a dark plate and the name, like the signage in the references.
  if (s >= 2) {
    g.font = `${Math.max(7, 2.6 * s)}px ui-monospace, Menlo, monospace`;
    for (const p of PLAN) {
      const [rx, ry] = p.rect;
      for (const prop of ROOM_PROPS[p.id].props) {
        const items = prop.opts.labels ? prop.opts.labels.map((l, i, arr) => [l, prop.x + i * ((prop.w - (arr.length - 1) * 2) / arr.length + 2) + 3, prop.y + 2, true]) : prop.opts.label ? (prop.y < 36 ? [[prop.opts.label, prop.x + 3, prop.y + 2, true]] : [[prop.opts.label, prop.x, prop.y - 6, false]]) : [];
        for (const [text, lx, ly, inside] of items) {
          const tx = view.x + (rx + lx) * s, ty = view.y + (ry + ly) * s;
          const tw = g.measureText(text).width + 4;
          g.fillStyle = inside ? 'rgba(8,10,18,0.85)' : 'rgba(10,10,16,0.82)'; g.fillRect(tx - 2, ty - 1, tw, 3 * s);
          g.fillStyle = inside ? accent(ROOM_BY_ID[p.id].accent) : '#b8b0c8'; g.fillText(text, tx, ty);
        }
      }
    }
  }
  // Name tags over the crew at 2x and above, so you can tell who is walking.
  if (sim && s >= 2) {
    g.font = `${Math.max(8, 3.2 * s)}px ui-monospace, Menlo, monospace`;
    g.textAlign = 'center';
    for (const a of sim.agents) {
      if (a.cfg.kind !== 'arcane' && a.state !== 'walk' && a.state !== 'drift' && a.id !== hover) continue;
      const tx = view.x + a.x * s, ty = view.y + (a.y - (a.cfg.kind === 'arcane' ? 28 : 24)) * s;
      g.fillStyle = 'rgba(5,5,10,0.7)'; const tw = g.measureText(a.cfg.name).width + 6; g.fillRect(tx - tw / 2, ty - 1, tw, 3.6 * s);
      g.fillStyle = a.cfg.colour; g.fillText(a.cfg.name, tx, ty);
    }
    g.textAlign = 'left';
  }
  g.font = `${Math.max(9, 4 * s)}px ui-monospace, Menlo, monospace`;
  g.fillStyle = PX.faint;
  WINGS.forEach((w, i) => { const first = PLAN.find((p) => p.wing === i && p.row === 0); g.fillText(`${w.no} ${w.name}`, view.x + (first.rect[0] + 2) * s, view.y + (MARGIN - 14) * s); });

  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.06)';
  for (let yy = 0; yy < H; yy += 2) g.fillRect(0, yy, W, 1);
}
