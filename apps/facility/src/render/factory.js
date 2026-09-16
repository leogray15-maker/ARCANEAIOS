/**
 * Draws the station into a 960x640 buffer at 1:1, then blits it to the
 * visible canvas at an integer scale with smoothing off. Labels are drawn
 * on the visible canvas after the blit so they stay legible at every zoom.
 *
 * Day-4 shell: shell, corridors, hall, rooms with real walls and doors,
 * the services layer, wear. Props and crew arrive on days 5–7 and slot in
 * between `drawRoomFloor` and `drawRoomWalls`.
 */
import { ROOMS, ROOM_BY_ID, WINGS, AGENT_BY_ID } from '@arcane/config';
import { PW, PH, PLAN, VCORR, CORR_W, HALL_Y, HALL_H, MARGIN, DOOR_W, WALL } from '../config/floorplan.js';
import { PX, accent } from './palette.js';

/** A tiny seeded PRNG so wear is the same on every load. */
function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function createBuffer() {
  const c = document.createElement('canvas');
  c.width = PW; c.height = PH;
  return c;
}

export function drawStation(buf, { hover, selected } = {}) {
  const g = buf.getContext('2d');
  g.imageSmoothingEnabled = false;

  // The void and the hull.
  g.fillStyle = PX.space; g.fillRect(0, 0, PW, PH);
  g.fillStyle = PX.hullDark; g.fillRect(MARGIN - 10, MARGIN - 10, PW - 2 * MARGIN + 20, PH - 2 * MARGIN + 20);
  g.fillStyle = PX.hull; g.fillRect(MARGIN - 6, MARGIN - 6, PW - 2 * MARGIN + 12, PH - 2 * MARGIN + 12);
  g.fillStyle = PX.hullLit; g.fillRect(MARGIN - 6, MARGIN - 6, PW - 2 * MARGIN + 12, 1);

  // Corridors and the hall are service floor: grating with a centre line.
  for (const x of VCORR) drawGrate(g, x - CORR_W / 2, MARGIN, CORR_W, PH - 2 * MARGIN, 'v');
  drawGrate(g, VCORR[0] - CORR_W / 2, HALL_Y, VCORR[2] - VCORR[0] + CORR_W, HALL_H, 'h');

  // Rooms.
  for (const p of PLAN) {
    const room = ROOM_BY_ID[p.id];
    const state = p.id === selected ? 'selected' : p.id === hover ? 'hover' : 'idle';
    drawRoomFloor(g, p, room);
    drawServices(g, p, room);
    drawRoomWalls(g, p, room, state);
  }
}

function drawGrate(g, x, y, w, h, dir) {
  g.fillStyle = PX.grate; g.fillRect(x, y, w, h);
  g.fillStyle = PX.grateLine;
  if (dir === 'v') { for (let yy = y; yy < y + h; yy += 8) g.fillRect(x + 4, yy, w - 8, 1); g.fillRect(x + w / 2, y, 1, h); }
  else { for (let xx = x; xx < x + w; xx += 8) g.fillRect(xx, y + 4, 1, h - 8); g.fillRect(x, y + h / 2, w, 1); }
}

function drawRoomFloor(g, p, room) {
  const [x, y, w, h] = p.rect;
  g.fillStyle = PX.floor; g.fillRect(x, y, w, h);
  // Alternating tiles, very subtle — enough to give the floor a grain.
  g.fillStyle = PX.floorAlt;
  for (let ty = y + WALL; ty < y + h - WALL; ty += 12)
    for (let tx = x + WALL + (((ty - y) / 12) & 1 ? 12 : 0); tx < x + w - WALL; tx += 24)
      g.fillRect(tx, ty, 12, 12);
  // Wear: scuffs and a stain, seeded from the room id so it never moves.
  const r = rng(room.id);
  g.fillStyle = PX.wallDark;
  for (let i = 0; i < 10; i++) {
    const sx = x + 10 + r() * (w - 30), sy = y + 10 + r() * (h - 24);
    g.globalAlpha = 0.35 + r() * 0.3;
    g.fillRect(sx, sy, 3 + r() * 14, 1 + (r() < 0.3 ? 1 : 0));
  }
  g.globalAlpha = 0.18; g.fillStyle = PX.rust;
  g.fillRect(x + 20 + r() * (w - 60), y + 20 + r() * (h - 50), 10 + r() * 16, 6 + r() * 10);
  g.globalAlpha = 1;
  // Darkened edges so the floor sits under the walls.
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(x, y, w, 6); g.fillRect(x, y, 6, h); g.fillRect(x + w - 6, y, 6, h); g.fillRect(x, y + h - 6, w, 6);
}

/** Pipes along the top wall, two ceiling lights, a junction box, and the floor glow of the lights. */
function drawServices(g, p, room) {
  const [x, y, w] = p.rect;
  g.fillStyle = PX.steel; g.fillRect(x + 6, y + WALL + 2, w - 12, 3);
  g.fillStyle = PX.faint; g.fillRect(x + 6, y + WALL + 5, w - 12, 1);
  for (const lx of [x + w * 0.3, x + w * 0.7]) {
    g.fillStyle = PX.ink; g.fillRect(lx - 8, y + WALL + 8, 16, 2);
    const glow = g.createRadialGradient(lx, y + WALL + 9, 2, lx, y + WALL + 9, 46);
    glow.addColorStop(0, hexA(accent(room.accent), 0.16)); glow.addColorStop(1, hexA(accent(room.accent), 0));
    g.fillStyle = glow; g.fillRect(lx - 46, y, 92, 70);
  }
  g.fillStyle = PX.wallDark; g.fillRect(x + w - 22, y + WALL + 8, 10, 7);
  g.fillStyle = accent(room.accent); g.fillRect(x + w - 20, y + WALL + 10, 2, 2);
}

function drawRoomWalls(g, p, room, state) {
  const [x, y, w, h] = p.rect;
  const [dx, dy] = p.door;
  const lip = state === 'selected' ? accent(room.accent) : state === 'hover' ? PX.wallLip : PX.wallTop;

  // Outer cast shadow, wall body, top lip — with the doorway cut out of all three.
  g.fillStyle = PX.wallDark;
  g.fillRect(x - 1, y - 1, w + 2, WALL + 1); g.fillRect(x - 1, y + h - WALL, w + 2, WALL + 1);
  g.fillRect(x - 1, y - 1, WALL + 1, h + 2); g.fillRect(x + w - WALL, y - 1, WALL + 1, h + 2);
  g.fillStyle = PX.wall;
  g.fillRect(x, y, w, WALL); g.fillRect(x, y + h - WALL, w, WALL); g.fillRect(x, y, WALL, h); g.fillRect(x + w - WALL, y, WALL, h);
  g.fillStyle = lip;
  g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
  g.fillStyle = PX.wallLip; g.fillRect(x + 1, y + 1, w - 2, 1);

  // The doorway: cut, frame, and a spill of the room's light onto the corridor.
  const side = p.side;
  const doorX = side === 'right' ? x + w - WALL - 1 : x - 1;
  g.fillStyle = PX.floor; g.fillRect(doorX, dy - DOOR_W / 2, WALL + 2, DOOR_W);
  g.fillStyle = PX.steel; g.fillRect(doorX, dy - DOOR_W / 2 - 2, WALL + 2, 2); g.fillRect(doorX, dy + DOOR_W / 2, WALL + 2, 2);
  const spillX = side === 'right' ? x + w + 1 : x - 9;
  g.fillStyle = hexA(accent(room.accent), state === 'idle' ? 0.10 : 0.22);
  g.fillRect(spillX, dy - DOOR_W / 2 - 2, 8, DOOR_W + 4);

  // The sign plate, top-left inside the wall. Text is drawn at display resolution.
  g.fillStyle = PX.wallDark; g.fillRect(x + 8, y + WALL + 14, Math.min(w - 40, 14 + room.name.length * 6), 10);
  g.fillStyle = accent(room.accent); g.fillRect(x + 8, y + WALL + 14, 2, 10);
}

/** Blit the buffer at an integer scale and draw the labels at display resolution. */
export function present(canvas, buf, view, { hover, selected } = {}) {
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = PX.space; g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(buf, 0, 0, PW, PH, view.x, view.y, PW * view.scale, PH * view.scale);

  const s = view.scale;
  g.textBaseline = 'top';
  for (const p of PLAN) {
    const room = ROOM_BY_ID[p.id];
    const [x, y] = p.rect;
    const px = view.x + (x + 12) * s, py = view.y + (y + WALL + 15) * s;
    g.font = `${Math.max(9, 4.5 * s)}px ui-monospace, Menlo, monospace`;
    g.fillStyle = p.id === selected ? accent(room.accent) : p.id === hover ? PX.ink : PX.ash;
    g.fillText(room.name, px, py);
    if (s >= 2 && room.agent) {
      const a = AGENT_BY_ID[room.agent];
      g.font = `${Math.max(8, 3.5 * s)}px ui-monospace, Menlo, monospace`;
      g.fillStyle = a.colour;
      g.fillText(a.name, px, py + 6 * s);
    }
  }
  // Wing captions along the top hull.
  g.font = `${Math.max(9, 4 * s)}px ui-monospace, Menlo, monospace`;
  g.fillStyle = PX.faint;
  WINGS.forEach((w, i) => {
    const px = view.x + (MARGIN + (204 + CORR_W) * i + 2) * s, py = view.y + (MARGIN - 14) * s;
    g.fillText(`${w.no} ${w.name}`, px, py);
  });

  // Atmosphere: vignette and scanlines at display resolution.
  const vg = g.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.35, canvas.width / 2, canvas.height / 2, canvas.height * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = vg; g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = 'rgba(0,0,0,0.06)';
  for (let yy = 0; yy < canvas.height; yy += 2) g.fillRect(0, yy, canvas.width, 1);
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
