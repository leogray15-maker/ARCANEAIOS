/**
 * Furniture — every prop in config/props.js, built in three dimensions.
 *
 * The placements are the same ones the pixel floor used: room-local
 * [x, y, w, h] in a 204x114 room. What a placement *means* depends on its
 * type: a display hangs on the back wall, a cabinet stands against it, a
 * desk stands in the room with its depth taken from the lower part of its
 * footprint (the top-down art drew its height into the same rect). Heights
 * come from the table below, in the same units as the walls: a person is
 * about twenty-four tall, a desk twelve.
 *
 * Each builder adds pieces to the kit and may add light: a pool on the
 * floor under a lamp, a wash on the wall around a screen. Those pools are
 * where most of the "lit by real things" impression comes from, and they
 * cost one additive draw for the whole building.
 */
import { accentOf, TONE, rng } from './materials.js';

const CONTENT = { queue: 'data', wave: 'wave', map: 'map', post: 'data', log: 'data' };

export function buildProp(k, p, ctx) {
  const { ox, oz, backZ, WH, accent, pools } = ctx;
  const r = rng(`${ctx.id}-${p.type}-${p.x}-${p.y}`);
  const o = p.opts || {};
  const tint = o.colour ? accentOf(o.colour) : o.accent ? accentOf(o.accent) : accent;
  const x0 = ox + p.x, x1 = ox + p.x + p.w, cx = (x0 + x1) / 2, w = p.w;
  const againstWall = p.y < 36;
  // Floor footprint: the lower part of the top-down rect, snapped to the wall when the piece stands against it.
  const depth = (f = 0.6, min = 3) => Math.max(min, Math.min(p.h, p.h * f));
  const zOf = (d) => (againstWall ? backZ + d / 2 + 0.2 : oz + p.y + p.h - d / 2);
  // Wall panels: higher on the wall the higher they sit in the top-down art.
  const panelY = (ph) => Math.max(ph / 2 + 8, Math.min(WH - 5 - ph / 2, WH - 4 - (p.y - 22) * 0.9 - ph / 2));
  const wallZ = backZ + 0.9;
  const pool = (x, z, rad, colour, a = 0.5, kind = 'floor', y = 0) => pools.push({ x, z, r: rad, colour, a, kind, y });
  const screen = (sw, sh, x, y, z, kind, colour = tint, opts = {}) => {
    k.box(sw + 1.6, sh + 1.6, 1.2, x, y, z - 0.4, 'black', opts.frame || {});
    k.face(sw, sh, x, y, z + 0.25, `screen:${kind}:${colour}:${Math.floor(r() * 3)}`, opts);
    if (!opts.noSpill) pool(x, z + 0.5, Math.max(sw, sh) * 1.1, colour, 0.16, 'wall', y);
  };
  const panel = (kind, colour = tint) => {
    const ph = Math.max(4, p.h * 0.8), y = panelY(ph);
    screen(w - 1, ph, cx, y, wallZ + 0.6, kind, colour);
    pool(cx, wallZ + 6, w * 0.7, colour, 0.12);
  };
  const legs = (lw, ld, h, x, z, key = 'black', t = 1) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.block(t, h, t, x + sx * (lw / 2 - t), 0, z + sz * (ld / 2 - t), key); };
  const deskTop = (h, key, d) => { const z = zOf(d); k.block(w, 1.4, d, cx, h - 1.4, z, key); return z; };
  const monitor = (x, y0, z, mw = 9, kind = 'data', colour = tint) => { k.block(1, 2.5, 1, x, y0, z, 'black'); screen(mw, mw * 0.58, x, y0 + 2.5 + mw * 0.29, z, kind, colour, { noSpill: true }); pool(x, z + 4, mw * 1.3, colour, 0.18); };
  const books = (x, y0, z, len, hmax = 6) => { let bx = x - len / 2; while (bx < x + len / 2 - 1) { const bw = 0.8 + r() * 1.2, bh = hmax * (0.6 + r() * 0.4); k.block(bw, bh, 3.2, bx + bw / 2, y0, z, 'paint', { colour: ['#5a2f2a', '#2c3a4e', '#3e4a35', '#6b5a3a', '#2a2a30', '#7a6a55'][Math.floor(r() * 6)] }); bx += bw + 0.15; } };

  switch (p.type) {
    /* ---------- displays on the back wall ---------- */
    case 'screen': case 'wallscreen': case 'bigscreen': {
      if (p.y > 44) { const d = depth(0.4, 3), z = zOf(d); k.block(2, 8, 2, cx, 0, z, 'black'); screen(w - 2, p.h * 0.7, cx, 8 + p.h * 0.35, z, o.map ? 'map' : 'chart'); break; }
      panel(o.map ? 'map' : p.type === 'bigscreen' ? (r() < 0.5 ? 'chart' : 'data') : 'data'); break;
    }
    case 'screenwall': {
      const kinds = o.panels || ['data', 'chart'], n = kinds.length, ph = Math.max(6, p.h * 0.85), y = panelY(ph);
      const sw = (w - (n - 1) * 1.5) / n;
      kinds.forEach((kd, i) => screen(sw - 1, ph, x0 + sw / 2 + i * (sw + 1.5), y, wallZ + 0.6, CONTENT[kd] || 'chart'));
      pool(cx, wallZ + 8, w * 0.6, tint, 0.18); break;
    }
    case 'chartscreen': case 'cashdisplay': case 'funnel': case 'healthdash': panel('chart', p.type === 'cashdisplay' ? TONE.gold : p.type === 'healthdash' ? TONE.green : tint); break;
    case 'buildmonitor': case 'tickertape': case 'orderboard': panel('data', p.type === 'orderboard' ? TONE.rose : tint); break;
    case 'statuspanel': case 'sessionclocks': case 'cardwall': panel('panel', p.type === 'cardwall' ? TONE.green : tint); break;
    case 'blueprint': panel('map', TONE.steel); break;
    case 'window': {
      const ph = Math.max(10, p.h * 0.9), y = panelY(ph);
      k.box(w + 2, ph + 2, 1.6, cx, y, wallZ, 'trim');
      k.face(w - 1, ph - 1, cx, y, wallZ + 1, 'screen:city:#b8c8dc:0');
      k.box(0.8, ph, 0.8, cx, y, wallZ + 1.2, 'trim');
      pool(cx, wallZ + 18, w * 1.1, TONE.cold, 0.22); pool(cx, wallZ + 1, w, TONE.cold, 0.1, 'wall', y);
      break;
    }
    case 'board': case 'corkboard': {
      const ph = Math.max(8, p.h * 0.8), y = panelY(ph);
      k.box(w, ph, 1, cx, y, wallZ, 'wood');
      k.box(w - 2, ph - 2, 0.4, cx, y, wallZ + 0.6, 'paint', { colour: o.kind === 'doctrine' ? '#1c2028' : '#6a5038' });
      for (let i = 0; i < Math.max(3, w / 4); i++) k.box(2.4 + r() * 2, 3 + r() * 2, 0.2, x0 + 2 + r() * (w - 4), y - ph / 2 + 3 + r() * (ph - 6), wallZ + 0.9, 'paint', { colour: r() < 0.3 ? '#c8b98e' : '#d9d6cc', cast: false });
      if (o.kind === 'doctrine') pool(cx, wallZ + 1, w, TONE.violet, 0.1, 'wall', y);
      break;
    }
    case 'toolwall': {
      const ph = Math.max(8, p.h * 0.8), y = panelY(ph);
      k.box(w, ph, 0.8, cx, y, wallZ, 'paint', { colour: '#23272c' });
      for (let i = 0; i < w / 3.5; i++) { const tx = x0 + 2 + i * 3.5, th = 3 + r() * 5; k.box(0.7, th, 0.7, tx, y + ph / 2 - 2 - th / 2, wallZ + 1, r() < 0.3 ? 'copper' : 'steel'); }
      break;
    }
    case 'switchwall': {
      const ph = Math.max(10, p.h * 0.85), y = panelY(ph);
      k.box(w, ph, 2, cx, y, wallZ + 0.4, 'black');
      for (let i = 0; i < w / 3; i++) for (let j = 0; j < 3; j++) k.box(0.7, 0.7, 0.4, x0 + 2 + i * 3, y + ph / 2 - 3 - j * 3, wallZ + 1.6, `led${(i + j) % 3}`, { colour: r() < 0.15 ? TONE.red : r() < 0.5 ? TONE.green : TONE.amber, cast: false });
      for (let i = 0; i < w / 6; i++) k.box(1.2, 3, 1.4, x0 + 3 + i * 6, y - ph / 4, wallZ + 2, 'steel');
      break;
    }
    case 'sign': {
      const y = WH - 6;
      k.box(w + 1, 5, 1, cx, y, wallZ, 'black');
      k.box(w - 3, 0.7, 0.3, cx, y - 1.2, wallZ + 0.6, 'glow', { colour: tint, cast: false });
      k.box(2, 2, 0.3, x0 + 2, y + 0.8, wallZ + 0.6, 'glow', { colour: tint, cast: false });
      pool(cx, wallZ + 1, w * 1.2, tint, 0.18, 'wall', y);
      break;
    }
    case 'neonsign': {
      const y = panelY(p.h);
      k.box(w, p.h, 0.6, cx, y, wallZ, 'black');
      for (let i = 0; i < 3; i++) k.box(w * (0.85 - i * 0.18), 0.5, 0.5, cx, y + p.h * 0.3 - i * p.h * 0.3, wallZ + 0.8, 'glow', { colour: tint, cast: false });
      pool(cx, wallZ + 1, w * 1.4, tint, 0.3, 'wall', y); pool(cx, wallZ + 12, w, tint, 0.18);
      break;
    }
    case 'stringlights': {
      const y = WH - 12;
      for (let i = 0; i <= w / 6; i++) { const lx = x0 + i * 6, sag = Math.sin((i / (w / 6)) * Math.PI) * 4; k.sphere(0.6, lx, y - sag, wallZ + 3, 'glow', { colour: TONE.warm, detail: 0, cast: false }); }
      pool(cx, wallZ + 8, w * 0.6, TONE.warm, 0.22);
      break;
    }
    case 'clock': {
      const y = WH - 7;
      k.cyl(3, 3, 1, cx, y, wallZ + 0.5, 'black', { rot: [Math.PI / 2, 0, 0], seg: 20 });
      k.torus(2.6, 0.2, cx, y, wallZ + 1.1, 'glow', { colour: TONE.cold, cast: false });
      k.box(0.3, 2, 0.2, cx, y + 0.8, wallZ + 1.2, 'glow', { colour: TONE.cold, cast: false });
      break;
    }
    case 'vent': {
      const y = panelY(p.h);
      k.box(w, p.h * 0.8, 1.2, cx, y, wallZ, 'black');
      for (let i = 0; i < 4; i++) k.box(w - 2, 0.5, 0.6, cx, y - p.h * 0.3 + i * p.h * 0.2, wallZ + 0.8, 'steel');
      break;
    }
    case 'hazard': {
      const y = 5;
      for (let i = 0; i < w / 2; i++) k.box(2, 3, 0.4, x0 + 1 + i * 2, y, wallZ + 0.2, 'paint', { colour: i % 2 ? '#15161a' : '#b58a2a', cast: false });
      break;
    }
    case 'pipe': {
      k.cyl(1.4, 1.4, WH, cx, WH / 2, wallZ + 2, 'copper', { seg: 10 });
      for (let y = 8; y < WH; y += 12) k.cyl(1.9, 1.9, 1.2, cx, y, wallZ + 2, 'steel', { seg: 10 });
      break;
    }
    case 'lever': {
      const y = panelY(p.h);
      k.box(w, p.h * 0.8, 2, cx, y, wallZ + 0.5, 'steel');
      k.box(1, 6, 1, cx, y + 2, wallZ + 2.5, 'black', { rot: [0.4, 0, 0] });
      k.sphere(1, cx, y + 5, wallZ + 3.8, 'gloss', { colour: '#9a2a24', detail: 0 });
      break;
    }
    case 'radio': {
      const d = depth(0.6), z = zOf(d), h = 12;
      k.block(w, h, d, cx, 0, z, 'black');
      for (let i = 0; i < 3; i++) k.cyl(1, 1, 0.8, x0 + 3 + i * (w - 6) / 2, h * 0.6, z + d / 2 + 0.3, 'steel', { rot: [Math.PI / 2, 0, 0], seg: 10 });
      k.box(w * 0.6, 1.5, 0.3, cx, h * 0.85, z + d / 2 + 0.2, 'glow', { colour: TONE.amber, cast: false });
      break;
    }

    /* ---------- standing against the wall ---------- */
    case 'coldstore': {
      const d = 10, z = zOf(d), h = 38;
      k.block(w, h, d, cx, 0, z, 'ceramic');
      k.box(w - 3, h - 8, 0.4, cx, h / 2 + 1, z + d / 2 + 0.3, 'glass', { cast: false });
      k.box(w - 5, 0.6, 0.3, cx, h - 4, z + d / 2 + 0.5, 'glow', { colour: o.kind === 'cryo' ? TONE.cold : TONE.cyan, cast: false });
      k.box(1, 9, 1, x1 - 3, h / 2, z + d / 2 + 0.8, 'trim');
      k.box(2, 1, 0.3, x0 + 3, h - 2, z + d / 2 + 0.5, 'led0', { colour: TONE.green, cast: false });
      pool(cx, z + d / 2 + 6, w * 0.8, TONE.cyan, 0.12);
      break;
    }
    case 'vialrack': {
      const d = 6, z = zOf(d), h = 18, vial = o.tint === 'green' ? TONE.green : TONE.cyan;
      k.block(w, 0.8, d, cx, h * 0.45, z, 'steel'); k.block(w, 0.8, d, cx, h, z, 'steel');
      k.block(0.8, h, d, x0 + 0.4, 0, z, 'steel'); k.block(0.8, h, d, x1 - 0.4, 0, z, 'steel');
      k.block(w - 2, h * 0.45, d - 1, cx, 0, z, 'black');
      for (const sy of [h * 0.45 + 0.8, h + 0.8]) for (let i = 0; i < w / 2.2; i++) k.cyl(0.6, 0.6, 3.2, x0 + 1.5 + i * 2.2, sy + 1.6, z + (r() - 0.5) * 2, 'glow', { colour: vial, seg: 6, cast: false, a: 0.55 });
      pool(cx, z + 3, w * 0.7, vial, 0.12, 'wall', h);
      break;
    }
    case 'cabinet': case 'lockedcabinet': case 'locker': {
      const d = Math.min(9, depth(0.5)), z = zOf(d), h = p.type === 'locker' ? 26 : p.type === 'lockedcabinet' ? 24 : Math.min(24, 10 + p.h * 0.6);
      const key = p.type === 'locker' && o.colour ? 'gloss' : p.type === 'lockedcabinet' ? 'black' : 'steel';
      const colour = p.type === 'locker' && o.colour ? shade(o.colour, 0.45) : '#ffffff';
      k.block(w, h, d, cx, 0, z, key, { colour });
      const n = p.type === 'locker' ? Math.max(2, Math.round(w / 8)) : 1;
      for (let i = 1; i < n; i++) k.box(0.3, h - 2, 0.3, x0 + (w / n) * i, h / 2, z + d / 2 + 0.1, 'black', { cast: false });
      const rows = p.type === 'locker' ? 0 : 3;
      for (let i = 1; i <= rows; i++) { k.box(w - 1.5, 0.3, 0.3, cx, (h / (rows + 1)) * i, z + d / 2 + 0.1, 'black', { cast: false }); k.box(3, 0.6, 0.6, cx, (h / (rows + 1)) * i + 2, z + d / 2 + 0.3, 'trim', { cast: false }); }
      if (p.type === 'lockedcabinet') k.box(1.2, 1.2, 0.3, x1 - 2.5, h - 3, z + d / 2 + 0.2, 'led1', { colour: TONE.red, cast: false });
      if (p.type === 'locker') for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) k.box(w / n - 3, 0.4, 0.3, x0 + (w / n) * (i + 0.5), h - 3 - j * 1.2, z + d / 2 + 0.1, 'black', { cast: false });
      break;
    }
    case 'shelf': case 'productshelf': case 'maprack': case 'cardcatalogue': {
      const d = 7, z = zOf(d), h = p.type === 'cardcatalogue' ? 18 : p.type === 'productshelf' ? 26 : Math.min(32, 14 + p.h * 0.6);
      const frame = p.type === 'productshelf' ? 'steel' : 'wood';
      k.block(1, h, d, x0 + 0.5, 0, z, frame); k.block(1, h, d, x1 - 0.5, 0, z, frame); k.block(w, h, 0.6, cx, 0, z - d / 2 + 0.3, frame === 'wood' ? 'wood' : 'black');
      if (p.type === 'cardcatalogue') { k.block(w - 2, h - 1, d - 1, cx, 0, z, 'wood'); for (let i = 0; i < w / 4; i++) for (let j = 0; j < 4; j++) k.box(1.4, 0.5, 0.3, x0 + 2 + i * 4, 3 + j * 4, z + d / 2, 'trim', { cast: false }); break; }
      const shelves = Math.max(2, Math.round(h / 8));
      for (let s = 0; s <= shelves; s++) {
        const sy = (h / shelves) * s;
        k.block(w - 1, 0.8, d, cx, sy, z, frame);
        if (s === shelves) break;
        if (p.type === 'shelf') books(cx, sy + 0.8, z + 0.5, w - 3, h / shelves - 1.5);
        else if (p.type === 'productshelf') { for (let i = 0; i < w / 3; i++) k.block(2, 3 + r() * 1.5, 2.4, x0 + 2 + i * 3, sy + 0.8, z + 1, 'paint', { colour: r() < 0.6 ? '#d8d4ca' : '#c9b8a4' }); k.box(w - 3, 0.3, 0.3, cx, sy + h / shelves - 1, z + d / 2, 'glow', { colour: TONE.cold, cast: false }); }
        else for (let i = 0; i < w / 3; i++) k.cyl(1, 1, d - 1, x0 + 2 + i * 3, sy + 1.8, z, 'paint', { colour: '#cfc4a8', rot: [Math.PI / 2, 0, 0], seg: 8 });
      }
      if (p.type === 'productshelf') pool(cx, z + 6, w * 0.6, TONE.cold, 0.1);
      break;
    }
    case 'servers': case 'rack': {
      const d = Math.min(12, Math.max(7, depth(0.4))), z = zOf(d), h = p.type === 'servers' ? 36 : Math.min(34, 14 + p.h * 0.6);
      k.block(w, h, d, cx, 0, z, 'black');
      k.block(w - 2, h - 2, 0.4, cx, 1, z + d / 2 + 0.2, 'glass', { cast: false });
      for (let u = 3; u < h - 2; u += 2.6) { k.box(w - 3, 0.25, 0.3, cx, u, z + d / 2 + 0.4, 'steel', { cast: false }); for (let i = 0; i < 3; i++) k.box(0.5, 0.5, 0.2, x0 + 2 + i * 1.2 + r() * (w - 6), u + 1, z + d / 2 + 0.5, `led${Math.floor(r() * 3)}`, { colour: r() < 0.08 ? TONE.amber : r() < 0.5 ? TONE.green : tint, cast: false }); }
      k.box(w - 1, 0.5, 0.4, cx, h - 0.6, z + d / 2 + 0.3, 'glow', { colour: tint, cast: false });
      pool(cx, z + d / 2 + 5, w * 0.9, tint, 0.14);
      break;
    }
    case 'safe': case 'goldcase': {
      const d = Math.min(12, depth(0.6)), z = zOf(d), h = p.type === 'safe' ? 20 : 14;
      if (p.type === 'safe') { k.block(w, h, d, cx, 0, z, 'black'); k.cyl(3, 3, 1, cx, h / 2, z + d / 2 + 0.5, 'trim', { rot: [Math.PI / 2, 0, 0], seg: 18 }); k.box(1, 4, 1, cx + w / 2 - 3, h / 2, z + d / 2 + 0.6, 'steel'); k.box(1.4, 1, 0.3, x0 + 3, h - 3, z + d / 2 + 0.2, 'led2', { colour: TONE.green, cast: false }); }
      else { k.block(w, 8, d, cx, 0, z, 'black'); k.block(w, 6, d, cx, 8, z, 'glass', { cast: false }); for (let i = 0; i < w / 4; i++) k.block(3, 1.4, 1.8, x0 + 2.5 + i * 4, 8, z, 'gloss', { colour: '#c99a3a' }); pool(cx, z, w, TONE.gold, 0.2, 'floor', 8.2); }
      break;
    }
    case 'archiveterminal': {
      const d = depth(0.5), z = zOf(d);
      k.block(w * 0.6, 14, d * 0.6, cx, 0, z, 'black');
      screen(w * 0.8, 8, cx, 18, z + 1, 'data', TONE.cyan, { rot: [-0.25, 0, 0] });
      break;
    }
    case 'extinguisher': {
      const z = againstWall ? backZ + 2.4 : zOf(4);
      k.cyl(1.6, 1.6, 9, cx, 4.5, z, 'gloss', { colour: '#8e1f1c', seg: 12 });
      k.box(2, 1.5, 1.5, cx, 9.5, z, 'black');
      break;
    }
    case 'ladder': {
      const z = backZ + 4;
      for (const sx of [-1, 1]) k.box(0.8, WH - 6, 0.8, cx + sx * (w / 2 - 1), (WH - 6) / 2, z, 'steel', { rot: [-0.12, 0, 0] });
      for (let y = 4; y < WH - 8; y += 4) k.box(w - 2, 0.5, 0.5, cx, y, z + 0.5 - y * 0.12, 'steel');
      break;
    }
    case 'lift': {
      const d = depth(0.7), z = zOf(d);
      for (const sx of [-1, 1]) k.block(1.2, 30, 1.2, cx + sx * (w / 2 - 1), 0, z - d / 2 + 1, 'black');
      k.block(w, 1, d, cx, 6, z, 'grate');
      k.box(w, 0.5, 0.5, cx, 30, z - d / 2 + 1, 'glow', { colour: TONE.amber, cast: false });
      break;
    }
    case 'mast': {
      const z = oz + p.y + p.h - 4;
      k.cyl(0.8, 1.2, 34, cx, 17, z, 'steel', { seg: 8 });
      k.cyl(4, 6, 1.4, cx, 10, z, 'black', { seg: 10 });
      k.cyl(6, 1, 3, cx, 30, z, 'ceramic', { rot: [-0.9, 0, 0], seg: 16 });
      k.sphere(0.7, cx, 34.5, z, 'led0', { colour: TONE.red, detail: 0, cast: false });
      break;
    }

    /* ---------- tables and work surfaces ---------- */
    case 'desk': case 'table': case 'workbench': case 'packbench': case 'coa': {
      const d = depth(p.type === 'table' ? 0.75 : 0.62, 6), h = p.type === 'workbench' || p.type === 'packbench' ? 13 : 12;
      const top = p.type === 'workbench' || o.tone === 'steel' || p.type === 'coa' ? 'steel' : 'wood';
      const z = deskTop(h, top, d);
      if (p.type === 'workbench' || p.type === 'packbench') k.block(w - 2, h - 4, d - 2, cx, 0, z, 'black');
      else { legs(w, d, h - 1.4, cx, z, 'black'); if (p.type === 'desk') k.block(w * 0.35, h - 2, d - 1, x0 + w * 0.2, 0, z, 'black'); }
      const items = o.items || (p.type === 'coa' ? ['instrument', 'terminal'] : p.type === 'packbench' ? ['parcels'] : p.type === 'workbench' ? ['tools'] : []);
      let ix = x0 + 4;
      for (const it of items) {
        if (it === 'terminal' || it === 'secure') { monitor(ix + 5, h, z - d / 4, 9, 'data', o.accent ? accentOf(o.accent) : tint); ix += 12; }
        else if (it === 'dual') { monitor(ix + 5, h, z - d / 4, 8, 'chart'); monitor(ix + 14, h, z - d / 4, 8, 'data'); ix += 20; }
        else if (it === 'keyboard') { k.block(7, 0.5, 2.5, ix + 4, h, z + d / 4, 'black'); ix += 9; }
        else if (it === 'papers') { for (let i = 0; i < 3; i++) k.block(4, 0.15, 5, ix + 3 + i * 0.6, h + i * 0.15, z + (r() - 0.5) * 2, 'paint', { colour: '#d8d4c8', cast: false, rot: [0, (r() - 0.5) * 0.5, 0] }); ix += 7; }
        else if (it === 'mug') { k.cyl(0.9, 0.8, 2, ix + 1, h + 1, z + d / 4, 'ceramic', { seg: 8 }); ix += 4; }
        else if (it === 'printer') { k.block(7, 4, 5, ix + 4, h, z, 'ceramic'); ix += 9; }
        else if (it === 'instrument') { k.block(10, 7, d - 2, ix + 5, h, z, 'ceramic'); screen(5, 3, ix + 5, h + 4.5, z + (d - 2) / 2 + 0.2, 'panel', TONE.cyan, { noSpill: true }); ix += 13; }
        else if (it === 'parcels') { for (let i = 0; i < 3; i++) k.block(5, 3 + r() * 2, 4, ix + 3 + i * 6, h, z, 'paint', { colour: '#9c7a52' }); ix += 18; }
        else if (it === 'tools') { for (let i = 0; i < 5; i++) k.block(1 + r() * 2, 1, 1 + r() * 3, ix + i * 4, h, z + (r() - 0.5) * 3, r() < 0.5 ? 'steel' : 'copper'); ix += 20; }
      }
      if (o.device) k.box(3, 1, 3, x1 - 5, h + 0.5, z, 'glow', { colour: TONE.cyan, cast: false });
      if (p.type === 'desk' || p.type === 'coa') pool(cx, z, w * 0.7, TONE.warm, 0.1);
      break;
    }
    case 'tradingdesk': case 'signaldesk': {
      const d = depth(0.55, 8), h = 12, z = deskTop(h, 'black', d);
      k.block(w - 2, h - 2, d - 1, cx, 0, z, 'black');
      const n = Math.max(2, Math.round(w / 22));
      for (let i = 0; i < n; i++) { const mx = x0 + (w / n) * (i + 0.5); monitor(mx, h, z - d / 4, Math.min(14, w / n - 3), p.type === 'tradingdesk' ? (i % 2 ? 'chart' : 'data') : (i % 2 ? 'wave' : 'map'), p.type === 'tradingdesk' ? (i % 2 ? TONE.green : TONE.amber) : tint); }
      for (let i = 0; i < w / 4; i++) k.box(1, 0.4, 1, x0 + 2 + i * 4, h + 0.2, z + d / 3, `led${i % 3}`, { colour: tint, cast: false });
      break;
    }
    case 'commandtable': {
      const d = depth(0.7, 10), z = zOf(d), h = 11;
      k.block(w - 4, h - 1, d - 4, cx, 0, z, 'black');
      k.block(w, 1, d, cx, h - 1, z, 'trim');
      k.flat(w - 3, d - 3, cx, h + 0.06, z, `screen:map:${TONE.violet}:1`, { uv: 'local' });
      k.box(w, 0.4, 0.4, cx, h - 0.2, z + d / 2, 'glow', { colour: TONE.violet, cast: false });
      pool(cx, z, w * 1.1, TONE.violet, 0.22); pool(cx, z, w * 0.8, TONE.violet, 0.25, 'floor', h + 0.15);
      break;
    }
    case 'council': {
      const d = depth(0.8, 10), z = zOf(d), rad = Math.min(w, d * 1.6) / 2;
      k.cyl(rad, rad, 1.6, cx, 10, z, 'wood', { seg: 32 });
      k.cyl(rad * 0.4, rad * 0.5, 9, cx, 4.5, z, 'black', { seg: 16 });
      k.torus(rad * 0.7, 0.25, cx, 10.9, z, 'glow', { colour: TONE.gold, rot: [Math.PI / 2, 0, 0], seg: 40, cast: false });
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; k.block(3.5, 7, 3.5, cx + Math.cos(a) * (rad + 3), 0, z + Math.sin(a) * (rad + 3) * 0.7, 'paint', { colour: '#2a2d33' }); }
      pool(cx, z, rad * 2.4, TONE.gold, 0.22);
      break;
    }
    case 'balance': case 'instrument': case 'fraction': case 'scales': {
      const d = depth(0.6, 5), z = zOf(d), h = p.type === 'instrument' ? 16 : 11;
      k.block(w, h, d, cx, 0, z, p.type === 'scales' ? 'black' : 'ceramic');
      if (p.type === 'instrument') { k.block(w * 0.5, 6, d * 0.8, x0 + w * 0.3, h, z, 'ceramic'); screen(w * 0.35, 5, x1 - w * 0.25, h - 4, z + d / 2 + 0.3, 'chart', TONE.cyan, { noSpill: true }); }
      if (p.type === 'balance') { k.cyl(3, 3, 5, cx, h + 2.5, z, 'glass', { seg: 16, cast: false }); }
      if (p.type === 'fraction') for (let i = 0; i < w / 2.5; i++) k.cyl(0.6, 0.6, 4, x0 + 1.5 + i * 2.5, h + 2, z, 'glow', { colour: i % 3 ? TONE.cyan : TONE.amber, seg: 6, cast: false, a: 0.6 });
      break;
    }
    case 'lectern': case 'till': case 'stall': {
      const d = depth(0.6, 6), z = zOf(d), h = p.type === 'lectern' ? 14 : 12;
      const colour = shade(o.colour ? accentOf(o.colour) : '#5a4a3c', 0.5);
      k.block(w, h, d, cx, 0, z, p.type === 'stall' ? 'paint' : 'wood', { colour });
      if (p.type === 'lectern') k.block(w, 1, d + 2, cx, h, z, 'wood', { rot: [-0.3, 0, 0] });
      if (p.type === 'till') monitor(x0 + 8, h, z, 7, 'data', TONE.rose);
      if (p.type === 'stall') { for (const sx of [-1, 1]) k.block(1, 26, 1, cx + sx * (w / 2 - 1), 0, z - d / 2, 'steel'); for (let i = 0; i < w / 4; i++) k.box(4, 0.6, 9, x0 + 2 + i * 4, 25, z, 'paint', { colour: i % 2 ? colour : '#d8d0c4', rot: [0.25, 0, 0] }); pool(cx, z, w * 0.6, TONE.warm, 0.14); }
      break;
    }

    /* ---------- seats ---------- */
    case 'chair': case 'stool': case 'armchair': {
      const s = Math.min(p.w, p.h), z = oz + p.y + p.h - s / 2, colour = o.tone === 'wood' ? '#4a3427' : '#262a31';
      if (p.type === 'stool') { k.cyl(s / 2.4, s / 2.4, 1, cx, 6, z, 'paint', { colour, seg: 12 }); k.cyl(0.4, 0.4, 6, cx, 3, z, 'steel', { seg: 6 }); k.cyl(s / 3, s / 3, 0.4, cx, 0.3, z, 'black', { seg: 12 }); break; }
      k.block(s, 1.5, s, cx, 5, z, 'paint', { colour });
      k.block(s, s * 0.9, 1.2, cx, 6.5, z + s / 2 - 0.6, 'paint', { colour });
      k.cyl(0.4, 0.4, 5, cx, 2.5, z, 'steel', { seg: 6 });
      k.cyl(s / 2.5, s / 2.5, 0.4, cx, 0.2, z, 'black', { seg: 10 });
      if (p.type === 'armchair') { k.block(1.5, 4, s, cx - s / 2, 5, z, 'paint', { colour }); k.block(1.5, 4, s, cx + s / 2, 5, z, 'paint', { colour }); }
      break;
    }
    case 'sofa': case 'bed': {
      const d = depth(0.75, 8), z = zOf(d), colour = shade(o.colour || '#3a3f48', 0.75);
      if (p.type === 'bed') { k.block(w, 4, d, cx, 0, z, 'wood'); k.block(w - 1, 3, d - 1, cx, 4, z, 'paint', { colour: '#c6c2b8' }); k.block(w - 2, 0.8, d * 0.55, cx, 7, z + d * 0.2, 'paint', { colour }); k.block(w * 0.3, 2, d * 0.3, x0 + w * 0.2, 7, z - d * 0.3, 'paint', { colour: '#e2ded4' }); break; }
      k.block(w, 5, d, cx, 0, z, 'paint', { colour });
      k.block(w, 6, 2.5, cx, 5, z - d / 2 + 1.25, 'paint', { colour: shade(colour, 0.85) });
      k.block(2, 3, d, x0 + 1, 5, z, 'paint', { colour }); k.block(2, 3, d, x1 - 1, 5, z, 'paint', { colour });
      for (let i = 0; i < Math.floor(w / 10); i++) k.box(0.2, 1.5, d - 3, x0 + 2 + (i + 1) * ((w - 4) / Math.floor(w / 10 + 1)), 5.7, z + 1, 'paint', { colour: shade(colour, 0.7), cast: false });
      break;
    }

    /* ---------- the floor and what sits on it ---------- */
    case 'rug': case 'floormat': case 'grate': {
      const z = oz + p.y + p.h / 2;
      if (p.type === 'grate') { k.block(w, 0.3, p.h, cx, 0, z, 'grate', { cast: false }); break; }
      const colour = p.type === 'floormat' ? '#1a1c20' : shade(o.colour || '#2a2d3a', 0.9);
      k.block(w, 0.3, p.h, cx, 0, z, 'paint', { colour, cast: false });
      if (p.type === 'rug') k.block(w - 3, 0.32, p.h - 3, cx, 0, z, 'paint', { colour: shade(colour, 1.25), cast: false });
      else for (let i = 0; i < w / 3; i++) k.block(1.5, 0.35, 1, x0 + 1 + i * 3, 0, z - p.h / 2 + 0.6, 'paint', { colour: '#b58a2a', cast: false });
      break;
    }
    case 'cable': case 'cabletray': {
      const z = oz + p.y + p.h / 2;
      if (p.type === 'cabletray') { k.block(w, 1, p.h, cx, 0, z, 'steel', { cast: false }); for (let i = 0; i < 3; i++) k.cyl(0.5, 0.5, w, cx, 1.3, z - 1 + i, 'black', { rot: [0, 0, Math.PI / 2], seg: 6, cast: false }); }
      else for (let i = 0; i < 2; i++) k.cyl(0.45, 0.45, w, cx, 0.5, z + i * 1.1, i ? 'copper' : 'black', { rot: [0, 0, Math.PI / 2], seg: 6, cast: false });
      break;
    }
    case 'crate': case 'boxes': case 'parcels': {
      const z0 = oz + p.y + p.h;
      if (p.type === 'crate') { const s = Math.min(w, p.h * 0.8, 12), z = z0 - s / 2; k.block(s, s * 0.8, s, cx, 0, z, 'wood', { rot: [0, (r() - 0.5) * 0.3, 0] }); k.block(s + 0.3, 1, s + 0.3, cx, s * 0.4, z, 'paint', { colour: '#3a2a1e', cast: false }); break; }
      const n = p.type === 'parcels' ? 4 : 3;
      for (let i = 0; i < n; i++) { const bw = Math.min(w / 2, 4 + r() * 4), bh = 3 + r() * 4, bd = 3 + r() * 3, bx = x0 + bw / 2 + r() * (w - bw), stack = i === n - 1 && r() < 0.6; k.block(bw, bh, bd, bx, stack ? 5 : 0, z0 - bd / 2 - r() * 2, 'paint', { colour: r() < 0.5 ? '#8e6f4e' : '#a1825e', rot: [0, (r() - 0.5) * 0.4, 0] }); if (p.type === 'parcels') k.block(bw + 0.1, 0.2, 1, bx, (stack ? 5 : 0) + bh, z0 - bd / 2, 'paint', { colour: '#c9bfa8', cast: false }); }
      break;
    }
    case 'barrel': {
      const z = oz + p.y + p.h - w / 2;
      k.cyl(w / 2, w / 2, 14, cx, 7, z, 'gloss', { colour: shade(o.colour || '#4a5060', 0.8), seg: 16 });
      for (const y of [3, 11]) k.cyl(w / 2 + 0.2, w / 2 + 0.2, 0.8, cx, y, z, 'black', { seg: 16 });
      if (o.mark) k.box(w * 0.5, 2, 0.2, cx, 7, z + w / 2 + 0.1, 'paint', { colour: o.mark, cast: false });
      break;
    }
    case 'bin': case 'wastebin': {
      const z = oz + p.y + p.h - w / 2;
      k.cyl(w / 2, w / 2.4, 7, cx, 3.5, z, p.type === 'wastebin' ? 'gloss' : 'black', { colour: '#7a6a2a', seg: 10 });
      break;
    }
    case 'plant': {
      const z = oz + p.y + p.h - w / 2;
      k.cyl(w / 2.4, w / 3, 5, cx, 2.5, z, 'ceramic', { seg: 10 });
      for (let i = 0; i < 5; i++) k.sphere(w * (0.3 + r() * 0.15), cx + (r() - 0.5) * w * 0.5, 7 + r() * 6, z + (r() - 0.5) * w * 0.5, 'leaf', { colour: ['#2f4a33', '#3c5a3a', '#26402c'][i % 3], detail: 0, scale: [1, 1.3, 1] });
      break;
    }
    case 'kettlebell': {
      const z = oz + p.y + p.h - w / 2;
      k.sphere(w / 2.6, cx, w / 2.6, z, 'black', { detail: 1 });
      k.torus(w / 4, 0.5, cx, w / 1.4, z, 'black', { seg: 10 });
      break;
    }
    case 'lamp': case 'readinglamp': case 'candle': {
      const z = oz + p.y + p.h - 2;
      if (p.type === 'candle') { k.cyl(0.6, 0.6, 3, cx, 1.5, z, 'ceramic', { seg: 6 }); k.sphere(0.5, cx, 3.6, z, 'glow', { colour: TONE.warm, detail: 0, cast: false }); pool(cx, z, 14, TONE.warm, 0.3); break; }
      const h = p.type === 'lamp' ? 22 : 15;
      k.cyl(2.5, 2.5, 0.6, cx, 0.3, z, 'black', { seg: 12 });
      k.cyl(0.35, 0.35, h, cx, h / 2, z, 'trim', { seg: 6 });
      k.cyl(2.2, 3.4, 3.5, cx, h, z, 'paint', { colour: '#d6c7a8', seg: 14, open: true });
      k.sphere(1.2, cx, h - 0.8, z, 'glow', { colour: TONE.warm, detail: 1, cast: false });
      pool(cx, z, p.type === 'lamp' ? 26 : 18, TONE.warm, 0.2);
      break;
    }
    case 'coins': {
      const z = oz + p.y + p.h - 3;
      for (let i = 0; i < 4; i++) { const n = 2 + Math.floor(r() * 5); for (let j = 0; j < n; j++) k.cyl(1.2, 1.2, 0.5, x0 + 2 + i * (w / 4), 0.25 + j * 0.5, z + (r() - 0.5), 'gloss', { colour: '#c4963a', seg: 10 }); }
      break;
    }
    case 'globe': {
      const z = oz + p.y + p.h - w / 2;
      k.cyl(2, 3, 1, cx, 0.5, z, 'wood', { seg: 10 }); k.cyl(0.4, 0.4, 8, cx, 4.5, z, 'trim', { seg: 6 });
      k.sphere(w / 2.4, cx, 9 + w / 2.4, z, 'gloss', { colour: '#2b4660', detail: 2 });
      k.torus(w / 2.4 + 0.6, 0.25, cx, 9 + w / 2.4, z, 'trim', { rot: [0, 0, 0.4], seg: 24 });
      break;
    }
    case 'telescope': {
      const z = oz + p.y + p.h - 4;
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; k.box(0.6, 12, 0.6, cx + Math.cos(a) * 2, 6, z + Math.sin(a) * 2, 'black', { rot: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25] }); }
      k.cyl(1.4, 2, 14, cx, 15, z - 2, 'trim', { rot: [-0.9, 0, 0], seg: 12 });
      break;
    }
    case 'anvil': {
      const z = oz + p.y + p.h - 5;
      k.cyl(3.5, 4, 6, cx, 3, z, 'wood', { seg: 10 });
      k.block(w * 0.8, 3, 4, cx, 6, z, 'black'); k.block(w * 0.4, 1.5, 3, cx + w * 0.45, 7, z, 'black');
      break;
    }
    case 'printer3d': {
      const d = depth(0.6, 8), z = zOf(d);
      k.block(w, 2, d, cx, 0, z, 'black'); k.block(w, 2, d, cx, 20, z, 'black');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.block(1, 18, 1, cx + sx * (w / 2 - 0.5), 2, z + sz * (d / 2 - 0.5), 'steel');
      k.block(w - 4, 0.6, d - 3, cx, 7, z, 'steel'); k.block(4, 4, 4, cx, 7.6, z, 'glow', { colour: TONE.cyan, a: 0.6, cast: false });
      pool(cx, z, w, TONE.cyan, 0.2);
      break;
    }
    case 'hearth': {
      const d = 12, z = backZ + d / 2, h = 30;
      k.block(w, h, d, cx, 0, z, 'wall');
      k.block(w - 8, 12, 2, cx, 2, z + d / 2 - 0.5, 'glow', { colour: '#ff8a3a', cast: false });
      k.block(w - 6, 2, d + 2, cx, 14, z + 1, 'black');
      pool(cx, z + d / 2 + 10, w * 1.6, '#ff8a3a', 0.6); pool(cx, z + d / 2, w * 1.2, '#ff8a3a', 0.3, 'wall', 8);
      break;
    }
    case 'holo': {
      const z = oz + p.y + p.h - w / 2;
      k.cyl(w / 2.5, w / 2, 3, cx, 1.5, z, 'steel', { seg: 16 });
      k.cyl(w / 3, w / 2.6, 0.4, cx, 3.2, z, 'glow', { colour: tint, seg: 16, cast: false });
      k.cyl(w / 4, w / 3, 20, cx, 13, z, 'beam:up', { colour: tint, a: 0.6, seg: 16, open: true, cast: false, receive: false, uv: 'local' });
      k.sphere(w / 6, cx, 14, z, 'glow', { colour: tint, detail: 1, a: 0.8, cast: false });
      pool(cx, z, w * 2.2, tint, 0.35);
      break;
    }
    case 'camera': case 'rope': case 'journal': case 'scrolls': {
      const z = oz + p.y + p.h - 3;
      if (p.type === 'camera') { for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; k.box(0.5, 10, 0.5, cx + Math.cos(a) * 1.6, 5, z + Math.sin(a) * 1.6, 'black', { rot: [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2] }); } k.block(5, 4, 4, cx, 10, z, 'black'); k.cyl(1.4, 1.4, 3, cx, 12, z + 3, 'black', { rot: [Math.PI / 2, 0, 0], seg: 12 }); k.box(0.8, 0.8, 0.3, cx + 1.5, 13.2, z - 1.9, 'led0', { colour: TONE.red, cast: false }); }
      else if (p.type === 'rope') { for (const sx of [0, 1]) { k.cyl(0.6, 0.6, 9, x0 + sx * w, 4.5, z, 'trim', { seg: 8 }); k.cyl(1.8, 1.8, 0.6, x0 + sx * w, 0.3, z, 'trim', { seg: 12 }); } k.cyl(0.4, 0.4, w, cx, 7.5, z, 'paint', { colour: '#7a1f24', rot: [0, 0, Math.PI / 2], seg: 6 }); }
      else if (p.type === 'journal') { k.block(w * 0.6, 8, 3, cx, 0, z, 'wood'); k.block(w * 0.7, 0.6, 5, cx, 8, z, 'paint', { colour: '#3c2a22', rot: [-0.2, 0, 0] }); }
      else for (let i = 0; i < 4; i++) k.cyl(0.8, 0.8, w * 0.6, cx, 0.8 + (i % 2) * 1.4, z - i, 'paint', { colour: '#cdbf9e', rot: [0, 0, Math.PI / 2], seg: 8 });
      break;
    }
    case 'vanquish': {
      // The car in THE AGENT GARAGE: a low grand tourer, lacquered, on the lift pad.
      const d = depth(0.75, 14), z = zOf(d), colour = '#4a3a8a';
      k.block(w * 0.98, 4.5, d * 0.8, cx, 2.2, z, 'gloss', { colour });
      k.block(w * 0.5, 3.5, d * 0.66, cx - w * 0.04, 6.7, z, 'glass');
      k.block(w * 0.98, 0.5, d * 0.82, cx, 6.6, z, 'gloss', { colour: shade(colour, 0.7) });
      for (const sx of [-0.32, 0.32]) for (const sz of [-1, 1]) k.cyl(2.4, 2.4, 2, cx + sx * w, 2.4, z + sz * d * 0.4, 'black', { rot: [Math.PI / 2, 0, 0], seg: 14 });
      k.box(0.5, 1, d * 0.6, x1 - 0.6, 4, z, 'glow', { colour: TONE.cold, cast: false }); k.box(0.5, 0.8, d * 0.6, x0 + 0.4, 4.5, z, 'glow', { colour: TONE.red, cast: false });
      pool(cx, z, w * 1.1, TONE.violet, 0.12);
      break;
    }
    case 'bookstack': {
      const z = oz + p.y + p.h - 3;
      let y = 0; for (let i = 0; i < 3 + Math.floor(r() * 3); i++) { const bh = 1 + r() * 0.8; k.block(w * (0.7 + r() * 0.3), bh, 4 + r(), cx + (r() - 0.5), y, z, 'paint', { colour: ['#5a2f2a', '#2c3a4e', '#3e4a35', '#6b5a3a', '#7a6a55'][Math.floor(r() * 5)], rot: [0, (r() - 0.5) * 0.4, 0] }); y += bh; }
      break;
    }
    default: {
      const d = depth(0.6, 3), z = zOf(d);
      k.block(w, Math.min(14, 4 + p.h * 0.4), d, cx, 0, z, 'steel');
    }
  }
}

/** Darken (f < 1) or lighten (f > 1) a hex colour. */
export function shade(hex, f) {
  const h = accentOf(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}
