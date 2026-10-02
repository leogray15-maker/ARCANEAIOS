/**
 * The detailed builders: the pieces that make a room read as the room it
 * is, at the distance the operator actually looks from.
 *
 * Two kinds live here. Upgrades of furniture types from config/props.js —
 * desks with drawers, office chairs on five-star bases, lab fridges with
 * stocked shelves behind glass, the HPLC as a stack of modules with its
 * solvent bottles, the car as a lacquered body with a silhouette — and
 * dressing types that only the 3D floor draws (rooms3d.js places them):
 * a fume hood, a lab sink, a safety shower, tool chests, tyre stacks, an
 * EV charger, pendant and strip lights, shelving on the side walls, floor
 * tape. Dressing never changes what a room is or where the crew walk; it
 * is set dressing, so the pixel plan and its tests do not see it.
 *
 * Returns true when it built the piece, so props3d.js falls back to its
 * own simpler builder for everything else.
 */
import * as THREE from 'three';
import { accentOf, TONE } from './materials.js';

const LIQUID = ['#5ec4e2', '#4fc58a', '#e0a64e', '#d6728f', '#8f80ee', '#c9dcf0'];

export function buildDetail(k, p, ctx, h) {
  const { oz, backZ, WH, pools } = ctx;
  const { r, o, tint, x0, x1, cx, w, depth, zOf, panelY, wallZ, pool, screen, monitor } = h;

  /* ---------- small shared pieces ---------- */
  const handle = (x, y, z, len = 3, vertical = false) => k.box(vertical ? 0.5 : len, vertical ? len : 0.5, 0.6, x, y, z, 'chrome', { cast: false });
  const drawers = (x, y0, z, dw, dh, n) => { for (let i = 0; i < n; i++) { const y = y0 + (dh / n) * (i + 0.5); k.box(dw - 0.6, 0.18, 0.2, x, y0 + (dh / n) * i, z, 'black', { cast: false }); handle(x, y + dh / n * 0.2, z + 0.3, Math.min(4, dw * 0.4)); } };
  /** A cluster of laboratory glass on a surface: flasks, beakers, a rack of tubes, each with a little lit liquid. */
  const glassware = (x, y0, z, span = 10, n = 5) => {
    for (let i = 0; i < n; i++) {
      const gx = x - span / 2 + (span / Math.max(1, n - 1)) * i + (r() - 0.5), gz = z + (r() - 0.5) * 2, col = LIQUID[Math.floor(r() * LIQUID.length)];
      const kind = Math.floor(r() * 3);
      if (kind === 0) { k.cyl(0.35, 1.3, 2.4, gx, y0 + 1.2, gz, 'clearglass', { seg: 12, cast: false }); k.cyl(0.35, 0.35, 1.2, gx, y0 + 3, gz, 'clearglass', { seg: 8, cast: false }); k.cyl(0.5, 1.1, 1, gx, y0 + 0.5, gz, 'glow', { colour: col, a: 0.55, seg: 12, cast: false }); }
      else if (kind === 1) { k.cyl(0.9, 0.9, 2.2, gx, y0 + 1.1, gz, 'clearglass', { seg: 12, open: true, cast: false }); k.cyl(0.8, 0.8, 1.2, gx, y0 + 0.6, gz, 'glow', { colour: col, a: 0.5, seg: 12, cast: false }); }
      else { k.block(3, 0.8, 1.6, gx, y0, gz, 'ceramic'); for (let t = 0; t < 4; t++) { k.cyl(0.25, 0.25, 2.6, gx - 1.1 + t * 0.73, y0 + 1.5, gz, 'clearglass', { seg: 6, cast: false }); k.cyl(0.22, 0.22, 1.1, gx - 1.1 + t * 0.73, y0 + 0.9, gz, 'glow', { colour: LIQUID[(t + i) % LIQUID.length], a: 0.6, seg: 6, cast: false }); } }
    }
  };
  /** Thin flat monitor on a stand, its back to the wall it faces away from. */
  const display = (x, y0, z, mw = 10, kind = 'data', colour = tint) => {
    k.block(3.2, 0.3, 2.2, x, y0, z, 'black'); k.block(0.6, 3, 0.6, x, y0, z - 0.4, 'steel');
    const sh = mw * 0.56, sy = y0 + 3 + sh / 2;
    k.box(mw + 0.5, sh + 0.5, 0.5, x, sy, z - 0.2, 'black');
    k.face(mw, sh, x, sy, z + 0.08, `screen:${kind}:${colour}:${Math.floor(r() * 3)}`);
    pool(x, z + 3, mw * 1.2, colour, 0.16);
  };
  /** Something hung from the ceiling: a cord from above the walls down to `y`. */
  const cord = (x, y, z) => k.cyl(0.12, 0.12, WH + 16 - y, x, (WH + 16 + y) / 2, z, 'black', { seg: 4, cast: false });
  const local = (px, py) => [ctx.ox + px, oz + py];

  switch (p.type) {
    /* ============ THE LAB ============ */
    case 'coldstore': {
      const d = 11, z = zOf(d), H = 38;
      if (o.kind === 'cryo') {
        // Liquid nitrogen: a steel dewar on a dolly, a gauge, a vent, frost at the neck.
        const rad = Math.min(w, 14) / 2 - 0.5;
        k.cyl(rad + 1, rad + 1, 1.2, cx, 0.6, z, 'black', { seg: 20 });
        k.cyl(rad, rad, 22, cx, 12.6, z, 'chrome', { seg: 24 });
        k.sphere(rad, cx, 23.6, z, 'chrome', { detail: 2, scale: [1, 0.45, 1] });
        k.cyl(rad * 0.35, rad * 0.35, 4, cx, 27, z, 'steel', { seg: 12 });
        k.cyl(rad * 0.45, rad * 0.45, 0.6, cx, 26, z, 'glow', { colour: TONE.cold, a: 0.5, seg: 12, cast: false });
        k.cyl(1.2, 1.2, 0.8, cx + rad * 0.5, 28, z + 1, 'black', { rot: [Math.PI / 2, 0, 0], seg: 12 });
        k.cyl(1, 1, 0.3, cx + rad * 0.5, 28, z + 1.5, 'glow', { colour: TONE.green, a: 0.6, rot: [Math.PI / 2, 0, 0], seg: 12, cast: false });
        k.box(rad * 1.2, 2.4, 0.2, cx, 14, z + rad + 0.05, 'paint', { colour: '#2a5fa0', cast: false });
        return true;
      }
      // An upright lab fridge: a ceramic carcass, a glass door with lit shelves of sample boxes behind it, a display, a vent.
      k.block(w, H, d, cx, 0.8, z, 'ceramic');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.block(0.8, 0.8, 0.8, cx + sx * (w / 2 - 1), 0, z + sz * (d / 2 - 1), 'black');
      const fz = z + d / 2;
      k.box(w - 2.4, H - 10, 0.3, cx, H / 2 - 1, fz + 0.2, 'clearglass', { cast: false });
      for (let s = 0; s < 4; s++) {
        const sy = 6 + s * 6.5;
        k.box(w - 3.4, 0.25, d - 2, cx, sy, z, 'steel', { cast: false });
        for (let i = 0; i < Math.floor((w - 4) / 2.6); i++) k.block(2.1, 1.6 + r() * 1.6, 3, x0 + 2.6 + i * 2.6, sy + 0.15, z + (r() - 0.5) * 2, 'paint', { colour: ['#d8dde3', '#9ec6de', '#e7c98a', '#b8d8b0', '#e0a4b4'][Math.floor(r() * 5)], cast: false });
      }
      k.box(w - 3, 0.4, 0.2, cx, H - 5.5, fz + 0.3, 'glow', { colour: TONE.cold, a: 0.8, cast: false });
      pool(cx, fz + 0.4, w * 0.6, TONE.cold, 0.14, 'wall', H / 2);
      k.face(w * 0.36, 2.4, cx - w * 0.2, H - 1.6, fz + 0.15, `screen:panel:${TONE.cyan}:${Math.floor(r() * 3)}`);
      k.box(1.4, 1.4, 0.2, x1 - 2.4, H - 1.6, fz + 0.15, 'led0', { colour: TONE.green, cast: false });
      handle(x1 - 1.8, H / 2, fz + 0.7, 14, true);
      for (let i = 0; i < 3; i++) k.box(w - 3, 0.35, 0.3, cx, 2 + i * 1, fz + 0.1, 'black', { cast: false });
      pool(cx, fz + 6, w * 0.8, TONE.cyan, 0.1);
      return true;
    }
    case 'balance': {
      // An analytical balance: a ceramic body, a glass draught shield on a steel frame, the pan, a lit readout.
      const d = depth(0.6, 8), z = zOf(d), bh = 9;
      k.block(w, bh, d, cx, 0, z, 'black'); k.block(w - 1, 1, d - 1, cx, bh, z, 'ceramic');
      const sw = w * 0.62, sd = d * 0.7, sx = cx - w * 0.12;
      k.block(sw, 6, sd, sx, bh + 1, z, 'clearglass', { cast: false });
      for (const ex of [-1, 1]) for (const ez of [-1, 1]) k.block(0.35, 6, 0.35, sx + ex * sw / 2, bh + 1, z + ez * sd / 2, 'steel', { cast: false });
      k.block(sw, 0.4, sd, sx, bh + 7, z, 'ceramic');
      k.cyl(1.6, 1.6, 0.2, sx, bh + 1.3, z, 'chrome', { seg: 16 });
      k.face(w * 0.28, 2, x1 - w * 0.17, bh - 3, z + d / 2 + 0.05, `screen:panel:${TONE.green}:1`);
      return true;
    }
    case 'coa': {
      // The certificate-of-analysis station: a steel bench on cabinets, a microscope, a monitor, glass waiting to be read.
      const d = depth(0.75, 10), H = 12, z = zOf(d);
      k.block(w, 1.2, d, cx, H - 1.2, z, 'steel'); k.box(w, 0.3, 0.3, cx, H - 0.15, z + d / 2, 'trim', { cast: false });
      k.block(w - 1, H - 1.2, d - 1.2, cx, 0, z - 0.2, 'ceramic');
      for (let i = 0; i < 3; i++) drawers(x0 + (w / 3) * (i + 0.5), 1, z + d / 2 - 0.5, w / 3 - 1, H - 3, 2);
      // microscope
      const mx = x0 + w * 0.2, mz = z - 1;
      k.block(5, 1, 4, mx, H, mz, 'ceramic'); k.block(1.4, 7, 1.6, mx, H + 1, mz - 1.4, 'ceramic', { rot: [-0.15, 0, 0] });
      k.block(3.4, 0.6, 3, mx, H + 3.4, mz + 0.4, 'black');
      k.cyl(0.6, 0.6, 3.6, mx, H + 6.4, mz + 0.4, 'black', { rot: [-0.6, 0, 0], seg: 10 });
      k.cyl(0.45, 0.45, 2, mx, H + 8.2, mz - 0.6, 'black', { rot: [-0.6, 0, 0], seg: 8 });
      k.cyl(0.5, 0.5, 0.2, mx, H + 3.1, mz + 0.4, 'glow', { colour: TONE.cold, seg: 10, cast: false });
      display(x0 + w * 0.5, H, z - d / 4, 10, 'chart', TONE.cyan);
      glassware(x0 + w * 0.82, H, z, 8, 4);
      pool(cx, z, w * 0.7, TONE.cold, 0.14);
      return true;
    }
    case 'packbench': {
      const d = depth(0.75, 10), H = 12, z = zOf(d);
      k.block(w, 1.2, d, cx, H - 1.2, z, 'wood'); k.block(w - 1, H - 1.2, d - 1.2, cx, 0, z - 0.2, 'ceramic');
      for (let i = 0; i < 4; i++) drawers(x0 + (w / 4) * (i + 0.5), 1, z + d / 2 - 0.5, w / 4 - 1, H - 3, 3);
      // vial trays: a grid of capped vials in each
      for (let t = 0; t < 2; t++) {
        const tx = x0 + 6 + t * 10, tz = z - 1;
        k.block(8, 0.6, 6, tx, H, tz, 'black');
        for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { k.cyl(0.42, 0.42, 1.6, tx - 3.1 + i * 1.25, H + 1.4, tz - 2 + j * 1.3, 'clearglass', { seg: 6, cast: false }); k.cyl(0.46, 0.46, 0.5, tx - 3.1 + i * 1.25, H + 2.4, tz - 2 + j * 1.3, 'paint', { colour: t ? '#c94a4a' : '#3d7cc4', seg: 6, cast: false }); }
      }
      // label printer, a roll of tape, boxes ready to go
      const lx = x0 + w * 0.68;
      k.block(5, 3.5, 4, lx, H, z - 1, 'ceramic'); k.box(3, 0.3, 0.2, lx, H + 2.5, z + 1.05, 'glow', { colour: TONE.cyan, cast: false }); k.box(2.4, 0.15, 2, lx, H + 0.8, z + 1.9, 'paint', { colour: '#f0ede6', cast: false });
      k.torus(1, 0.45, lx + 5, H + 1.4, z + 1, 'paint', { colour: '#b9a27a', seg: 14 });
      for (let i = 0; i < 2; i++) k.block(6, 3 + i, 5, x1 - 5, H + i * 3.6, z - 0.5, 'paint', { colour: i ? '#a1825e' : '#8e6f4e' });
      return true;
    }
    case 'fraction': {
      // A fraction collector: a rack of tubes under a moving arm, the run's fractions graded in colour.
      const d = depth(0.7, 8), z = zOf(d), H = 7;
      k.block(w, H, d, cx, 0, z, 'ceramic'); k.block(w - 2, 0.6, d - 2, cx, H, z, 'black');
      const cols = Math.floor((w - 4) / 1.7), rows = Math.floor((d - 3) / 1.7);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const tx = x0 + 2.5 + i * 1.7, tz = z - d / 2 + 2 + j * 1.7;
        k.cyl(0.42, 0.42, 3, tx, H + 2.1, tz, 'clearglass', { seg: 6, cast: false });
        if (i < cols * 0.7) k.cyl(0.38, 0.38, 1.2 + (i % 4) * 0.4, tx, H + 1.2 + (i % 4) * 0.2, tz, 'glow', { colour: i < cols * 0.3 ? TONE.amber : i < cols * 0.55 ? TONE.cyan : TONE.green, a: 0.55, seg: 6, cast: false });
      }
      for (const ex of [x0 + 1, x1 - 1]) k.block(1, 8, 1.2, ex, H, z - d / 2 + 1, 'steel');
      k.block(w, 1, 1.4, cx, H + 8, z - d / 2 + 1, 'steel');
      k.block(2.4, 2.6, 2.4, x0 + w * 0.62, H + 6.4, z - d / 2 + 2, 'black'); k.cyl(0.2, 0.2, 3, x0 + w * 0.62, H + 4.8, z - d / 2 + 2.6, 'steel', { seg: 4 });
      k.box(2, 0.6, 0.2, cx, H - 2, z + d / 2 + 0.05, 'glow', { colour: TONE.green, cast: false });
      return true;
    }
    case 'instrument': {
      // The HPLC: a stack of modules, solvent bottles on top with their lines, the run on a small screen.
      const d = depth(0.62, 10), z = zOf(d), mw = w * 0.55, mx = x0 + mw / 2 + 1;
      k.block(w, 9, d, cx, 0, z, 'ceramic'); k.block(w, 0.4, d, cx, 9, z, 'black');
      for (let m = 0; m < 4; m++) {
        const my = 9.4 + m * 4.2;
        k.block(mw, 4, d - 2, mx, my, z - 0.5, 'ceramic');
        k.box(mw - 2, 2.4, 0.2, mx, my + 2, z + d / 2 - 1.4, 'black', { cast: false });
        k.box(1, 0.5, 0.2, mx + mw / 2 - 2, my + 2.8, z + d / 2 - 1.3, `led${m % 3}`, { colour: m === 2 ? TONE.amber : TONE.green, cast: false });
      }
      const top = 9.4 + 4 * 4.2;
      k.block(mw, 0.6, d - 2, mx, top, z - 0.5, 'steel');
      for (let i = 0; i < 4; i++) { const bx = mx - mw / 2 + 2 + i * (mw - 4) / 3; k.cyl(1, 1, 4, bx, top + 2.6, z - 0.5, 'clearglass', { seg: 12, cast: false }); k.cyl(0.9, 0.9, 2.6, bx, top + 1.9, z - 0.5, 'glow', { colour: ['#c9dcf0', '#9ec6de', '#e7c98a', '#c9dcf0'][i], a: 0.45, seg: 12, cast: false }); k.cyl(0.12, 0.12, 6, bx, top + 1, z + 1.3, 'copper', { seg: 4, cast: false }); }
      display(x1 - w * 0.2, 9.4, z, 9, 'chart', TONE.cyan);
      return true;
    }
    case 'vialrack': {
      // Open steel shelving, three tiers of vials and reagent bottles, a light under each shelf.
      const d = 6, z = zOf(d), H = 22, vial = o.tint === 'green' ? TONE.green : TONE.cyan;
      for (const ex of [x0 + 0.4, x1 - 0.4]) k.block(0.8, H, d, ex, 0, z, 'steel');
      k.block(w - 1, H * 0.4, d - 0.5, cx, 0, z, 'ceramic'); drawers(cx, 0.5, z + d / 2 - 0.2, w - 2, H * 0.4 - 1, 2);
      for (let s = 0; s < 3; s++) {
        const sy = H * 0.4 + s * 4.6;
        k.block(w - 1, 0.5, d, cx, sy, z, 'steel');
        k.box(w - 3, 0.2, 0.2, cx, sy + 4.2, z + d / 2 - 0.3, 'glow', { colour: TONE.cold, a: 0.7, cast: false });
        for (let i = 0; i < Math.floor((w - 3) / 1.6); i++) {
          const vx = x0 + 2 + i * 1.6, tall = r() < 0.25;
          k.cyl(tall ? 0.7 : 0.45, tall ? 0.7 : 0.45, tall ? 3.2 : 2, vx, sy + 0.5 + (tall ? 1.6 : 1), z + (r() - 0.5) * 1.5, 'clearglass', { seg: 8, cast: false });
          k.cyl(tall ? 0.6 : 0.4, tall ? 0.6 : 0.4, tall ? 1.8 : 1.2, vx, sy + 0.5 + (tall ? 0.9 : 0.6), z, 'glow', { colour: r() < 0.7 ? vial : LIQUID[Math.floor(r() * LIQUID.length)], a: 0.5, seg: 8, cast: false });
        }
      }
      k.block(w, 0.5, d, cx, H, z, 'steel');
      pool(cx, z + 2, w * 0.6, TONE.cold, 0.12, 'wall', H * 0.7);
      return true;
    }

    /* ============ THE GARAGE ============ */
    case 'vanquish': {
      // A grand tourer in its bay: a bevelled body drawn from a side profile, a glass canopy, wheels with
      // spoked rims and red calipers, light bars front and back. It faces the lift.
      const L = Math.min(72, w - 4), Wd = Math.min(24, p.h * 0.72), cz = oz + p.y + p.h / 2, sx = cx - L / 2;
      const body = new THREE.Shape();
      body.moveTo(0, 3); body.lineTo(0.4, 6.2); body.quadraticCurveTo(2, 7.6, 8, 8.2); body.lineTo(25, 9.4); body.lineTo(L - 12, 9.6); body.quadraticCurveTo(L - 2, 9.6, L, 8.2); body.lineTo(L, 4); body.quadraticCurveTo(L, 2.4, L - 3, 2.4);
      const wf = 13, wr = L - 14, R = 5.6;
      body.lineTo(wr + R, 2.4); body.absarc(wr, 4.4, R, 0, Math.PI, false); body.lineTo(wf + R, 2.4); body.absarc(wf, 4.4, R, 0, Math.PI, false); body.lineTo(2.5, 2.4); body.quadraticCurveTo(0, 2.4, 0, 3);
      // Seen from above a car is not a box: the body pinches at nose and tail and the glasshouse narrows to the roof.
      const pinch = (v) => { const t = v[0] / L, e = Math.max(0, Math.abs(t - 0.52) * 2 - 0.45) / 0.55; v[2] *= 1 - 0.2 * e * e - Math.max(0, v[1] - 8) * 0.02; };
      k.extrude(body, Wd - 3, sx, 0, cz, 'carpaint', { bevel: 1.4, segs: 4, warp: pinch });
      const cabin = new THREE.Shape();
      cabin.moveTo(24, 9.3); cabin.quadraticCurveTo(31, 14.6, 38, 15); cabin.lineTo(L * 0.66, 15); cabin.quadraticCurveTo(L * 0.8, 14, L - 9, 9.5); cabin.lineTo(24, 9.3);
      k.extrude(cabin, Wd - 8, sx, 0, cz, 'glass', { bevel: 1.1, segs: 3, warp: (v) => { pinch(v); v[2] *= 1 - Math.max(0, v[1] - 9.3) * 0.045; } });
      // wheels: tyre, rim, five spokes, caliper
      for (const wx of [wf, wr]) for (const side of [-1, 1]) {
        const x = sx + wx, z = cz + side * (Wd / 2 - 0.6);
        k.torus(3.3, 1.5, x, 4.4, z, 'rubber', { seg: 24 });
        k.cyl(3, 3, 1.8, x, 4.4, z, 'black', { rot: [Math.PI / 2, 0, 0], seg: 20 });
        k.cyl(2.6, 2.6, 0.4, x, 4.4, z + side * 0.95, 'steel', { rot: [Math.PI / 2, 0, 0], seg: 20 });
        for (let s = 0; s < 5; s++) k.box(0.45, 2.4, 0.3, x, 4.4, z + side * 1.2, 'chrome', { rot: [0, 0, (s / 5) * Math.PI * 2] });
        k.box(1.6, 1.2, 0.6, x + 1.4, 5.4, z + side * 0.6, 'paint', { colour: '#b0262a', cast: false });
      }
      // light bars, mirrors, a lip at the tail
      for (const side of [-1, 1]) { k.box(0.6, 0.7, 4.5, sx + 0.6, 6.6, cz + side * 7, 'glow', { colour: TONE.cold, cast: false }); k.box(1.6, 1.2, 1.6, sx + 26, 10, cz + side * (Wd / 2 + 0.6), 'carpaint'); }
      k.box(0.6, 0.8, Wd - 6, sx + L + 0.1, 7.6, cz, 'glow', { colour: TONE.red, cast: false });
      k.box(3, 0.4, Wd - 4, sx + L - 2.5, 10.2, cz, 'black');
      pool(sx - 2, cz, 12, TONE.cold, 0.16); pool(sx + L + 1, cz, 8, TONE.red, 0.14);
      return true;
    }
    case 'lift': {
      // A two-post lift: posts striped at the foot, a crossbar with the hydraulic line, arms swung in, a floor plate.
      const z = oz + p.y + p.h / 2, pw = 3, H = 34;
      for (const side of [-1, 1]) {
        const px = side < 0 ? x0 + 2 : x1 - 2;
        k.block(pw, H, pw + 1, px, 0, z, 'gloss', { colour: '#2e5b9a' });
        k.block(pw + 1.6, 1, pw + 2.6, px, 0, z, 'black');
        for (let i = 0; i < 4; i++) k.box(pw + 0.1, 1, pw + 1.1, px, 2 + i * 2, z, 'paint', { colour: i % 2 ? '#15161a' : '#c9962a', cast: false });
        k.block(pw + 1, 2.4, pw + 1.6, px, 7, z, 'steel');
        for (const az of [-1, 1]) k.box(w * 0.32, 0.9, 1.4, px - side * w * 0.16, 7.8, z + az * 5, 'steel', { rot: [0, az * side * 0.35, 0] });
        k.box(0.6, 1, 0.3, px, H - 4, z + (pw + 1) / 2 + 0.05, 'glow', { colour: TONE.amber, cast: false });
      }
      k.block(w, 2, 2.4, cx, H, z, 'gloss', { colour: '#2e5b9a' });
      k.cyl(0.35, 0.35, w - 6, cx, H - 1, z + 1.6, 'black', { rot: [0, 0, Math.PI / 2], seg: 6 });
      k.block(w - 8, 0.3, 10, cx, 0, z, 'steel', { cast: false });
      k.block(5, 4, 4, x1 - 2, 0, z + 8, 'black'); k.box(2.4, 1.2, 0.2, x1 - 2, 3, z + 10.1, 'glow', { colour: TONE.green, cast: false });
      return true;
    }

    /* ============ EVERYDAY FURNITURE, DONE PROPERLY ============ */
    case 'desk': {
      const d = depth(0.62, 7), H = 12, z = zOf(d), top = o.tone === 'steel' ? 'steel' : 'wood';
      k.block(w, 1.2, d, cx, H - 1.2, z, top);
      k.box(w, 0.25, 0.25, cx, H - 0.1, z + d / 2, 'trim', { cast: false });
      const pw = Math.min(w * 0.32, 12);
      k.block(pw, H - 1.2, d - 0.6, x0 + pw / 2 + 0.3, 0, z, 'black'); drawers(x0 + pw / 2 + 0.3, 0.6, z + d / 2 - 0.2, pw - 0.8, H - 2.4, 3);
      for (const sz of [-1, 1]) k.block(0.8, H - 1.2, 0.8, x1 - 1, 0, z + sz * (d / 2 - 0.8), 'black');
      k.block(w - pw - 2, 4, 0.4, x0 + pw + (w - pw) / 2, H - 5.6, z - d / 2 + 0.6, 'black');
      let ix = x0 + 4;
      for (const it of o.items || []) {
        if (it === 'terminal' || it === 'secure') { display(ix + 5, H, z - d / 4, 10, 'data', o.accent ? accentOf(o.accent) : tint); k.block(6.5, 0.4, 2.2, ix + 5, H, z + d / 4, 'black'); k.block(1.2, 0.4, 1.6, ix + 9.5, H, z + d / 4, 'black'); ix += 13; }
        else if (it === 'dual') { display(ix + 5, H, z - d / 4, 9, 'chart'); display(ix + 14.5, H, z - d / 4, 9, 'data'); ix += 21; }
        else if (it === 'keyboard') { k.block(7, 0.45, 2.4, ix + 4, H, z + d / 4, 'black'); ix += 9; }
        else if (it === 'papers') { for (let i = 0; i < 3; i++) k.block(4, 0.12, 5, ix + 3 + i * 0.6, H + i * 0.13, z + (r() - 0.5) * 2, 'paint', { colour: '#e2ded4', cast: false, rot: [0, (r() - 0.5) * 0.5, 0] }); ix += 7; }
        else if (it === 'mug') { k.cyl(0.9, 0.8, 2, ix + 1, H + 1, z + d / 4, 'ceramic', { seg: 10 }); k.torus(0.6, 0.18, ix + 1.9, H + 1, z + d / 4, 'ceramic', { seg: 8 }); ix += 4; }
        else if (it === 'printer') { k.block(7, 4, 5, ix + 4, H, z, 'ceramic'); k.box(5, 0.3, 0.2, ix + 4, H + 3, z + 2.55, 'black', { cast: false }); ix += 9; }
      }
      pool(cx, z, w * 0.7, TONE.warm, 0.1);
      return true;
    }
    case 'chair': case 'armchair': {
      const s = Math.min(p.w, p.h), z = oz + p.y + p.h - s / 2, colour = o.tone === 'wood' ? '#4a3427' : '#23272e';
      if (p.type === 'armchair') {
        k.block(s, 4.5, s, cx, 0.6, z, 'paint', { colour: '#3b3330' }); k.block(s, 7, 2, cx, 4.5, z + s / 2 - 1, 'paint', { colour: '#3b3330' });
        for (const sx of [-1, 1]) k.block(1.8, 3, s, cx + sx * (s / 2 - 0.9), 4.5, z, 'paint', { colour: '#332c29' });
        k.block(s - 4, 1, s - 3, cx, 4.6, z - 0.5, 'paint', { colour: '#4a403b' });
        return true;
      }
      // An office chair: five-star base on castors, the gas lift, a cushioned seat, a back, arms.
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; k.box(s * 0.42, 0.5, 0.7, cx + Math.cos(a) * s * 0.21, 0.9, z + Math.sin(a) * s * 0.21, 'black', { rot: [0, -a, 0] }); k.sphere(0.45, cx + Math.cos(a) * s * 0.42, 0.45, z + Math.sin(a) * s * 0.42, 'black', { detail: 0, cast: false }); }
      k.cyl(0.4, 0.4, 4, cx, 3, z, 'chrome', { seg: 8 });
      k.block(s, 1.6, s, cx, 5, z, 'paint', { colour });
      k.block(s - 0.6, 7.5, 1.2, cx, 6.8, z + s / 2 - 0.5, 'paint', { colour, rot: [0.12, 0, 0] });
      for (const sx of [-1, 1]) { k.block(0.5, 2.6, 0.5, cx + sx * (s / 2 + 0.1), 6.6, z, 'black'); k.block(0.9, 0.5, s * 0.6, cx + sx * (s / 2 + 0.1), 9.2, z, 'black'); }
      return true;
    }
    case 'plant': {
      // A tapered pot, soil, and leaves fanning out from the stem — read as a plant from above, not a ball.
      const z = oz + p.y + p.h - w / 2;
      k.cyl(w / 2.2, w / 3, 5.5, cx, 2.75, z, 'ceramic', { seg: 14 });
      k.cyl(w / 2.4, w / 2.4, 0.3, cx, 5.4, z, 'paint', { colour: '#2a2018', seg: 14, cast: false });
      k.cyl(0.25, 0.3, 6, cx, 8, z, 'leaf', { colour: '#3a4a2a', seg: 5 });
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r(), lean = 0.5 + r() * 0.6, len = w * (0.42 + r() * 0.25), y = 7 + r() * 5;
        k.sphere(1, cx + Math.cos(a) * len * 0.5, y, z + Math.sin(a) * len * 0.5, 'leaf', { colour: ['#3f6b43', '#4f7d4c', '#2f5235', '#5a8a55'][i % 4], detail: 1, scale: [len * 0.55, 0.18, 1.1], rot: [0, -a, lean * Math.sign(Math.cos(a) || 1) * 0.3] });
      }
      return true;
    }
    case 'crate': {
      const s = Math.min(w, p.h * 0.8, 12), z = oz + p.y + p.h - s / 2, ry = (r() - 0.5) * 0.3, H = s * 0.8;
      k.block(s - 0.4, H - 0.4, s - 0.4, cx, 0.2, z, 'wood', { rot: [0, ry, 0] });
      for (const yy of [0, H - 1]) for (const zz of [-1, 1]) k.box(s, 1, 1, cx, yy + 0.5, z + zz * (s / 2 - 0.5), 'paint', { colour: '#5a4230', rot: [0, ry, 0] });
      k.box(s * 1.2, 0.8, 0.5, cx, H / 2, z + s / 2, 'paint', { colour: '#5a4230', rot: [0, ry, 0.6], cast: false });
      k.box(s * 0.5, s * 0.25, 0.1, cx, H * 0.7, z + s / 2 + 0.3, 'paint', { colour: '#2a2018', rot: [0, ry, 0], cast: false });
      return true;
    }
    case 'boxes': case 'parcels': {
      const z0 = oz + p.y + p.h, n = p.type === 'parcels' ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const bw = Math.min(w / 2, 4 + r() * 4), bh = 3 + r() * 4, bd = 3 + r() * 3, bx = x0 + bw / 2 + r() * (w - bw), stack = i === n - 1 && r() < 0.6, y = stack ? 5 : 0, rot = [0, (r() - 0.5) * 0.4, 0];
        k.block(bw, bh, bd, bx, y, z0 - bd / 2 - r() * 2, 'paint', { colour: r() < 0.5 ? '#9a7a55' : '#ad8d66', rot });
        k.block(bw + 0.05, 0.08, 0.9, bx, y + bh, z0 - bd / 2, 'paint', { colour: '#c9bfa8', rot, cast: false });
        if (p.type === 'parcels') k.block(bw * 0.4, 0.05, bd * 0.35, bx + bw * 0.15, y + bh + 0.06, z0 - bd / 2 + bd * 0.15, 'paint', { colour: '#f0ede6', rot, cast: false });
      }
      return true;
    }
    case 'corkboard': {
      // Pins and the string between them: the board reads as an investigation, not a pinboard.
      const ph = Math.max(8, p.h * 0.8), y = panelY(ph);
      k.box(w, ph, 1, cx, y, wallZ, 'wood');
      k.box(w - 2, ph - 2, 0.4, cx, y, wallZ + 0.6, 'paint', { colour: '#7a5c40' });
      const pins = [];
      for (let i = 0; i < Math.max(5, w / 3.5); i++) {
        const px = x0 + 3 + r() * (w - 6), py = y - ph / 2 + 3 + r() * (ph - 6), pw = 2.4 + r() * 2.4, phh = 2.6 + r() * 2;
        k.box(pw, phh, 0.2, px, py, wallZ + 0.9, 'paint', { colour: r() < 0.25 ? '#c8b98e' : r() < 0.4 ? '#9ec6de' : '#e2ded4', cast: false });
        k.sphere(0.35, px, py + phh / 2 - 0.4, wallZ + 1.1, 'paint', { colour: '#c0392b', detail: 0, cast: false });
        pins.push([px, py + phh / 2 - 0.4]);
      }
      for (let i = 1; i < pins.length; i += 1) {
        const [ax, ay] = pins[i - 1], [bx, by] = pins[(i * 3) % pins.length];
        const len = Math.hypot(bx - ax, by - ay); if (len < 2) continue;
        k.box(len, 0.12, 0.12, (ax + bx) / 2, (ay + by) / 2, wallZ + 1.15, 'glow', { colour: '#c0392b', a: 0.8, rot: [0, 0, Math.atan2(by - ay, bx - ax)], cast: false });
      }
      return true;
    }
    case 'safe': {
      if (w < 30) return false;
      // The vault itself: a round door set into a steel frame in the back wall, bolts, a wheel, a lit lock.
      const z = backZ + 4, cy = 20, R = Math.min(w * 0.36, 18);
      k.block(w, WH - 4, 6, cx, 0, backZ + 3, 'steel');
      k.cyl(R + 2.4, R + 2.4, 2, cx, cy, z + 1.4, 'black', { rot: [Math.PI / 2, 0, 0], seg: 40 });
      k.cyl(R, R, 2.6, cx, cy, z + 2.6, 'chrome', { rot: [Math.PI / 2, 0, 0], seg: 40 });
      k.torus(R - 1.2, 0.35, cx, cy, z + 4, 'steel', { seg: 40 });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.cyl(0.8, 0.8, 1, cx + Math.cos(a) * (R - 2.6), cy + Math.sin(a) * (R - 2.6), z + 4, 'black', { rot: [Math.PI / 2, 0, 0], seg: 10 }); }
      k.torus(R * 0.32, 0.6, cx, cy, z + 5, 'steel', { seg: 24 });
      for (let s = 0; s < 3; s++) k.box(R * 0.64, 0.6, 0.6, cx, cy, z + 5, 'steel', { rot: [0, 0, (s / 3) * Math.PI] });
      k.cyl(1.2, 1.2, 1, cx, cy, z + 5.2, 'black', { rot: [Math.PI / 2, 0, 0], seg: 12 });
      k.box(3, 1.2, 0.3, cx + R + 4, cy + 4, backZ + 6.2, 'glow', { colour: TONE.green, cast: false });
      k.face(4, 3, cx + R + 4, cy - 1, backZ + 6.2, `screen:panel:${TONE.gold}:1`);
      pool(cx, z + 8, w * 0.7, TONE.gold, 0.18); pool(cx, z + 6, R * 1.6, TONE.warm, 0.12, 'wall', cy);
      return true;
    }
    case 'tradingdesk': {
      // A trader's desk: two tiers of screens on an arm, the lower showing price, the upper the book.
      const d = depth(0.55, 8), H = 12, z = zOf(d);
      k.block(w, 1.2, d, cx, H - 1.2, z, 'black'); k.box(w, 0.25, 0.25, cx, H - 0.1, z + d / 2, 'trim', { cast: false });
      k.block(w - 2, H - 2, d - 1, cx, 0, z, 'black');
      const n = Math.max(3, Math.round(w / 16)), mw = Math.min(13, w / n - 1.5);
      k.block(w - 4, 0.8, 0.8, cx, H + 14, z - d / 2 + 1, 'steel');
      for (const ex of [x0 + 2, x1 - 2]) k.block(0.8, 14, 0.8, ex, H, z - d / 2 + 1, 'steel');
      for (let i = 0; i < n; i++) {
        const mx = x0 + (w / n) * (i + 0.5);
        for (const [tier, ty] of [[0, H + 1.5], [1, H + 8.3]]) {
          const sh = mw * 0.56;
          k.box(mw + 0.4, sh + 0.4, 0.5, mx, ty + sh / 2, z - d / 2 + 1.6, 'black');
          k.face(mw, sh, mx, ty + sh / 2, z - d / 2 + 1.9, `screen:${tier ? 'data' : 'chart'}:${tier ? TONE.amber : (i % 2 ? TONE.green : TONE.red)}:${(i + tier) % 3}`);
        }
      }
      k.block(9, 0.45, 2.6, cx, H, z + d / 4, 'black'); k.block(1.3, 0.4, 1.8, cx + 6.5, H, z + d / 4, 'black');
      pool(cx, z + 4, w * 0.6, TONE.amber, 0.14);
      return true;
    }

    /* ============ DRESSING — 3D-only pieces placed by rooms3d.js ============ */
    case 'fumehood': {
      // Faces into the room from the side wall named in opts.side: a cabinet base, a ceramic hood, a raised glass sash.
      const sideX = o.side === 'left' ? -1 : 1, D = Math.min(w, 16), Wd = p.h - 2, z = oz + p.y + p.h / 2, bx = o.side === 'left' ? x0 + D / 2 : x1 - D / 2, front = bx - sideX * D / 2;
      k.block(D, 11, Wd, bx, 0, z, 'ceramic'); k.block(D + 0.6, 1, Wd + 0.6, bx, 11, z, 'black');
      for (let i = 0; i < 3; i++) { k.box(0.2, 9, 0.2, front - sideX * 0.1, 5.5, z - Wd / 2 + (Wd / 3) * i, 'black', { cast: false }); handle(front - sideX * 0.4, 9, z - Wd / 2 + (Wd / 3) * (i + 0.5), 3); }
      for (const ez of [-1, 1]) k.block(D, 24, 1.2, bx, 12, z + ez * (Wd / 2 - 0.6), 'ceramic');
      k.block(1.2, 24, Wd, bx + sideX * (D / 2 - 0.6), 12, z, 'ceramic');
      k.block(D, 6, Wd, bx, 30, z, 'ceramic');
      k.box(0.3, 9, Wd - 2.4, front, 25, z, 'clearglass', { cast: false });
      k.box(0.6, 0.6, Wd - 2.4, front, 20.4, z, 'steel');
      k.box(0.2, 0.5, Wd - 4, front + sideX * 1.5, 29.4, z, 'glow', { colour: TONE.cold, cast: false });
      k.box(0.2, 2, 3, front - sideX * 0.1, 32, z + Wd / 2 - 3, 'glow', { colour: TONE.green, cast: false });
      glassware(bx, 12, z, Wd * 0.5, 4);
      k.cyl(2.4, 2.4, WH - 34, bx + sideX * 2, 36 + (WH - 34) / 2, z, 'steel', { seg: 14 });
      pool(bx - sideX * 4, z, Wd * 0.7, TONE.cold, 0.25, 'floor', 12.1);
      return true;
    }
    case 'labsink': {
      const d = 10, z = backZ + d / 2 + 0.2, H = 12;
      k.block(w, H - 1, d, cx, 0, z, 'ceramic'); drawers(cx, 0.6, z + d / 2 + 0.05, w - 1, H - 2.6, 2);
      k.block(w, 1, d, cx, H - 1, z, 'steel');
      k.block(w * 0.45, 0.2, d * 0.6, cx - w * 0.12, H, z, 'black', { cast: false });
      k.cyl(0.35, 0.35, 7, cx - w * 0.12, H + 3.5, z - d / 2 + 1.5, 'chrome', { seg: 8 });
      k.torus(1.6, 0.35, cx - w * 0.12, H + 7, z - d / 2 + 3.1, 'chrome', { rot: [0, Math.PI / 2, 0], arc: Math.PI, seg: 10 });
      k.box(w, 10, 0.4, cx, H + 5, backZ + 0.5, 'cladding', { cast: false });
      glassware(x1 - w * 0.2, H, z, w * 0.25, 3);
      k.block(3, 4, 2, x0 + 2.5, H, z - 2, 'paint', { colour: '#e2ded4' });
      return true;
    }
    case 'safetyshower': {
      const z = backZ + 4;
      k.cyl(0.8, 0.8, 36, cx, 18, z, 'gloss', { colour: '#2f8a4a', seg: 10 });
      k.cyl(1.6, 1.6, 0.6, cx, 0.3, z, 'black', { seg: 12 });
      k.box(0.7, 0.7, 6, cx, 35.5, z + 3, 'gloss', { colour: '#2f8a4a' });
      k.cyl(3, 2.2, 1.4, cx, 34.6, z + 6, 'gloss', { colour: '#2f8a4a', seg: 16 });
      k.cyl(0.15, 0.15, 10, cx + 1.6, 30, z + 6, 'steel', { seg: 4, cast: false }); k.box(2.6, 0.6, 0.6, cx + 1.6, 25, z + 6, 'gloss', { colour: '#e2b52a' });
      k.cyl(2.4, 1.6, 1.6, cx, 15, z + 3.4, 'gloss', { colour: '#2f8a4a', seg: 14 });
      k.box(6, 6, 0.3, cx, 41, backZ + 0.3, 'gloss', { colour: '#2f8a4a', cast: false });
      k.box(3.4, 1, 0.1, cx, 41, backZ + 0.5, 'glow', { colour: '#ffffff', cast: false }); k.box(1, 3.4, 0.1, cx, 41, backZ + 0.5, 'glow', { colour: '#ffffff', cast: false });
      return true;
    }
    case 'sharps': {
      const z = oz + p.y + p.h / 2;
      k.block(w, 7, p.h, cx, 0, z, 'gloss', { colour: '#d9b21f' }); k.block(w + 0.3, 1.2, p.h + 0.3, cx, 7, z, 'gloss', { colour: '#b02a2a' });
      k.box(w * 0.5, w * 0.5, 0.1, cx, 4, z + p.h / 2 + 0.05, 'paint', { colour: '#1a1a1a', cast: false });
      return true;
    }
    case 'floorline': {
      // Floor tape: a lane or a keep-clear box, yellow or hazard-striped.
      const z0 = oz + p.y, z1 = oz + p.y + p.h, col = o.colour || '#c9a227', t = o.width || 1.2;
      const seg = (len, x, z, horiz) => {
        if (!o.dash) { k.block(horiz ? len : t, 0.06, horiz ? t : len, x, 0.02, z, 'paint', { colour: col, cast: false }); return; }
        const n = Math.floor(len / 2.4);
        for (let i = 0; i < n; i++) { const c = horiz ? x - len / 2 + 1.2 + i * 2.4 : x, cz2 = horiz ? z : z - len / 2 + 1.2 + i * 2.4; k.block(horiz ? 2.4 : t, 0.06, horiz ? t : 2.4, c, 0.02, cz2, 'paint', { colour: i % 2 ? '#141518' : col, cast: false }); }
      };
      seg(w, cx, z0, true); seg(w, cx, z1, true); seg(p.h, x0, (z0 + z1) / 2, false); seg(p.h, x1, (z0 + z1) / 2, false);
      return true;
    }
    case 'gantry': {
      // A service beam across the room: lights hung off it, drops down to the benches, cable along it.
      const z = oz + p.y, y = 40;
      k.box(w, 1.2, 1.8, cx, y, z, 'trim'); k.box(w, 0.3, 0.3, cx, y + 0.8, z + 1, 'black', { cast: false });
      for (const ex of [x0 + 4, x1 - 4]) cord(ex, y, z);
      const n = Math.max(2, Math.round(w / 34));
      for (let i = 0; i < n; i++) {
        const lx = x0 + (w / n) * (i + 0.5);
        k.box(0.15, 4, 0.15, lx - 5, y - 2, z, 'black', { cast: false }); k.box(0.15, 4, 0.15, lx + 5, y - 2, z, 'black', { cast: false });
        k.box(14, 0.8, 4, lx, y - 4.4, z, 'black'); k.box(13, 0.25, 0.25, lx, y - 4.4, z + 2.1, 'glow', { colour: o.colour || TONE.cold, cast: false });
        pool(lx, z + 6, 22, o.colour || TONE.cold, 0.22);
        if (o.drops) { k.cyl(0.6, 0.6, y - 18, lx + 8, (y + 18) / 2, z, 'ceramic', { seg: 8 }); k.box(2.4, 3, 2.4, lx + 8, 17, z, 'ceramic'); k.box(0.8, 0.8, 0.2, lx + 8, 17.5, z + 1.25, 'led1', { colour: TONE.green, cast: false }); }
      }
      return true;
    }
    case 'pendant': {
      const [x, z] = local(p.x, p.y), y = o.y || 30, col = o.colour || TONE.warm;
      cord(x, y + 2.4, z);
      if (o.style === 'globe') { k.sphere(2.2, x, y, z, 'glow', { colour: col, detail: 2, a: 0.9, cast: false }); }
      else { k.cyl(0.8, 3.6, 2.6, x, y + 1.3, z, 'black', { seg: 16, open: true }); k.cyl(1, 1, 0.3, x, y + 0.2, z, 'glow', { colour: col, seg: 12, cast: false }); }
      pool(x, z, o.r || 24, col, o.a ?? 0.3);
      return true;
    }
    case 'ringlight': {
      const [x, z] = local(p.x, p.y), y = o.y || 32, R = p.w / 2, col = o.colour || TONE.warm;
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; cord(x + Math.cos(a) * R, y, z + Math.sin(a) * R); }
      k.torus(R, 0.3, x, y, z, 'trim', { rot: [Math.PI / 2, 0, 0], seg: 64 });
      k.torus(R, 0.22, x, y - 0.35, z, 'glow', { colour: col, rot: [Math.PI / 2, 0, 0], seg: 64, cast: false });
      pool(x, z, R * 1.6, col, 0.3);
      return true;
    }
    case 'striplight': {
      const z = oz + p.y, y = o.y || 34, col = o.colour || TONE.cold;
      cord(x0 + 3, y, z); cord(x1 - 3, y, z);
      k.box(w, 1, 2.4, cx, y, z, 'black'); k.box(w - 1, 0.3, 0.3, cx, y - 0.2, z + 1.3, 'glow', { colour: col, cast: false });
      for (let i = 0; i < Math.max(1, Math.round(w / 26)); i++) pool(x0 + (w / Math.max(1, Math.round(w / 26))) * (i + 0.5), z, 22, col, 0.24);
      return true;
    }
    case 'toolchest': {
      // A rolling tool chest: lacquered red, a dozen drawers with steel pulls, a top box, castors.
      const D = Math.min(p.h, 9), z = oz + p.y + p.h - D / 2, H = 14, colour = o.colour || '#9e1f22';
      k.block(w, H, D, cx, 1.4, z, 'gloss', { colour });
      for (const ex of [x0 + 1, x1 - 1]) for (const ez of [-1, 1]) k.cyl(0.7, 0.7, 0.6, ex, 0.7, z + ez * (D / 2 - 1), 'black', { rot: [Math.PI / 2, 0, 0], seg: 8 });
      for (let i = 0; i < 6; i++) { const y = 2.4 + i * 2; k.box(w - 1, 0.15, 0.2, cx, y, z + D / 2 + 0.05, 'black', { cast: false }); k.box(w * 0.6, 0.35, 0.4, cx, y + 1, z + D / 2 + 0.2, 'chrome', { cast: false }); }
      k.block(w - 1, 6, D - 1, cx, H + 1.4, z, 'gloss', { colour }); k.block(w - 1, 0.4, D - 1, cx, H + 7.4, z, 'black');
      for (let i = 0; i < 2; i++) k.box(w * 0.6, 0.35, 0.4, cx, H + 3 + i * 2.4, z + D / 2 - 0.3, 'chrome', { cast: false });
      for (let i = 0; i < 3; i++) k.block(1 + r() * 2, 0.8, 0.8, x0 + 2 + i * 3, H + 7.8, z, r() < 0.5 ? 'steel' : 'copper');
      return true;
    }
    case 'tyres': {
      const z = oz + p.y + p.h / 2, R = Math.min(w, p.h) / 2 - 1.4, n = o.n || 4;
      for (let i = 0; i < n; i++) { k.torus(R, 1.5, cx + (r() - 0.5) * 0.6, 1.5 + i * 3, z + (r() - 0.5) * 0.6, 'rubber', { rot: [Math.PI / 2, 0, 0], seg: 24 }); k.cyl(R - 1, R - 1, 1.2, cx, 1.5 + i * 3, z, 'black', { seg: 18 }); }
      return true;
    }
    case 'charger': {
      // An EV charger: a slim pillar, a lit ring, a screen, the cable coiled on its hook.
      const z = oz + p.y + p.h / 2;
      k.block(w, 18, p.h, cx, 0, z, 'ceramic'); k.block(w + 1, 1, p.h + 1, cx, 18, z, 'black');
      k.torus(1.4, 0.3, cx, 13, z + p.h / 2 + 0.2, 'glow', { colour: TONE.cyan, seg: 20, cast: false });
      k.face(w * 0.7, 2.6, cx, 9, z + p.h / 2 + 0.06, `screen:panel:${TONE.green}:2`);
      k.torus(2.2, 0.45, cx, 6, z + p.h / 2 + 1, 'black', { seg: 18 });
      pool(cx, z + p.h / 2 + 2, 10, TONE.cyan, 0.25);
      return true;
    }
    case 'wallrack': {
      // Shelving on a side wall: opts.side, opts.items (tyres, books, jars, binders, boxes), three tiers.
      const left = o.side === 'left', D = 5, wx0 = left ? ctx.ox + 4 + D / 2 : ctx.ox + ctx.rw - 4 - D / 2;
      const z0 = oz + p.y, len = p.h, zc = z0 + len / 2, tiers = o.tiers || 3, base = o.base || 14;
      for (const ez of [z0 + 0.5, z0 + len - 0.5]) k.box(D, tiers * 8, 0.6, wx0, base + tiers * 4 - 1, ez, 'steel');
      for (let t = 0; t < tiers; t++) {
        const y = base + t * 8;
        k.box(D, 0.5, len, wx0, y, zc, o.items === 'books' || o.items === 'jars' ? 'wood' : 'steel');
        const fx = wx0 + (left ? 1 : -1) * 0.5;
        if (o.items === 'tyres' && t > 0) for (let i = 0; i < Math.floor(len / 6); i++) k.torus(2.6, 1.1, fx, y + 3.8, z0 + 3 + i * 6, 'rubber', { rot: [0, Math.PI / 2, 0], seg: 18 });
        else if (o.items === 'books' || o.items === 'binders') { let bz = z0 + 1; while (bz < z0 + len - 1.5) { const bw = o.items === 'binders' ? 1.6 : 0.8 + r(), bh = o.items === 'binders' ? 6 : 4 + r() * 3; k.block(3.4, bh, bw, fx, y + 0.25, bz + bw / 2, 'paint', { colour: o.items === 'binders' ? ['#2c3a4e', '#3e4a35', '#5a2f2a', '#2a2a30'][Math.floor(r() * 4)] : ['#5a2f2a', '#2c3a4e', '#3e4a35', '#6b5a3a', '#7a6a55'][Math.floor(r() * 5)] }); bz += bw + 0.1; } }
        else if (o.items === 'jars') for (let i = 0; i < Math.floor(len / 2.6); i++) { k.cyl(0.9, 0.9, 3 + r() * 1.5, fx, y + 2, z0 + 1.8 + i * 2.6, 'clearglass', { seg: 10, cast: false }); k.cyl(0.8, 0.8, 1.8, fx, y + 1.2, z0 + 1.8 + i * 2.6, 'glow', { colour: LIQUID[i % LIQUID.length], a: 0.4, seg: 10, cast: false }); }
        else for (let i = 0; i < Math.floor(len / 6); i++) k.block(3.6, 4 + r() * 2, 5, fx, y + 0.25, z0 + 3.2 + i * 6, 'paint', { colour: i % 2 ? '#9a7a55' : '#c9c2b2' });
      }
      return true;
    }
    case 'dais': {
      const z = oz + p.y + p.h / 2, col = o.colour || TONE.violet;
      k.block(w, 1.2, p.h, cx, 0, z, 'black'); k.block(w - 1.6, 0.2, p.h - 1.6, cx, 1.2, z, 'panel', { cast: false });
      for (const [lw, ld, lx, lz] of [[w, 0.3, cx, z + p.h / 2], [w, 0.3, cx, z - p.h / 2], [0.3, p.h, x0, z], [0.3, p.h, x1, z]]) k.box(lw, 0.3, ld, lx, 1.1, lz, 'glow', { colour: col, a: 0.8, cast: false });
      pool(cx, z, Math.max(w, p.h) * 0.6, col, 0.12, 'floor', 1.4);
      return true;
    }
    case 'banner': {
      const left = o.side === 'left', bx = left ? ctx.ox + 4.3 : ctx.ox + ctx.rw - 4.3, z = oz + p.y + p.h / 2, col = o.colour || '#3a2f6a';
      k.box(0.3, 26, p.h, bx, 26, z, 'paint', { colour: col, cast: false });
      k.box(0.5, 0.8, p.h + 2, bx, 39.4, z, 'trim');
      k.box(0.35, 1, p.h - 1, bx, 13.5, z, 'paint', { colour: '#c9a227', cast: false });
      k.box(0.4, 4, 4, bx + (left ? 0.1 : -0.1), 28, z, 'glow', { colour: o.emblem || TONE.gold, a: 0.8, rot: [Math.PI / 4, 0, 0], cast: false });
      return true;
    }
    case 'pallet': {
      const z = oz + p.y + p.h / 2;
      k.block(w, 1.4, p.h, cx, 0, z, 'wood');
      let y = 1.4, n = 0;
      for (let layer = 0; layer < 4; layer++) { const cols = 4 - layer; for (let i = 0; i < cols; i++) for (let j = 0; j < 2; j++) { k.block(3.6, 1.4, 1.8, cx - (cols - 1) * 2 + i * 4, y, z - 1.2 + j * 2.4, 'gloss', { colour: '#c99a3a' }); n++; } y += 1.4; }
      pool(cx, z, w, TONE.gold, 0.22);
      return true;
    }
    case 'bankerlamp': {
      const [x, z] = local(p.x, p.y), y = o.on || 12;
      k.cyl(1.2, 1.4, 0.5, x, y + 0.25, z, 'copper', { seg: 12 }); k.cyl(0.25, 0.25, 4, x, y + 2.3, z, 'copper', { seg: 6 });
      k.cyl(1.2, 1.2, 4.6, x, y + 4.6, z, 'gloss', { colour: '#1f5a3a', rot: [0, 0, Math.PI / 2], seg: 12, open: true });
      k.box(4, 0.3, 1.6, x, y + 4, z, 'glow', { colour: TONE.warm, cast: false });
      pool(x, z, 12, TONE.warm, 0.4, 'floor', y + 0.1);
      return true;
    }
    case 'bar': {
      // A bar counter with stools in front and the bottles on a lit shelf behind.
      const D = 7, z = oz + p.y + D / 2, H = 13;
      k.block(w, H - 1, D, cx, 0, z, 'wood'); k.block(w + 1, 1, D + 1.4, cx, H - 1, z, 'black');
      k.box(w - 2, 0.3, 0.3, cx, 1, z + D / 2 + 0.2, 'glow', { colour: TONE.warm, cast: false });
      for (let i = 0; i < Math.floor(w / 3); i++) { const bx = x0 + 2 + i * 3; k.cyl(0.6, 0.6, 3.6, bx, H + 1.8, z - D / 2 + 1, 'clearglass', { seg: 8, cast: false }); k.cyl(0.55, 0.55, 2.4, bx, H + 1.2, z - D / 2 + 1, 'glow', { colour: ['#e0a64e', '#c94a4a', '#4fc58a', '#c9dcf0'][i % 4], a: 0.45, seg: 8, cast: false }); }
      for (let i = 0; i < Math.floor(w / 12); i++) { const sx = x0 + 6 + i * 12; k.cyl(2, 2, 0.8, sx, 10, z + D / 2 + 4, 'paint', { colour: '#3b3330', seg: 14 }); k.cyl(0.35, 0.35, 10, sx, 5, z + D / 2 + 4, 'chrome', { seg: 6 }); k.torus(1.6, 0.2, sx, 4, z + D / 2 + 4, 'chrome', { rot: [Math.PI / 2, 0, 0], seg: 14 }); k.cyl(2, 2, 0.4, sx, 0.2, z + D / 2 + 4, 'black', { seg: 14 }); }
      pool(cx, z + 4, w * 0.6, TONE.warm, 0.25);
      return true;
    }
    case 'onair': {
      const y = WH - 5;
      k.box(w, p.h, 1.4, cx, y, backZ + 0.8, 'black');
      k.face(w - 1, p.h - 1, cx, y, backZ + 1.55, `screen:panel:${TONE.red}:0`);
      pool(cx, backZ + 1, w * 1.2, TONE.red, 0.3, 'wall', y);
      return true;
    }
    case 'acoustic': {
      // Foam panels across a wall: opts.side left/right/back, a grid of squares with a gap between.
      const side = o.side || 'back', n = Math.max(1, Math.floor((side === 'back' ? w : p.h) / 9));
      for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) {
        const y = 14 + j * 9;
        if (side === 'back') k.box(8, 8, 1.4, x0 + 4.5 + i * 9, y, backZ + 0.7, 'foam');
        else { const bx = side === 'left' ? ctx.ox + 4.7 : ctx.ox + ctx.rw - 4.7; k.box(1.4, 8, 8, bx, y, oz + p.y + 4.5 + i * 9, 'foam'); }
      }
      return true;
    }
    case 'studiolight': {
      const z = oz + p.y + p.h / 2, aim = o.aim ?? -0.6;
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; k.box(0.4, 13, 0.4, cx + Math.cos(a) * 2, 6, z + Math.sin(a) * 2, 'black', { rot: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25] }); }
      k.cyl(0.35, 0.35, 10, cx, 16, z, 'black', { seg: 6 });
      k.box(7, 7, 4, cx, 22, z, 'black', { rot: [0, aim, 0] });
      k.box(6.4, 6.4, 0.3, cx + Math.sin(aim) * 2.1, 22, z + Math.cos(aim) * 2.1, 'glow', { colour: '#fff4e6', rot: [0, aim, 0], cast: false });
      pool(cx + Math.sin(aim) * 14, z + Math.cos(aim) * 14, 26, '#fff4e6', 0.3);
      return true;
    }
    case 'alarm': {
      const z = backZ + 1.6, y = WH - 3;
      k.cyl(1.4, 1.6, 1, cx, y - 1, z, 'black', { seg: 12 });
      k.sphere(1.5, cx, y + 0.4, z, 'led0', { colour: o.colour || TONE.red, detail: 1, cast: false });
      pool(cx, z, 12, o.colour || TONE.red, 0.3, 'wall', y);
      return true;
    }
    case 'treadmill': {
      const z = oz + p.y + p.h / 2, D = p.h;
      k.block(w, 2, D, cx, 0, z, 'black'); k.block(w - 3, 0.3, D - 3, cx, 2, z, 'rubber', { cast: false });
      for (const ez of [-1, 1]) { k.box(0.8, 12, 0.8, x0 + 1.4, 8, z + ez * (D / 2 - 0.6), 'steel', { rot: [0, 0, -0.2] }); k.box(6, 0.6, 0.6, x0 + 4, 11, z + ez * (D / 2 - 0.6), 'black'); }
      k.box(2, 4, D - 2, x0 + 2.6, 14, z, 'black', { rot: [0, 0, 0.5] });
      k.face(D - 4, 2.6, x0 + 3.4, 14.4, z, `screen:chart:${TONE.green}:0`, { rot: [0, Math.PI / 2, 0.5] });
      return true;
    }
    case 'watercooler': {
      const z = oz + p.y + p.h / 2;
      k.block(w, 13, p.h, cx, 0, z, 'ceramic'); k.box(w * 0.6, 3, 0.3, cx, 9, z + p.h / 2 + 0.1, 'black', { cast: false });
      k.cyl(w / 2 - 0.4, w / 2 - 0.4, 7, cx, 16.6, z, 'clearglass', { seg: 14, cast: false }); k.cyl(w / 2 - 0.6, w / 2 - 0.6, 5, cx, 16, z, 'glow', { colour: '#9ec6de', a: 0.3, seg: 14, cast: false });
      return true;
    }
    case 'console': {
      // An operator console under a wall of screens: a low cabinet, a raked panel of keys and lamps, small displays.
      const D = Math.max(6, p.h), z = oz + p.y + D / 2, H = 9, col = o.colour ? accentOf(o.colour) : tint;
      k.block(w, H, D, cx, 0, z, 'black'); k.block(w - 1, 0.8, 0.4, cx, 0.4, z + D / 2, 'panel', { cast: false });
      k.box(w, 0.35, 0.35, cx, H, z + D / 2, 'trim', { cast: false });
      k.box(w - 0.6, 0.6, D * 0.8, cx, H + 0.9, z - D * 0.05, 'panel', { rot: [-0.32, 0, 0] });
      const n = Math.max(1, Math.floor(w / 22));
      for (let i = 0; i < n; i++) { const sx2 = x0 + (w / n) * (i + 0.5); k.face(Math.min(12, w / n - 4), 2.8, sx2, H + 1.45, z - D * 0.12, `screen:${['data', 'wave', 'chart', 'panel'][i % 4]}:${col}:${i % 3}`, { rot: [-1.25, 0, 0] }); }
      for (let i = 0; i < Math.floor(w / 2.2); i++) k.box(0.7, 0.3, 0.7, x0 + 1.4 + i * 2.2, H + 1.1, z + D * 0.28, `led${i % 3}`, { colour: i % 7 === 0 ? TONE.amber : col, cast: false });
      pool(cx, z + D, w * 0.5, col, 0.14);
      return true;
    }
    case 'jack': {
      // A trolley jack: a low red chassis on four wheels, the saddle, the long handle laid back.
      const z = oz + p.y + p.h / 2;
      k.block(w * 0.7, 2.2, p.h - 1, cx, 0.8, z, 'gloss', { colour: '#a8242a' });
      for (const ex of [x0 + 1, x0 + w * 0.7 - 1]) for (const ez of [-1, 1]) k.cyl(0.8, 0.8, 0.6, ex, 0.8, z + ez * (p.h / 2 - 0.4), 'black', { rot: [Math.PI / 2, 0, 0], seg: 10 });
      k.cyl(1.4, 1.4, 0.6, x0 + 1.5, 3.6, z, 'steel', { seg: 12 });
      k.box(w * 0.6, 0.5, 0.5, x0 + w * 0.7 + w * 0.15, 2.4, z, 'chrome', { rot: [0, 0, 0.25] });
      return true;
    }
    case 'diagcart': {
      // A diagnostic cart: a rolling stand, a screen angled to the bay, the lead coiled on the side.
      const z = oz + p.y + p.h / 2;
      k.block(w, 1, p.h, cx, 1, z, 'black');
      for (const ex of [x0 + 0.8, x1 - 0.8]) for (const ez of [-1, 1]) k.sphere(0.6, ex, 0.6, z + ez * (p.h / 2 - 0.8), 'black', { detail: 0, cast: false });
      k.block(1, 12, 1, cx, 2, z, 'steel'); k.block(w - 1, 3, p.h - 2, cx, 6, z, 'ceramic');
      k.box(w + 1, w * 0.62, 0.8, cx, 17, z, 'black', { rot: [-0.3, 0, 0] });
      k.face(w, w * 0.56, cx, 17.1, z + 0.45, `screen:chart:${TONE.green}:1`, { rot: [-0.3, 0, 0] });
      k.torus(1.6, 0.35, x1 + 0.4, 9, z, 'black', { rot: [0, Math.PI / 2, 0], seg: 16 });
      pool(cx, z + 4, 12, TONE.green, 0.18);
      return true;
    }
    case 'displaycase': {
      const z = oz + p.y + p.h / 2;
      k.block(w, 9, p.h, cx, 0, z, 'black'); k.block(w, 7, p.h, cx, 9, z, 'clearglass', { cast: false }); k.block(w, 0.4, p.h, cx, 16, z, 'black');
      for (let i = 0; i < Math.floor(w / 4); i++) k.block(2.4, 3 + r() * 2, 2.4, x0 + 2.5 + i * 4, 9, z, 'paint', { colour: ['#d8d4ca', '#d6728f', '#c9b8a4'][i % 3] });
      k.box(w - 1, 0.3, 0.3, cx, 15.6, z + p.h / 2 - 0.4, 'glow', { colour: TONE.cold, cast: false });
      pool(cx, z, w * 0.6, TONE.cold, 0.18, 'floor', 9.1);
      return true;
    }
    default: return false;
  }
}
