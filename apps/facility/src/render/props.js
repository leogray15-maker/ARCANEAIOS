/**
 * Prop painters.
 *
 * Every prop is a function (g, x, y, w, h, o, t) drawing in absolute buffer
 * pixels: `o` is the placement's options, `t` is time in seconds for the
 * few that move. Each prop has volume — a top face, a front face, a darker
 * edge, a 1px outline and a cast shadow — so it sits on the floor instead
 * of lying on it. Props that emit light draw a soft radial onto the floor
 * first; that glow is what makes a room feel lit rather than coloured.
 *
 * `WALL_MOUNTED` props are painted with the room (behind everything);
 * the rest are sorted with the crew by their bottom edge so a figure can
 * stand behind a desk.
 */
import { PX, accent } from './palette.js';

const OUT = '#0b0b12';
const rgba = (hexc, a) => { const n = parseInt(hexc.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const mix = (a, b, t) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); const ch = (s) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t); return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`; };
const dark = (c, t = 0.4) => mix(c, '#05050a', t);
const lit = (c, t = 0.3) => mix(c, '#ffffff', t);

/* ---------- toolkit ---------- */

function shadow(g, x, y, w, h) { g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(x + 2, y + h - 1, w, 2); g.fillRect(x + w, y + 3, 2, h - 3); }
function outline(g, x, y, w, h) { g.fillStyle = OUT; g.fillRect(x - 1, y - 1, w + 2, 1); g.fillRect(x - 1, y + h, w + 2, 1); g.fillRect(x - 1, y, 1, h); g.fillRect(x + w, y, 1, h); }
/** A block with a lit top band and a darker base line. `top` is the height of the top face. */
function box(g, x, y, w, h, c, top = 3) {
  shadow(g, x, y, w, h); outline(g, x, y, w, h);
  g.fillStyle = c; g.fillRect(x, y, w, h);
  g.fillStyle = lit(c, 0.28); g.fillRect(x, y, w, top);
  g.fillStyle = lit(c, 0.5); g.fillRect(x, y, w, 1);
  g.fillStyle = dark(c, 0.45); g.fillRect(x, y + h - 2, w, 2);
  g.fillStyle = dark(c, 0.25); g.fillRect(x + w - 1, y, 1, h);
}
function glow(g, cx, cy, r, c, a = 0.22) {
  const gr = g.createRadialGradient(cx, cy, 1, cx, cy, r);
  gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
}
function px(g, x, y, c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
/** A screen face: dark glass, faint scanlines, a few lit "lines" of content, occasional blink. */
function screenFace(g, x, y, w, h, c, t, seed = 0) {
  g.fillStyle = '#0a0c14'; g.fillRect(x, y, w, h);
  g.fillStyle = rgba(c, 0.12); for (let yy = y + 1; yy < y + h; yy += 2) g.fillRect(x, yy, w, 1);
  const lines = Math.max(1, Math.floor((h - 4) / 3));
  for (let i = 0; i < lines; i++) {
    const on = Math.sin(t * 1.3 + seed + i * 1.7) > -0.6;
    const len = Math.max(3, Math.floor((w - 6) * (0.35 + 0.6 * Math.abs(Math.sin(seed * 3 + i * 2.1)))));
    g.fillStyle = rgba(c, on ? 0.85 : 0.3); g.fillRect(x + 2, y + 2 + i * 3, len, 1);
  }
  g.fillStyle = rgba('#ffffff', 0.08); g.fillRect(x, y, w, 1);
}

/* ---------- painters ---------- */

export const PAINT = {
  /* generic furniture */
  desk(g, x, y, w, h, o, t) {
    const c = o.tone === 'steel' ? PX.steel : PX.wood;
    box(g, x, y, w, h, c, 4);
    g.fillStyle = dark(c, 0.55); g.fillRect(x + 2, y + h - 1, 2, 1); g.fillRect(x + w - 4, y + h - 1, 2, 1);
    let ix = x + 3;
    for (const item of o.items || []) {
      if (item === 'terminal') { PAINT.terminal(g, ix, y - 9, 14, 12, o, t); ix += 17; }
      else if (item === 'papers') { g.fillStyle = '#d8d6e4'; g.fillRect(ix, y + 1, 7, 5); g.fillStyle = '#9a98a8'; g.fillRect(ix + 1, y + 2, 4, 1); g.fillRect(ix + 1, y + 4, 5, 1); ix += 9; }
      else if (item === 'mug') { g.fillStyle = o.accent || PX.flare; g.fillRect(ix, y + 1, 3, 3); px(g, ix + 3, y + 2, o.accent || PX.flare); ix += 6; }
      else if (item === 'ledger') { g.fillStyle = '#5a3a20'; g.fillRect(ix, y + 1, 8, 6); g.fillStyle = PX.gold; g.fillRect(ix + 1, y + 2, 6, 1); ix += 10; }
      else if (item === 'lamp') { g.fillStyle = PX.steel; g.fillRect(ix + 2, y - 6, 1, 7); g.fillStyle = PX.flare; g.fillRect(ix, y - 8, 5, 3); glow(g, ix + 2, y - 2, 16, PX.flare, 0.28); ix += 8; }
      else if (item === 'candle') { g.fillStyle = '#e8e2d0'; g.fillRect(ix + 1, y - 3, 2, 5); const f = Math.sin(t * 9) > 0 ? 0 : 1; px(g, ix + 1, y - 4 - f, PX.flare); px(g, ix + 2, y - 5 - f, '#ffe9a0'); glow(g, ix + 2, y - 3, 14, PX.flare, 0.22); ix += 6; }
      else if (item === 'quill') { g.fillStyle = '#ecebf5'; g.fillRect(ix, y + 1, 1, 1); g.fillRect(ix + 1, y, 1, 1); g.fillRect(ix + 2, y - 1, 1, 1); px(g, ix, y + 2, '#1b1b28'); ix += 5; }
      else if (item === 'bookstack') { PAINT.bookstack(g, ix, y - 3, 8, 6, o, t); ix += 10; }
      else if (item === 'vial') { g.fillStyle = '#bfe8ff'; g.fillRect(ix, y, 2, 4); px(g, ix, y - 1, '#ecebf5'); ix += 4; }
      else if (item === 'coffee') { g.fillStyle = '#ecebf5'; g.fillRect(ix, y + 1, 3, 3); px(g, ix + 1, y, '#6b4a32'); ix += 6; }
      else if (item === 'secure') { PAINT.secureterminal(g, ix, y - 9, 14, 12, o, t); ix += 17; }
      else if (item === 'keyboard') { g.fillStyle = '#1b1b28'; g.fillRect(ix, y + 2, 10, 3); g.fillStyle = '#5a5a72'; for (let k = 0; k < 4; k++) g.fillRect(ix + 1 + k * 2, y + 3, 1, 1); ix += 12; }
      else if (item === 'dual') { PAINT.terminal(g, ix, y - 9, 13, 12, o, t); PAINT.terminal(g, ix + 14, y - 9, 13, 12, o, t + 1.7); ix += 30; }
      else if (item === 'printer') { box(g, ix, y - 3, 12, 7, '#d8d6e0', 2); g.fillStyle = '#ecebf5'; g.fillRect(ix + 3, y - 6, 6, 3); g.fillStyle = Math.sin(t * 3) > 0 ? PX.vital : '#1b1b28'; g.fillRect(ix + 9, y + 1, 2, 1); ix += 14; }
      else if (item === 'phone') { g.fillStyle = '#1b1b28'; g.fillRect(ix, y + 1, 6, 4); g.fillStyle = '#5a5a72'; g.fillRect(ix + 1, y + 2, 4, 1); ix += 8; }
      else if (item === 'contract') { g.fillStyle = '#e8e6f0'; g.fillRect(ix, y + 1, 9, 6); g.fillStyle = '#8a8898'; g.fillRect(ix + 1, y + 3, 6, 1); g.fillRect(ix + 1, y + 5, 4, 1); px(g, ix + 7, y + 5, PX.gold); ix += 11; }
    }
  },
  /** An on-desk monitor: stand, bezel, lit face. Called by `desk` for its items and usable on its own. */
  terminal(g, x, y, w, h, o, t) {
    const c = o.accent && o.accent.startsWith('#') ? o.accent : (accent(o.colour) || PX.cyan);
    g.fillStyle = OUT; g.fillRect(x + w / 2 - 2, y + h - 3, 4, 3); g.fillStyle = PX.steel; g.fillRect(x + w / 2 - 1, y + h - 3, 2, 2);
    outline(g, x, y, w, h - 3); g.fillStyle = '#1a1c28'; g.fillRect(x, y, w, h - 3);
    screenFace(g, x + 1, y + 1, w - 2, h - 5, c, t, x * 0.02 + y * 0.01);
    glow(g, x + w / 2, y + h + 3, w, c, 0.14);
  },
  chair(g, x, y, w, h, o) { const c = o.tone === 'wood' ? PX.wood : '#3a3a52'; box(g, x, y + 3, w, h - 3, c, 2); g.fillStyle = dark(c, 0.2); g.fillRect(x, y, w, 3); outline(g, x, y, w, 3); g.fillStyle = lit(c, 0.3); g.fillRect(x + 1, y, w - 2, 1); },
  table(g, x, y, w, h, o, t) {
    const c = o.tone === 'steel' ? PX.steel : PX.wood; shadow(g, x, y, w, h);
    g.fillStyle = OUT; g.fillRect(x - 1, y - 1, w + 2, h + 2); g.fillStyle = c; g.fillRect(x, y, w, h);
    g.fillStyle = lit(c, 0.25); g.fillRect(x + 1, y, w - 2, 3); g.fillStyle = dark(c, 0.45); g.fillRect(x + 1, y + h - 2, w - 2, 2);
    if (o.items) PAINT.desk(g, x + 4, y + 2, w - 8, h - 6, { ...o, tone: 'none', _bare: true }, t), g.fillStyle = c, g.fillRect(x + 4, y + 2, w - 8, 2);
  },
  sofa(g, x, y, w, h, o) { const c = o.colour || '#5a3f6e'; box(g, x, y + 3, w, h - 3, c, 3); g.fillStyle = dark(c, 0.25); g.fillRect(x, y, w, 4); g.fillRect(x, y, 3, h); g.fillRect(x + w - 3, y, 3, h); outline(g, x, y, w, h); g.fillStyle = lit(c, 0.3); g.fillRect(x + 3, y + 4, w - 6, 1); },
  bed(g, x, y, w, h, o) { box(g, x, y, w, h, '#3a3a52', 2); g.fillStyle = '#d8d6e4'; g.fillRect(x + 2, y + 2, 12, h - 4); g.fillStyle = o.colour || '#4b3d7a'; g.fillRect(x + 15, y + 2, w - 17, h - 4); g.fillStyle = lit(o.colour || '#4b3d7a', 0.25); g.fillRect(x + 15, y + 2, w - 17, 2); },
  rug(g, x, y, w, h, o) {
    // Woven, and a touch lighter than the floor, so it reads as cloth rather than a pit.
    const c = lit(o.colour || '#3a2a4a', 0.12);
    g.fillStyle = c; g.fillRect(x, y, w, h);
    g.fillStyle = dark(c, 0.3); for (let yy = y + 1; yy < y + h; yy += 3) for (let xx = x + ((yy - y) % 6 === 1 ? 2 : 0); xx < x + w; xx += 4) g.fillRect(xx, yy, 2, 1);
    g.fillStyle = lit(c, 0.35); g.fillRect(x + 1, y + 1, w - 2, 1); g.fillRect(x + 1, y + h - 2, w - 2, 1); g.fillRect(x + 1, y + 1, 1, h - 2); g.fillRect(x + w - 2, y + 1, 1, h - 2);
    g.fillStyle = dark(c, 0.5); g.fillRect(x, y + h - 1, w, 1);
  },
  cabinet(g, x, y, w, h, o) { const c = o.tone === 'wood' ? PX.wood : '#4a4e60'; box(g, x, y, w, h, c, 2); const n = Math.max(2, Math.floor((h - 4) / 7)); for (let i = 0; i < n; i++) { const dy = y + 3 + i * ((h - 4) / n); g.fillStyle = dark(c, 0.3); g.fillRect(x + 2, dy, w - 4, 1); g.fillStyle = lit(c, 0.5); g.fillRect(x + w / 2 - 1, dy + 2, 2, 1); } },
  locker(g, x, y, w, h, o) { box(g, x, y, w, h, '#3f4456', 2); g.fillStyle = dark('#3f4456', 0.35); for (let i = x + 1; i < x + w - 1; i += 6) g.fillRect(i + 5, y + 2, 1, h - 4); g.fillStyle = o.colour || PX.cyan; for (let i = x + 1; i < x + w - 1; i += 6) g.fillRect(i + 2, y + 5, 2, 1); },
  shelf(g, x, y, w, h, o) {
    const c = PX.wood; box(g, x, y, w, h, dark(c, 0.3), 2);
    const rows = o.rows || Math.max(2, Math.floor((h - 4) / 8));
    const spines = ['#8b5cf6', '#56c9f0', '#3ecf8e', '#e8b64c', '#d9a441', '#e0609a', '#a98bff', '#b5b0c8', '#7a4e2f', '#5a6070'];
    let k = (x * 7 + y * 3) | 0;
    for (let r = 0; r < rows; r++) {
      const sy = y + 3 + r * ((h - 4) / rows); const sh = Math.floor((h - 4) / rows) - 2;
      g.fillStyle = lit(c, 0.2); g.fillRect(x + 1, sy + sh, w - 2, 1);
      for (let sx = x + 2; sx < x + w - 3;) { const bw = 1 + (k % 3); const bh = sh - (k % 2); g.fillStyle = spines[k % spines.length]; g.fillRect(sx, sy + sh - bh, bw, bh); sx += bw + 1; k = (k * 1103515245 + 12345) >>> 0; if (k % 9 === 0) sx += 2; }
    }
  },
  bookstack(g, x, y, w, h, o) { const cs = ['#7a4e2f', '#8b5cf6', '#56c9f0', '#d9a441', '#e0609a']; shadow(g, x, y, w, h); let yy = y + h; let k = x + y; while (yy > y + 1) { const bh = 2; yy -= bh; g.fillStyle = OUT; g.fillRect(x - 1, yy - 1, w + 2, bh + 1); g.fillStyle = cs[k % cs.length]; g.fillRect(x + (k % 2), yy, w - (k % 2), bh); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + (k % 2), yy, w - (k % 2), 1); k += 3; } },
  crate(g, x, y, w, h) { box(g, x, y, w, h, '#6b4a32', 2); g.fillStyle = dark('#6b4a32', 0.35); g.fillRect(x + 1, y + 3, w - 2, 1); g.fillRect(x + 1, y + h - 4, w - 2, 1); g.fillStyle = lit('#6b4a32', 0.15); for (let i = 0; i < Math.min(w, h) - 4; i++) { px(g, x + 2 + i, y + 2 + i * (h - 4) / (w - 4) | 0, lit('#6b4a32', 0.15)); } },
  boxes(g, x, y, w, h) { box(g, x, y + h / 2, w * 0.6, h / 2, '#a48a6a', 2); box(g, x + w * 0.35, y, w * 0.65, h * 0.55, '#b89a78', 2); g.fillStyle = PX.rose; g.fillRect(x + w * 0.35 + 2, y + 2, w * 0.65 - 4, 1); g.fillStyle = '#7a5a3a'; g.fillRect(x + 2, y + h / 2 + 2, w * 0.6 - 4, 1); },
  barrel(g, x, y, w, h, o) { const c = o.colour || '#4a5060'; box(g, x, y, w, h, c, 2); g.fillStyle = dark(c, 0.4); g.fillRect(x, y + 4, w, 1); g.fillRect(x, y + h - 5, w, 1); g.fillStyle = lit(c, 0.35); g.fillRect(x + 2, y + 5, 1, h - 10); if (o.mark) { g.fillStyle = o.mark; g.fillRect(x + w / 2 - 1, y + h / 2 - 1, 3, 3); } },
  plant(g, x, y, w, h) { box(g, x + 2, y + h - 6, w - 4, 6, '#6b4a32', 2); const gr = '#2f8a5a'; g.fillStyle = gr; g.fillRect(x + w / 2 - 1, y + 2, 2, h - 8); g.fillRect(x, y + 4, w, 3); g.fillRect(x + 1, y + 1, w - 2, 2); g.fillStyle = lit(gr, 0.3); g.fillRect(x + 1, y + 1, 2, 1); g.fillRect(x + w - 3, y + 4, 2, 1); g.fillStyle = OUT; g.fillRect(x + w / 2 - 2, y, 1, 1); },
  lamp(g, x, y, w, h) { g.fillStyle = PX.steel; g.fillRect(x + w / 2 - 1, y + 5, 2, h - 8); box(g, x + 1, y + h - 3, w - 2, 3, PX.steel, 1); g.fillStyle = PX.flare; g.fillRect(x, y, w, 5); g.fillStyle = lit(PX.flare, 0.4); g.fillRect(x, y, w, 1); outline(g, x, y, w, 5); glow(g, x + w / 2, y + h - 2, 26, PX.flare, 0.22); },
  candle(g, x, y, w, h, o, t) { g.fillStyle = '#e8e2d0'; g.fillRect(x + 1, y + 3, 2, h - 3); const f = Math.sin(t * 11 + x) > 0.2 ? 0 : 1; px(g, x + 1, y + 2 - f, PX.flare); px(g, x + 2, y + 1 - f, '#ffe9a0'); glow(g, x + 2, y + 3, 14, PX.flare, 0.25); },
  pipe(g, x, y, w, h) { g.fillStyle = PX.steel; g.fillRect(x, y, w, h); g.fillStyle = lit(PX.steel, 0.3); g.fillRect(x + 1, y, 1, h); g.fillStyle = dark(PX.steel, 0.4); g.fillRect(x + w - 2, y, 1, h); g.fillStyle = PX.rust; g.fillRect(x - 1, y + 4, w + 2, 2); g.fillRect(x - 1, y + h - 6, w + 2, 2); g.fillStyle = PX.breach; g.fillRect(x + w, y + h / 2, 3, 2); },
  vent(g, x, y, w, h) { box(g, x, y, w, h, '#3a3e4e', 1); g.fillStyle = dark('#3a3e4e', 0.5); for (let yy = y + 2; yy < y + h - 1; yy += 2) g.fillRect(x + 1, yy, w - 2, 1); },
  rope(g, x, y, w, h) { const n = Math.max(2, Math.floor(w / 24) + 1); for (let i = 0; i < n; i++) { const px_ = x + i * (w / (n - 1)); g.fillStyle = PX.steel; g.fillRect(px_, y, 2, h); g.fillStyle = PX.gold; g.fillRect(px_ - 1, y, 4, 2); box(g, px_ - 2, y + h - 2, 6, 2, PX.steel, 1); } g.fillStyle = PX.rose; for (let i = 0; i < n - 1; i++) { const a = x + i * (w / (n - 1)) + 2, b = x + (i + 1) * (w / (n - 1)); for (let xx = a; xx < b; xx++) g.fillRect(xx, y + 2 + Math.round(Math.sin((xx - a) / (b - a) * Math.PI) * 2), 1, 1); } },
  kettlebell(g, x, y, w, h) { g.fillStyle = OUT; g.fillRect(x, y + 3, w, h - 3); g.fillRect(x + 2, y, w - 4, 3); g.fillStyle = '#2a2a3a'; g.fillRect(x + 1, y + 4, w - 2, h - 5); g.fillStyle = '#4a4a5e'; g.fillRect(x + 2, y + 4, 2, 2); g.fillRect(x + 3, y + 1, w - 6, 1); },

  /* wall-mounted */
  screen(g, x, y, w, h, o, t) { const c = accent(o.colour) || PX.cyan; outline(g, x, y, w, h); g.fillStyle = '#1a1c28'; g.fillRect(x, y, w, h); screenFace(g, x + 1, y + 1, w - 2, h - 2, c, t, x * 0.01 + y * 0.02); glow(g, x + w / 2, y + h + 6, w * 0.7, c, 0.12); },
  bigscreen(g, x, y, w, h, o, t) { const c = accent(o.colour) || PX.arcane; outline(g, x, y, w, h); g.fillStyle = '#1a1c28'; g.fillRect(x, y, w, h); screenFace(g, x + 2, y + 2, w - 4, h - 4, c, t, x * 0.013); if (o.map) { g.fillStyle = rgba(c, 0.5); for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) g.fillRect(x + 4 + j * ((w - 8) / 5), y + 4 + i * ((h - 8) / 4), (w - 8) / 5 - 2, 1); const bx = x + 4 + ((t * 20) % (w - 10)); g.fillStyle = lit(c, 0.5); g.fillRect(bx, y + 3, 1, h - 6); } glow(g, x + w / 2, y + h + 8, w * 0.75, c, 0.14); },
  board(g, x, y, w, h, o, t) {
    const kind = o.kind || 'pins';
    if (kind === 'white') { box(g, x, y, w, h, '#d8d6e4', 1); g.fillStyle = '#5c5a70'; for (let i = 0; i < 4; i++) g.fillRect(x + 4, y + 4 + i * 4, (w - 8) * (0.4 + 0.5 * Math.abs(Math.sin(i * 2 + x))), 1); g.fillStyle = PX.breach; g.fillRect(x + w - 10, y + 4, 6, 1); g.fillStyle = PX.cyan; g.fillRect(x + 4, y + h - 6, 8, 2); return; }
    if (kind === 'banner') { g.fillStyle = OUT; g.fillRect(x - 1, y - 1, w + 2, h + 2); g.fillStyle = o.colour ? accent(o.colour) : PX.arcane; g.fillRect(x, y, w, h); g.fillStyle = dark(o.colour ? accent(o.colour) : PX.arcane, 0.4); g.fillRect(x, y + h - 3, w / 2, 3); g.fillStyle = PX.gold; g.fillRect(x + w / 2 - 1, y + 3, 2, 2); g.fillRect(x + w / 2 - 2, y + 6, 4, 1); return; }
    if (kind === 'doctrine') { box(g, x, y, w, h, '#2a2434', 1); g.fillStyle = PX.gold; g.fillRect(x + 3, y + 3, w - 6, 1); g.fillStyle = '#b8b0c8'; for (let i = 0; i < Math.floor((h - 8) / 3); i++) g.fillRect(x + 3, y + 6 + i * 3, (w - 6) * (0.5 + 0.5 * Math.abs(Math.sin(i * 1.3))), 1); return; }
    box(g, x, y, w, h, '#7a5a3a', 1);
    const pins = [PX.breach, PX.flare, PX.cyan, PX.vital, '#ecebf5']; let k = x + y;
    const pts = [];
    for (let i = 0; i < Math.max(4, (w * h) / 180); i++) { const pxx = x + 3 + (k % (w - 6)); k = (k * 1103515245 + 12345) >>> 0; const pyy = y + 3 + (k % (h - 6)); k = (k * 1103515245 + 12345) >>> 0; g.fillStyle = '#e8e6f0'; g.fillRect(pxx - 1, pyy - 1, 4, 3); g.fillStyle = pins[k % pins.length]; px(g, pxx, pyy, pins[k % pins.length]); pts.push([pxx, pyy]); }
    if (o.strings) { g.fillStyle = rgba(PX.breach, 0.7); for (let i = 1; i < pts.length; i += 2) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i]; const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)); for (let s = 0; s <= n; s++) g.fillRect(Math.round(ax + (bx - ax) * s / n), Math.round(ay + (by - ay) * s / n), 1, 1); } }
  },
  window(g, x, y, w, h, o, t) {
    outline(g, x, y, w, h); g.fillStyle = '#3a3a4e'; g.fillRect(x, y, w, h);
    const kind = o.kind || 'stars';
    if (kind === 'stars') { g.fillStyle = '#070912'; g.fillRect(x + 2, y + 2, w - 4, h - 4); let k = x * 3 + y; for (let i = 0; i < (w * h) / 40; i++) { k = (k * 1103515245 + 12345) >>> 0; const sx = x + 2 + (k % (w - 4)); k = (k * 1103515245 + 12345) >>> 0; const sy = y + 2 + (k % (h - 4)); const tw = Math.sin(t * 2 + k) > 0.3 ? '#ecebf5' : '#7e7c94'; px(g, sx, sy, tw); } g.fillStyle = rgba(PX.arcane, 0.25); g.fillRect(x + 2, y + h - 8, w - 4, 6); glow(g, x + w / 2, y + h + 8, w * 0.6, PX.cyan, 0.12); }
    else if (kind === 'dawn') { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#1a1a3a'); gr.addColorStop(0.6, '#6a3a5a'); gr.addColorStop(1, '#e8a060'); g.fillStyle = gr; g.fillRect(x + 2, y + 2, w - 4, h - 4); g.fillStyle = '#ffe0a0'; g.fillRect(x + w / 2 - 3, y + h - 8, 6, 2); g.fillStyle = '#12101c'; g.fillRect(x + 2, y + h - 5, w - 4, 3); glow(g, x + w / 2, y + h + 8, w * 0.6, '#e8a060', 0.18); }
    else { g.fillStyle = '#2a2436'; g.fillRect(x + 2, y + 2, w - 4, h - 4); g.fillStyle = '#4a3a58'; g.fillRect(x + 2, y + 2, w - 4, h / 3); g.fillStyle = PX.flare; for (let i = 0; i < 5; i++) px(g, x + 5 + i * ((w - 10) / 4), y + h - 6 - (i % 2) * 3, PX.flare); glow(g, x + w / 2, y + h + 8, w * 0.6, PX.flare, 0.12); }
    g.fillStyle = '#3a3a4e'; g.fillRect(x + w / 2 - 1, y, 2, h); g.fillRect(x, y + h / 2 - 1, w, 2);
  },
  cardwall(g, x, y, w, h, o, t) { box(g, x, y, w, h, '#22283a', 1); const cols = Math.floor((w - 4) / 8), rows = Math.floor((h - 4) / 6); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const on = Math.sin(t * 0.7 + r * 1.9 + c * 0.8) > -0.5; g.fillStyle = on ? PX.vital : dark(PX.vital, 0.6); g.fillRect(x + 3 + c * 8, y + 3 + r * 6, 6, 4); g.fillStyle = '#0d1a14'; g.fillRect(x + 4 + c * 8, y + 4 + r * 6, 3, 1); } glow(g, x + w / 2, y + h + 6, w * 0.6, PX.vital, 0.12); },
  productshelf(g, x, y, w, h) { box(g, x, y, w, h, '#3a3e4e', 1); const cs = [PX.arcane, PX.arcaneLt, '#ecebf5', PX.rose]; let k = x; for (let r = 0; r < 2; r++) { const sy = y + 3 + r * ((h - 4) / 2); g.fillStyle = lit('#3a3e4e', 0.3); g.fillRect(x + 1, sy + (h - 4) / 2 - 2, w - 2, 1); for (let sx = x + 3; sx < x + w - 5; sx += 6) { g.fillStyle = cs[k % cs.length]; g.fillRect(sx, sy + 1, 4, (h - 4) / 2 - 4); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(sx, sy + 1, 4, 1); k = (k * 7 + 3) | 0; } } g.fillStyle = PX.rose; g.fillRect(x + 2, y + 1, w - 4, 1); glow(g, x + w / 2, y + h + 4, w * 0.5, PX.rose, 0.08); },
  corkboard(g, x, y, w, h, o, t) { PAINT.board(g, x, y, w, h, { kind: 'pins', strings: true }, t); g.fillStyle = '#e8e6f0'; g.fillRect(x + w / 2 - 6, y + h / 2 - 4, 12, 8); g.fillStyle = '#5c5a70'; g.fillRect(x + w / 2 - 5, y + h / 2 - 2, 10, 1); g.fillRect(x + w / 2 - 5, y + h / 2, 7, 1); },
  switchwall(g, x, y, w, h, o, t) { box(g, x, y, w, h, '#2a2c38', 1); const cols = Math.floor((w - 6) / 7), rows = Math.floor((h - 6) / 7); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const sx = x + 4 + c * 7, sy = y + 4 + r * 7; g.fillStyle = '#15161e'; g.fillRect(sx, sy, 5, 5); const deny = (r * 3 + c * 5) % 7 < 4; g.fillStyle = deny ? PX.breach : (c % 3 === 0 ? PX.flare : PX.cyan); g.fillRect(sx + 1, sy + (deny ? 3 : 1), 3, 1); } glow(g, x + w / 2, y + h + 4, w * 0.5, PX.breach, 0.08); },
  maprack(g, x, y, w, h) { box(g, x, y, w, h, '#4a3a2a', 1); for (let i = 0; i < Math.floor((w - 4) / 4); i++) { g.fillStyle = '#e8dcc0'; g.fillRect(x + 3 + i * 4, y + 3, 2, h - 6); g.fillStyle = '#b8a880'; g.fillRect(x + 3 + i * 4, y + 3, 2, 1); } },
  radio(g, x, y, w, h, o, t) { box(g, x, y, w, h, '#3a3e4e', 2); const n = Math.floor((w - 6) / 6); for (let i = 0; i < n; i++) { const on = Math.sin(t * 3 + i * 2.3 + x) > 0.5; g.fillStyle = on ? PX.vital : dark(PX.vital, 0.6); g.fillRect(x + 4 + i * 6, y + 4, 2, 2); g.fillStyle = '#1b1b28'; g.fillRect(x + 3 + i * 6, y + 8, 4, 4); g.fillStyle = PX.ash; g.fillRect(x + 4 + i * 6, y + 9, 1, 2); } g.fillStyle = '#1b1b28'; g.fillRect(x + 3, y + h - 6, w - 6, 3); g.fillStyle = rgba(PX.cyan, 0.8); g.fillRect(x + 4, y + h - 5, ((w - 8) * (0.5 + 0.5 * Math.sin(t * 1.7 + x))) | 0, 1); },
  servers(g, x, y, w, h, o, t) { box(g, x, y, w, h, '#23252f', 1); const rows = Math.floor((h - 4) / 5); for (let r = 0; r < rows; r++) { const sy = y + 3 + r * 5; g.fillStyle = '#31343f'; g.fillRect(x + 2, sy, w - 4, 4); g.fillStyle = dark('#31343f', 0.4); g.fillRect(x + 2, sy + 3, w - 4, 1); for (let i = 0; i < 3; i++) { const on = Math.sin(t * (2 + i) + r * 1.3 + i) > 0.2; g.fillStyle = on ? (i === 2 ? PX.breach : PX.cyan) : '#1b1b28'; g.fillRect(x + w - 5 - i * 3, sy + 1, 2, 1); } } glow(g, x + w / 2, y + h + 4, w * 0.6, PX.cyan, 0.08); },
  workbench(g, x, y, w, h, o, t) { PAINT.desk(g, x, y + h - 12, w, 12, { tone: 'steel' }, t); g.fillStyle = '#4a4e60'; g.fillRect(x, y, w, h - 12); outline(g, x, y, w, h - 12); for (let i = 0; i < Math.floor((w - 4) / 6); i++) { g.fillStyle = [PX.steel, '#ecebf5', PX.rust][i % 3]; g.fillRect(x + 3 + i * 6, y + 3 + (i % 2) * 2, 2, 6 - (i % 2) * 2); } if (o.device) { box(g, x + w / 2 - 8, y + h - 18, 16, 6, '#3a3e4e', 1); g.fillStyle = Math.sin(t * 6) > 0 ? PX.cyan : PX.arcane; g.fillRect(x + w / 2 - 6, y + h - 16, 3, 2); g.fillStyle = PX.rust; g.fillRect(x + w / 2 + 2, y + h - 16, 4, 2); } },
  lift(g, x, y, w, h, o, t) { box(g, x, y + h - 8, w, 8, '#3a3e4e', 2); g.fillStyle = PX.steel; g.fillRect(x + 6, y + 6, 3, h - 14); g.fillRect(x + w - 9, y + 6, 3, h - 14); g.fillStyle = PX.flare; g.fillRect(x + 6, y + 6, 3, 2); g.fillRect(x + w - 9, y + 6, 3, 2); const cx = x + w / 2; g.fillStyle = OUT; g.fillRect(cx - 5, y + 10, 10, 20); g.fillStyle = '#2c2c46'; g.fillRect(cx - 4, y + 22, 8, 7); g.fillStyle = PX.ash; g.fillRect(cx - 4, y + 14, 8, 8); g.fillStyle = '#4a4a66'; g.fillRect(cx - 3, y + 11, 6, 3); const spark = Math.sin(t * 17 + Math.sin(t * 5) * 3) > 0.6; if (spark) { g.fillStyle = '#ffffff'; g.fillRect(cx + 4, y + 18, 2, 2); px(g, cx + 6, y + 16, PX.cyan); px(g, cx + 7, y + 20, PX.flare); glow(g, cx + 4, y + 18, 22, PX.cyan, 0.4); } else glow(g, cx, y + h - 6, 22, PX.cyan, 0.08); },
  lever(g, x, y, w, h, o, t) { box(g, x, y + h - 10, w, 10, '#2a2c38', 2); g.fillStyle = '#1b1b28'; g.fillRect(x + w / 2 - 2, y + h - 12, 4, 4); g.fillStyle = PX.steel; for (let i = 0; i < h - 14; i++) px(g, x + w / 2 + Math.round(i * 0.35), y + h - 12 - i, PX.steel); g.fillStyle = PX.breach; g.fillRect(x + w / 2 + Math.round((h - 14) * 0.35) - 2, y - 1, 5, 5); g.fillStyle = lit(PX.breach, 0.4); g.fillRect(x + w / 2 + Math.round((h - 14) * 0.35) - 1, y, 2, 1); glow(g, x + w / 2, y + h - 4, 22, PX.breach, 0.16); g.fillStyle = Math.sin(t * 2) > 0 ? PX.breach : dark(PX.breach, 0.6); g.fillRect(x + 3, y + h - 7, 3, 2); },
  safe(g, x, y, w, h, o, t) { box(g, x, y, w, h, '#3b3f4c', 2); g.fillStyle = OUT; g.fillRect(x + 4, y + 4, w - 8, h - 8); g.fillStyle = '#4a4e5c'; g.fillRect(x + 5, y + 5, w - 10, h - 10); const cx = x + w / 2, cy = y + h / 2; g.fillStyle = PX.gold; g.fillRect(cx - 5, cy - 5, 10, 10); g.fillStyle = dark(PX.gold, 0.5); g.fillRect(cx - 3, cy - 3, 6, 6); const a = t * 0.8; px(g, Math.round(cx + Math.cos(a) * 3), Math.round(cy + Math.sin(a) * 3), '#ffe9a0'); g.fillStyle = PX.steel; g.fillRect(x + w - 12, y + 8, 3, h - 16); for (let i = 0; i < 3; i++) g.fillRect(x + w - 14, y + 10 + i * ((h - 20) / 2), 7, 2); glow(g, cx, y + h + 4, w * 0.5, PX.gold, 0.14); },
  coins(g, x, y, w, h) { let k = x; for (let i = 0; i < 3; i++) { const cx = x + i * (w / 3), ch = h - (k % 4); g.fillStyle = OUT; g.fillRect(cx - 1, y + h - ch - 1, 5, ch + 2); g.fillStyle = PX.gold; g.fillRect(cx, y + h - ch, 3, ch); g.fillStyle = lit(PX.gold, 0.5); for (let yy = y + h - ch; yy < y + h; yy += 2) g.fillRect(cx, yy, 3, 1); k = (k * 7 + 5) | 0; } },
  lectern(g, x, y, w, h) { box(g, x + w / 2 - 3, y + 8, 6, h - 8, PX.wood, 1); box(g, x, y, w, 8, PX.wood, 3); g.fillStyle = '#e8e6f0'; g.fillRect(x + 2, y + 1, w - 4, 4); g.fillStyle = '#8a8898'; g.fillRect(x + 3, y + 2, w - 7, 1); },
  telescope(g, x, y, w, h) { g.fillStyle = PX.steel; g.fillRect(x + w / 2 - 1, y + h / 2, 2, h / 2); g.fillRect(x + w / 2 - 6, y + h - 2, 12, 2); g.fillRect(x + w / 2 - 5, y + h / 2 + 2, 3, h / 2 - 2); g.fillRect(x + w / 2 + 2, y + h / 2 + 2, 3, h / 2 - 2); const c = '#5a6a8a'; for (let i = 0; i < w * 0.6; i++) { const px_ = x + w / 2 - 4 + i, py_ = y + h / 2 + 2 - Math.round(i * 0.55); g.fillStyle = OUT; g.fillRect(px_, py_ - 1, 1, 5); g.fillStyle = c; g.fillRect(px_, py_, 1, 3); g.fillStyle = lit(c, 0.3); px(g, px_, py_, lit(c, 0.3)); } g.fillStyle = PX.cyan; g.fillRect(x + w / 2 - 4 + Math.floor(w * 0.6), y + h / 2 + 2 - Math.round(w * 0.6 * 0.55) - 1, 2, 4); },
  ladder(g, x, y, w, h) { g.fillStyle = PX.wood; g.fillRect(x, y, 2, h); g.fillRect(x + w - 2, y, 2, h); for (let yy = y + 3; yy < y + h; yy += 5) g.fillRect(x + 2, yy, w - 4, 1); g.fillStyle = dark(PX.wood, 0.4); g.fillRect(x + w - 1, y, 1, h); },
  mast(g, x, y, w, h, o, t) { box(g, x + w / 2 - 4, y + h - 8, 8, 8, PX.steel, 2); g.fillStyle = PX.steel; g.fillRect(x + w / 2 - 1, y + 8, 2, h - 16); g.fillStyle = '#2a2c38'; g.fillRect(x + w / 2 - 4, y + 2, 8, 8); outline(g, x + w / 2 - 4, y + 2, 8, 8); const a = t * 1.6; const bx = x + w / 2 + Math.cos(a) * 2, by = y + 6 + Math.sin(a) * 1.5; g.fillStyle = PX.flare; g.fillRect(x + w / 2 - 2, y + 4, 4, 4); g.fillStyle = '#ffe9a0'; g.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 2, 2); const beam = g.createLinearGradient(x + w / 2, y + 6, x + w / 2 + Math.cos(a) * 60, y + 6 + Math.sin(a) * 30); beam.addColorStop(0, rgba(PX.flare, 0.35)); beam.addColorStop(1, rgba(PX.flare, 0)); g.fillStyle = beam; g.beginPath(); g.moveTo(x + w / 2, y + 6); g.lineTo(x + w / 2 + Math.cos(a - 0.25) * 70, y + 6 + Math.sin(a - 0.25) * 40); g.lineTo(x + w / 2 + Math.cos(a + 0.25) * 70, y + 6 + Math.sin(a + 0.25) * 40); g.closePath(); g.fill(); glow(g, x + w / 2, y + h - 4, 30, PX.flare, 0.18); },
  till(g, x, y, w, h, o, t) { box(g, x, y, w, h, '#4a4e60', 4); g.fillStyle = dark('#4a4e60', 0.3); g.fillRect(x, y + h - 5, w, 1); box(g, x + w - 22, y - 8, 16, 10, '#2a2c38', 2); g.fillStyle = Math.sin(t * 2) > -0.3 ? PX.rose : dark(PX.rose, 0.5); g.fillRect(x + w - 20, y - 6, 12, 3); g.fillStyle = '#ecebf5'; g.fillRect(x + 4, y + 1, 10, 2); g.fillRect(x + 18, y + 1, 6, 2); },
  scales(g, x, y, w, h) { box(g, x, y + h - 4, w, 4, '#d8d6e0', 1); g.fillStyle = '#0a0c14'; g.fillRect(x + 2, y + h - 3, w - 4, 2); g.fillStyle = PX.vital; g.fillRect(x + 3, y + h - 3, 4, 1); g.fillStyle = PX.steel; g.fillRect(x + w / 2 - 1, y, 2, h - 4); g.fillRect(x + w / 2 - 4, y, 8, 1); },
  council(g, x, y, w, h, o, t) {
    // The long table, eight seats and a raised ninth at the head. Candles down the middle.
    PAINT.table(g, x + 12, y + 6, w - 24, h - 12, { tone: 'wood' }, t);
    for (let i = 0; i < 4; i++) { const sx = x + 22 + i * ((w - 44) / 3); PAINT.chair(g, sx, y - 4, 10, 8, { tone: 'wood' }); PAINT.chair(g, sx, y + h - 6, 10, 8, { tone: 'wood' }); }
    PAINT.chair(g, x + w - 12, y + h / 2 - 6, 12, 12, { tone: 'wood' }); g.fillStyle = PX.gold; g.fillRect(x + w - 10, y + h / 2 - 6, 8, 1);
    for (let i = 0; i < 3; i++) PAINT.candle(g, x + 32 + i * ((w - 64) / 2), y + h / 2 - 4, 4, 6, {}, t + i);
    glow(g, x + w / 2, y + h / 2, w * 0.5, PX.gold, 0.12);
  },
  commandtable(g, x, y, w, h, o, t) { box(g, x, y, w, h, '#2a2c3c', 3); g.fillStyle = OUT; g.fillRect(x + 3, y + 3, w - 6, h - 6); g.fillStyle = '#0d1020'; g.fillRect(x + 4, y + 4, w - 8, h - 8); g.fillStyle = rgba(PX.arcane, 0.55); for (let i = 1; i < 4; i++) g.fillRect(x + 4 + i * ((w - 8) / 4), y + 4, 1, h - 8); for (let i = 1; i < 3; i++) g.fillRect(x + 4, y + 4 + i * ((h - 8) / 3), w - 8, 1); const sw = x + 4 + ((t * 25) % (w - 8)); g.fillStyle = rgba(PX.arcaneLt, 0.7); g.fillRect(sw, y + 4, 1, h - 8); for (let i = 0; i < 5; i++) { const on = Math.sin(t * 1.5 + i * 2) > 0; px(g, x + 8 + i * ((w - 16) / 4), y + 6 + (i * 5) % (h - 12), on ? PX.arcaneLt : PX.arcane); } glow(g, x + w / 2, y + h / 2, w * 0.55, PX.arcane, 0.2); },
  blueprint(g, x, y, w, h) { PAINT.table(g, x, y, w, h, { tone: 'wood' }, 0); g.fillStyle = '#1c3a6e'; g.fillRect(x + 4, y + 3, w - 8, h - 7); g.fillStyle = rgba('#9fd0ff', 0.7); for (let i = 0; i < 3; i++) g.fillRect(x + 6, y + 5 + i * 3, w - 14 - i * 6, 1); g.fillRect(x + 6, y + 5, 1, h - 11); g.fillRect(x + w - 10, y + 5, 3, 3); },
  journal(g, x, y, w, h) { PAINT.table(g, x, y, w, h, { tone: 'wood' }, 0); g.fillStyle = '#5a3a20'; g.fillRect(x + 3, y + 2, w - 6, h - 5); g.fillStyle = '#e8e6f0'; g.fillRect(x + 4, y + 3, w - 8, 1); },

  /* ---------- equipment for the priority rooms ---------- */
  camera(g, x, y, w, h, o, t) { g.fillStyle = PX.steel; g.fillRect(x + w / 2 - 1, y + 8, 2, h - 10); g.fillRect(x + w / 2 - 5, y + h - 2, 4, 2); g.fillRect(x + w / 2 + 1, y + h - 2, 4, 2); g.fillRect(x + w / 2 - 3, y + h - 5, 1, 4); g.fillRect(x + w / 2 + 2, y + h - 5, 1, 4); box(g, x + 1, y + 2, w - 2, 7, '#2a2c38', 2); g.fillStyle = '#0a0c14'; g.fillRect(x + w - 5, y + 3, 4, 5); g.fillStyle = PX.cyan; g.fillRect(x + w - 4, y + 4, 2, 2); g.fillStyle = Math.sin(t * 4) > 0 ? PX.breach : '#3a1a1c'; g.fillRect(x + 2, y + 3, 2, 1); },
  archiveterminal(g, x, y, w, h, o, t) { box(g, x + 2, y + h - 6, w - 4, 6, '#3a3e4e', 2); g.fillStyle = PX.steel; g.fillRect(x + w / 2 - 2, y + h - 12, 4, 6); outline(g, x, y, w, h - 12); g.fillStyle = '#1a1c28'; g.fillRect(x, y, w, h - 12); screenFace(g, x + 1, y + 1, w - 2, h - 15, PX.cyan, t, x * 0.05); g.fillStyle = '#1b1b28'; g.fillRect(x + 2, y + h - 14, w - 4, 2); glow(g, x + w / 2, y + h + 2, w, PX.cyan, 0.14); },
  holo(g, x, y, w, h, o, t) { box(g, x, y + h - 5, w, 5, '#2a2c3c', 2); const c = accent(o.colour) || PX.arcane; const cx = x + w / 2; const gr = g.createLinearGradient(0, y, 0, y + h - 5); gr.addColorStop(0, rgba(c, 0)); gr.addColorStop(1, rgba(c, 0.35)); g.fillStyle = gr; g.fillRect(x + 2, y, w - 4, h - 5); const ry = y + 6 + ((t * 9) % (h - 14)); g.fillStyle = rgba(c, 0.8); g.fillRect(x + 3, Math.round(ry), w - 6, 1); const a = t * 1.4; for (let i = 0; i < 6; i++) { const px_ = cx + Math.round(Math.cos(a + i) * (w / 2 - 3)), py_ = y + h / 2 - 2 + Math.round(Math.sin(a + i) * 2); px(g, px_, py_, i % 2 ? lit(c, 0.5) : c); } glow(g, cx, y + h / 2, w, c, 0.2); },
  secureterminal(g, x, y, w, h, o, t) { PAINT.terminal(g, x, y, w, h, { accent: PX.gold }, t); g.fillStyle = PX.gold; g.fillRect(x + w / 2 - 2, y + 3, 4, 4); g.fillStyle = '#0a0c14'; g.fillRect(x + w / 2 - 1, y + 4, 2, 2); g.fillStyle = PX.gold; g.fillRect(x + w / 2 - 1, y + 2, 2, 1); },
  cashdisplay(g, x, y, w, h, o, t) { outline(g, x, y, w, h); g.fillStyle = '#1a1c28'; g.fillRect(x, y, w, h); g.fillStyle = '#0a0c14'; g.fillRect(x + 1, y + 1, w - 2, h - 2); const n = Math.floor((w - 6) / 4); for (let i = 0; i < n; i++) { const v = 0.3 + 0.6 * Math.abs(Math.sin(i * 1.1 + 0.3)) * (0.9 + 0.1 * Math.sin(t + i)); g.fillStyle = i === n - 1 ? PX.vital : PX.gold; g.fillRect(x + 3 + i * 4, y + h - 3 - Math.round(v * (h - 6)), 3, Math.round(v * (h - 6))); } g.fillStyle = rgba(PX.gold, 0.4); g.fillRect(x + 2, y + 3, w - 4, 1); glow(g, x + w / 2, y + h + 4, w * 0.6, PX.gold, 0.1); },
  lockedcabinet(g, x, y, w, h, o, t) { PAINT.cabinet(g, x, y, w, h, o); g.fillStyle = '#1b1b28'; g.fillRect(x + w - 6, y + 3, 4, 5); g.fillStyle = Math.sin(t * 1.5 + x) > 0.7 ? PX.vital : PX.breach; g.fillRect(x + w - 5, y + 4, 2, 1); g.fillStyle = PX.gold; g.fillRect(x + w - 5, y + 6, 2, 1); },
  orderboard(g, x, y, w, h, o, t) { box(g, x, y, w, h, '#22242f', 1); const rows = Math.floor((h - 4) / 4); for (let r = 0; r < rows; r++) { const sy = y + 3 + r * 4; const st = (r * 7 + 3) % 5; g.fillStyle = st === 0 ? PX.vital : st === 1 ? PX.flare : st === 2 ? PX.rose : '#5a5a72'; g.fillRect(x + 3, sy, 2, 2); g.fillStyle = '#8a8898'; g.fillRect(x + 7, sy, (w - 12) * (0.4 + 0.5 * Math.abs(Math.sin(r * 2.3 + x))), 1); g.fillStyle = '#5a5a72'; g.fillRect(x + 7, sy + 1, 6, 1); } const blink = Math.sin(t * 3) > 0.5; g.fillStyle = blink ? PX.rose : '#3a1a2a'; g.fillRect(x + w - 5, y + 2, 2, 2); },
  funnel(g, x, y, w, h, o, t) { outline(g, x, y, w, h); g.fillStyle = '#1a1c28'; g.fillRect(x, y, w, h); g.fillStyle = '#0a0c14'; g.fillRect(x + 1, y + 1, w - 2, h - 2); const steps = 4; for (let i = 0; i < steps; i++) { const fw = (w - 8) * (1 - i * 0.22); const on = Math.sin(t * 1.2 + i) > -0.5; g.fillStyle = rgba(PX.rose, on ? 0.9 : 0.5); g.fillRect(x + (w - fw) / 2, y + 3 + i * ((h - 6) / steps), fw, (h - 6) / steps - 1); } glow(g, x + w / 2, y + h + 4, w * 0.6, PX.rose, 0.1); },
  buildmonitor(g, x, y, w, h, o, t) { outline(g, x, y, w, h); g.fillStyle = '#1a1c28'; g.fillRect(x, y, w, h); g.fillStyle = '#0a0c14'; g.fillRect(x + 1, y + 1, w - 2, h - 2); const rows = Math.floor((h - 4) / 4); for (let r = 0; r < rows; r++) { const sy = y + 3 + r * 4; const pct = (0.2 + 0.8 * Math.abs(Math.sin(r * 1.7 + x)) + (r === rows - 1 ? (t * 0.15) % 1 : 0)) % 1; g.fillStyle = '#2a2c38'; g.fillRect(x + 3, sy, w - 6, 2); g.fillStyle = pct > 0.9 ? PX.vital : PX.cyan; g.fillRect(x + 3, sy, Math.round((w - 6) * pct), 2); } glow(g, x + w / 2, y + h + 4, w * 0.6, PX.cyan, 0.1); },
  toolwall(g, x, y, w, h) { box(g, x, y, w, h, '#4a4030', 1); g.fillStyle = dark('#4a4030', 0.3); for (let yy = y + 3; yy < y + h - 2; yy += 4) for (let xx = x + 3; xx < x + w - 2; xx += 4) px(g, xx, yy, dark('#4a4030', 0.3)); const tools = [PX.steel, '#ecebf5', PX.rust, PX.steel, '#ecebf5']; for (let i = 0; i < Math.floor((w - 6) / 7); i++) { const tx = x + 4 + i * 7; g.fillStyle = tools[i % tools.length]; g.fillRect(tx, y + 3, 2, 5 + (i % 3) * 2); g.fillRect(tx - 1, y + 3, 4, 2); } },
  healthdash(g, x, y, w, h, o, t) { outline(g, x, y, w, h); g.fillStyle = '#1a1c28'; g.fillRect(x, y, w, h); g.fillStyle = '#0a0c14'; g.fillRect(x + 1, y + 1, w - 2, h - 2); const mid = y + h / 2; for (let i = 0; i < w - 4; i++) { const ph = ((i + t * 30) % 24); const v = ph < 3 ? -6 : ph < 5 ? 5 : ph < 7 ? -3 : 0; px(g, x + 2 + i, Math.round(mid + v * (h / 16)), i > w - 12 ? lit(PX.vital, 0.4) : PX.vital); } g.fillStyle = rgba(PX.vital, 0.3); g.fillRect(x + 2, y + 2, 8, 1); g.fillRect(x + 2, y + 4, 5, 1); glow(g, x + w / 2, y + h + 4, w * 0.6, PX.vital, 0.12); },

  /* ---------- small detail ---------- */
  cable(g, x, y, w, h) { g.fillStyle = '#0e0e16'; for (let i = 0; i < w; i++) g.fillRect(x + i, y + Math.round(Math.sin(i / 6) * (h / 2 - 1)) + h / 2, 1, 2); g.fillStyle = '#3a3a4e'; for (let i = 0; i < w; i += 3) px(g, x + i, y + Math.round(Math.sin(i / 6) * (h / 2 - 1)) + h / 2, '#3a3a4e'); },
  sign(g, x, y, w, h, o) { const c = accent(o.colour) || PX.ash; outline(g, x, y, w, h); g.fillStyle = '#1a1c28'; g.fillRect(x, y, w, h); g.fillStyle = c; g.fillRect(x + 2, y + 2, 2, h - 4); g.fillStyle = '#b8b0c8'; g.fillRect(x + 6, y + 2, w - 9, 1); g.fillRect(x + 6, y + h - 3, Math.max(3, w - 14), 1); },
  hazard(g, x, y, w, h) { for (let i = 0; i < w; i++) { const s = ((i + (h - 1)) >> 2) & 1; g.fillStyle = s ? PX.flare : '#1b1b28'; for (let yy = 0; yy < h; yy++) { const ss = ((i + yy) >> 2) & 1; g.fillStyle = ss ? 'rgba(232,182,76,0.55)' : 'rgba(10,10,16,0.6)'; g.fillRect(x + i, y + yy, 1, 1); } } },
  extinguisher(g, x, y, w, h) { g.fillStyle = '#2a2c38'; g.fillRect(x - 1, y + 2, w + 2, 2); box(g, x, y + 3, w, h - 3, PX.breach, 1); g.fillStyle = '#1b1b28'; g.fillRect(x + 1, y, w - 2, 3); g.fillStyle = '#ecebf5'; g.fillRect(x + 1, y + h / 2, w - 2, 1); },
  bin(g, x, y, w, h) { box(g, x, y, w, h, '#3a3e4e', 2); g.fillStyle = '#1b1b28'; g.fillRect(x + 1, y + 1, w - 2, 1); g.fillStyle = '#5a5a72'; g.fillRect(x + 2, y + 4, 1, h - 6); },
  clock(g, x, y, w, h, o, t) { g.fillStyle = OUT; g.fillRect(x, y, w, h); g.fillStyle = '#e8e6f0'; g.fillRect(x + 1, y + 1, w - 2, h - 2); const cx = x + w / 2, cy = y + h / 2; const a = t * 0.3; g.fillStyle = '#1b1b28'; g.fillRect(cx, cy, 1, 1); px(g, Math.round(cx + Math.cos(a) * 2), Math.round(cy + Math.sin(a) * 2), '#1b1b28'); px(g, Math.round(cx - Math.sin(a * 12) * 1.5), Math.round(cy + Math.cos(a * 12) * 1.5), PX.breach); },
  partition(g, x, y, w, h) { g.fillStyle = PX.steel; g.fillRect(x, y, w, 2); g.fillRect(x, y + h - 2, w, 2); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h); g.fillStyle = 'rgba(86,201,240,0.12)'; g.fillRect(x + 1, y + 2, w - 2, h - 4); g.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 2; i < w - 2; i += 9) g.fillRect(x + i, y + 3, 1, h - 6); },
  stool(g, x, y, w, h) { g.fillStyle = PX.steel; g.fillRect(x + w / 2 - 1, y + 3, 2, h - 4); g.fillRect(x + 1, y + h - 1, w - 2, 1); box(g, x, y, w, 3, '#3a3a52', 1); },
  wallscreen(g, x, y, w, h, o, t) { PAINT.screen(g, x, y, w, h, o, t); g.fillStyle = PX.steel; g.fillRect(x + w / 2 - 1, y + h + 1, 2, 2); },

  /* ---------- THE LAB, to the reference ---------- */
  /** A storage unit with a glass door: rows of vials inside, a label screen above, a status LED. kind: cold | cryo | reagent */
  coldstore(g, x, y, w, h, o, t) {
    const kind = o.kind || 'cold';
    const tintc = kind === 'cryo' ? '#cfe9ff' : kind === 'reagent' ? '#7fe0a0' : PX.cyan;
    box(g, x, y, w, h, '#3d4656', 2);
    g.fillStyle = '#0a0c14'; g.fillRect(x + 2, y + 2, w - 4, 6); g.fillStyle = tintc; g.fillRect(x + 4, y + 4, Math.max(4, w - 12), 1); g.fillRect(x + 4, y + 6, Math.max(3, (w - 12) * 0.6), 1);
    g.fillStyle = OUT; g.fillRect(x + 2, y + 9, w - 4, h - 12);
    g.fillStyle = '#12202c'; g.fillRect(x + 3, y + 10, w - 6, h - 14);
    const rows = Math.max(2, Math.floor((h - 16) / 8));
    for (let r = 0; r < rows; r++) {
      const sy = y + 12 + r * 8;
      g.fillStyle = 'rgba(180,220,255,0.25)'; g.fillRect(x + 4, sy + 6, w - 8, 1);
      for (let sx = x + 5; sx < x + w - 6; sx += 4) {
        const on = Math.sin(t * 0.8 + sx * 0.3 + r) > -0.7;
        g.fillStyle = kind === 'cryo' ? (on ? '#e8f4ff' : '#9fc4e0') : kind === 'reagent' ? (on ? '#8ff0b0' : '#4a9a6a') : (on ? '#8fe0ff' : '#4aa0c8');
        g.fillRect(sx, sy + 1, 2, 5); g.fillStyle = '#ecebf5'; g.fillRect(sx, sy, 2, 1);
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 3, y + 10, 2, h - 14);
    const frost = y + 11 + ((t * 5) % (h - 16)); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 3, Math.round(frost), w - 6, 1);
    g.fillStyle = PX.steel; g.fillRect(x + w - 5, y + h / 2 - 5, 2, 10);
    g.fillStyle = Math.sin(t * 2) > 0 ? PX.vital : dark(PX.vital, 0.5); g.fillRect(x + 4, y + h - 3, 2, 1);
    glow(g, x + w / 2, y + h + 6, w * 1.1, tintc, 0.22);
  },
  /** A shelf unit of vials with a label plate. tint: blue | green | amber | clear */
  vialrack(g, x, y, w, h, o) {
    const tint_ = { blue: '#4f8bff', green: '#8ff0b0', amber: '#e8b64c', clear: '#bfe8ff', ghk: '#4f8bff' }[o.tint] || '#bfe8ff';
    box(g, x, y, w, h, '#2c3140', 1);
    const rows = Math.max(1, Math.floor((h - 8) / 9));
    for (let r = 0; r < rows; r++) {
      const sy = y + 3 + r * 9;
      g.fillStyle = '#1a1e2a'; g.fillRect(x + 2, sy, w - 4, 8);
      g.fillStyle = lit('#2c3140', 0.35); g.fillRect(x + 2, sy + 7, w - 4, 1);
      for (let sx = x + 4; sx < x + w - 4; sx += 4) { g.fillStyle = tint_; g.fillRect(sx, sy + 2, 2, 5); px(g, sx, sy + 3, lit(tint_, 0.6)); g.fillStyle = '#ecebf5'; g.fillRect(sx, sy + 1, 2, 1); }
    }
    g.fillStyle = '#0a0c14'; g.fillRect(x + 2, y + h - 5, w - 4, 4); g.fillStyle = tint_; g.fillRect(x + 4, y + h - 3, Math.max(4, (w - 8) * 0.5), 1);
    glow(g, x + w / 2, y + h + 4, w * 0.6, tint_, 0.14);
  },
  /** The HPLC: stacked white modules, each with a small readout, a sample tray, a pump column with cables. */
  instrument(g, x, y, w, h, o, t) {
    const tiers = 3, th = Math.floor((h - 6) / tiers);
    for (let i = 0; i < tiers; i++) {
      const ty = y + i * th;
      box(g, x, ty, w - 8, th, i === 1 ? '#c8c6d2' : '#d8d6e0', 2);
      g.fillStyle = '#0a0c14'; g.fillRect(x + 3, ty + 2, 10, th - 5);
      g.fillStyle = i === 0 ? PX.vital : PX.cyan; g.fillRect(x + 4, ty + 3, 3 + ((i * 3 + Math.floor(t)) % 5), 1); g.fillRect(x + 4, ty + 5, 6, 1);
      g.fillStyle = '#8a8898'; for (let k = 0; k < 3; k++) g.fillRect(x + 16 + k * 4, ty + 3, 2, 2);
      g.fillStyle = Math.sin(t * (2 + i)) > 0.3 ? PX.flare : '#3a3020'; g.fillRect(x + w - 12, ty + 3, 2, 1);
    }
    g.fillStyle = '#0a0c14'; g.fillRect(x + 3, y + h - 6, w - 14, 4); for (let k = 0; k < (w - 20) / 3; k++) { g.fillStyle = k % 4 === 1 ? '#8fe0ff' : '#4aa0c8'; g.fillRect(x + 4 + k * 3, y + h - 5, 2, 2); }
    g.fillStyle = PX.vital; for (let i = 0; i < 9; i++) { const v = Math.abs(Math.sin(i * 0.9 + t * 2)) * (i === 4 ? 1 : 0.3); px(g, x + 4 + i, y + 6 - Math.round(v * 3), PX.vital); }
    box(g, x + w - 7, y + 4, 7, h - 8, '#3a3e4e', 1); g.fillStyle = '#0e0e16'; g.fillRect(x + w - 5, y + 8, 1, h - 16); g.fillStyle = PX.cyan; g.fillRect(x + w - 5, y + h - 8, 2, 1);
  },
  /** Analytical balance on a small bench: a glass box with a pan, a readout. */
  balance(g, x, y, w, h, o, t) {
    PAINT.desk(g, x, y + h - 8, w, 8, { tone: 'steel' }, t);
    g.fillStyle = OUT; g.fillRect(x + 2, y, w - 4, h - 8); g.fillStyle = '#1a2230'; g.fillRect(x + 3, y + 1, w - 6, h - 10);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 3, y + 1, 2, h - 10); g.fillStyle = PX.steel; g.fillRect(x + w / 2 - 3, y + h - 12, 6, 1); g.fillRect(x + w / 2 - 1, y + h - 14, 2, 2);
    g.fillStyle = '#0a0c14'; g.fillRect(x + 4, y + h - 7, 8, 4); g.fillStyle = PX.vital; g.fillRect(x + 5, y + h - 6, 4 + (Math.floor(t * 2) % 3), 1);
  },
  /** The COA station: a terminal running the report, keyboard, printer, certificates, a clipboard with a tick. */
  coa(g, x, y, w, h, o, t) {
    PAINT.desk(g, x, y + 10, w, h - 10, { tone: 'steel', items: ['printer'] }, t);
    const mx = x + 14, mw = Math.min(22, w - 28);
    outline(g, mx, y, mw, 13); g.fillStyle = '#1a1c28'; g.fillRect(mx, y, mw, 13); g.fillStyle = '#0a1410'; g.fillRect(mx + 1, y + 1, mw - 2, 11);
    g.fillStyle = PX.vital; g.fillRect(mx + 2, y + 2, mw - 8, 1); for (let i = 0; i < 4; i++) { g.fillStyle = rgba(PX.vital, i === 3 && Math.sin(t * 3) > 0 ? 1 : 0.6); g.fillRect(mx + 2, y + 4 + i * 2, (mw - 6) * (0.4 + 0.5 * Math.abs(Math.sin(i * 1.3 + 1))), 1); }
    g.fillStyle = PX.steel; g.fillRect(mx + mw / 2 - 1, y + 13, 2, 2);
    g.fillStyle = '#1b1b28'; g.fillRect(mx + 2, y + 16, mw - 4, 3); g.fillStyle = '#5a5a72'; for (let k = 0; k < (mw - 6) / 2; k++) g.fillRect(mx + 3 + k * 2, y + 17, 1, 1);
    g.fillStyle = '#b8b6c4'; g.fillRect(x + w - 11, y + 13, 9, 7); g.fillStyle = '#e8e6f0'; g.fillRect(x + w - 12, y + 12, 9, 7); g.fillStyle = '#8a8898'; g.fillRect(x + w - 11, y + 14, 6, 1); g.fillRect(x + w - 11, y + 16, 4, 1);
    g.fillStyle = '#3a2a1a'; g.fillRect(x + 3, y + 2, 8, 10); g.fillStyle = '#e8e6f0'; g.fillRect(x + 4, y + 4, 6, 7); g.fillStyle = PX.vital; px(g, x + 5, y + 8, PX.vital); px(g, x + 6, y + 9, PX.vital); px(g, x + 7, y + 8, PX.vital); px(g, x + 8, y + 7, PX.vital);
    glow(g, mx + mw / 2, y + 16, mw, PX.vital, 0.16);
  },
  /** Packing bench: an open box with bubble wrap, sealed boxes with a fragile stripe, tape, a scanner, a label printer. */
  packbench(g, x, y, w, h, o, t) {
    PAINT.desk(g, x, y + 6, w, h - 6, { tone: 'steel' }, t);
    box(g, x + 4, y - 2, 14, 10, '#b89a78', 2); g.fillStyle = '#7a5a3a'; g.fillRect(x + 5, y - 1, 12, 1); g.fillStyle = '#e8f4ff'; g.fillRect(x + 6, y, 10, 4); for (let k = 0; k < 5; k++) px(g, x + 7 + k * 2, y + 1 + (k % 2), '#c0d8ea');
    box(g, x + 22, y + 1, 10, 7, '#a48a6a', 2); g.fillStyle = PX.rose; g.fillRect(x + 23, y + 4, 8, 1); g.fillStyle = '#7a5a3a'; g.fillRect(x + 26, y + 2, 2, 5);
    box(g, x + 34, y - 1, 8, 9, '#b89a78', 2); g.fillStyle = '#7a5a3a'; g.fillRect(x + 37, y, 2, 7);
    g.fillStyle = '#e8b64c'; g.fillRect(x + w - 26, y + 3, 5, 5); g.fillStyle = '#7a5a2a'; g.fillRect(x + w - 25, y + 4, 3, 3);
    g.fillStyle = '#1b1b28'; g.fillRect(x + w - 18, y + 2, 5, 6); g.fillStyle = Math.sin(t * 6) > 0 ? PX.breach : '#3a1a1c'; g.fillRect(x + w - 17, y + 3, 3, 1);
    box(g, x + w - 11, y + 1, 9, 7, '#d8d6e0', 2); g.fillStyle = '#ecebf5'; g.fillRect(x + w - 9, y - 1, 5, 2); g.fillStyle = PX.vital; g.fillRect(x + w - 4, y + 4, 1, 1);
  },
  /** Fraction collector: a rack of small tubes in blue light beside a control box. */
  fraction(g, x, y, w, h, o, t) {
    box(g, x, y + 4, w - 10, h - 4, '#2c3140', 1); g.fillStyle = '#12202c'; g.fillRect(x + 2, y + 6, w - 14, h - 8);
    for (let r = 0; r < 2; r++) for (let sx = x + 4; sx < x + w - 14; sx += 3) { const on = Math.sin(t * 2 + sx + r * 2) > 0; g.fillStyle = on ? '#8fe0ff' : '#4aa0c8'; g.fillRect(sx, y + 8 + r * 6, 2, 4); g.fillStyle = '#ecebf5'; g.fillRect(sx, y + 7 + r * 6, 2, 1); }
    box(g, x + w - 9, y, 9, h, '#3a3e4e', 1); for (let i = 0; i < 3; i++) { g.fillStyle = i === Math.floor(t * 2) % 3 ? PX.cyan : '#1b1b28'; g.fillRect(x + w - 7, y + 3 + i * 4, 2, 2); } g.fillStyle = PX.steel; g.fillRect(x + w - 4, y + h - 6, 2, 3);
    glow(g, x + (w - 10) / 2, y + h + 4, w * 0.6, PX.cyan, 0.14);
  },
  /** A hazardous-waste bin, lid down, green-lit. */
  wastebin(g, x, y, w, h, o, t) { box(g, x, y + 2, w, h - 2, '#2a3a2a', 2); g.fillStyle = '#1b2a1b'; g.fillRect(x - 1, y, w + 2, 3); outline(g, x - 1, y, w + 2, 3); g.fillStyle = '#7fe0a0'; g.fillRect(x + w / 2 - 2, y + h / 2 - 1, 4, 3); g.fillStyle = '#2a3a2a'; g.fillRect(x + w / 2 - 1, y + h / 2, 2, 1); glow(g, x + w / 2, y + h, w * 1.2, '#7fe0a0', 0.2 + 0.05 * Math.sin(t * 2)); },
  /** A small wall status panel: a title bar, two lines, a green dot. */
  statuspanel(g, x, y, w, h, o, t) { outline(g, x, y, w, h); g.fillStyle = '#1a1c28'; g.fillRect(x, y, w, h); g.fillStyle = '#0a0c14'; g.fillRect(x + 1, y + 1, w - 2, h - 2); const c = accent(o.colour) || PX.cyan; g.fillStyle = c; g.fillRect(x + 3, y + 3, w - 6, 1); g.fillStyle = rgba(c, 0.6); g.fillRect(x + 3, y + 6, (w - 6) * 0.7, 1); g.fillRect(x + 3, y + 8, (w - 6) * 0.45, 1); g.fillStyle = Math.sin(t * 2) > -0.3 ? PX.vital : dark(PX.vital, 0.6); g.fillRect(x + w - 6, y + h - 5, 2, 2); glow(g, x + w / 2, y + h + 3, w * 0.6, c, 0.08); },
  /** A floor cable tray: a dark channel with three cables and clamps. */
  cabletray(g, x, y, w, h) { g.fillStyle = '#0e0e16'; g.fillRect(x, y, w, h); g.fillStyle = '#2a2a3a'; g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1); g.fillStyle = '#3a3a4e'; g.fillRect(x + 1, y + 2, w - 2, 1); g.fillStyle = '#4a3a2a'; g.fillRect(x + 1, y + h / 2, w - 2, 1); g.fillStyle = '#2a3a4a'; g.fillRect(x + 1, y + h - 3, w - 2, 1); g.fillStyle = PX.steel; for (let i = x + 6; i < x + w - 4; i += 14) g.fillRect(i, y + 1, 2, h - 2); },
  /** A floor grate. */
  grate(g, x, y, w, h) { g.fillStyle = '#0a0a12'; g.fillRect(x, y, w, h); g.fillStyle = '#2a2a3a'; for (let yy = y + 1; yy < y + h; yy += 3) g.fillRect(x + 1, yy, w - 2, 1); g.fillStyle = '#3a3a4e'; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h); },

  /* ---------- BEACON, to the reference ---------- */
  /** A multi-panel screen wall. panels: 'queue' | 'wave' | 'map' | 'post' | 'log' | 'radar' | 'spectrum'. */
  screenwall(g, x, y, w, h, o, t) {
    const panels = o.panels || ['queue', 'wave', 'map'];
    const c = accent(o.colour) || PX.cyan;
    const pw = Math.floor((w - (panels.length - 1) * 2) / panels.length);
    panels.forEach((kind, i) => {
      const px_ = x + i * (pw + 2);
      outline(g, px_, y, pw, h); g.fillStyle = '#1a1c28'; g.fillRect(px_, y, pw, h); g.fillStyle = '#080a12'; g.fillRect(px_ + 1, y + 1, pw - 2, h - 2);
      g.fillStyle = rgba(c, 0.9); g.fillRect(px_ + 3, y + 3, Math.max(6, pw * 0.4), 1); g.fillStyle = rgba(c, 0.25); g.fillRect(px_ + 2, y + 5, pw - 4, 1);
      const ix = px_ + 3, iy = y + 7, iw = pw - 6, ih = h - 10;
      if (kind === 'queue' || kind === 'post') {
        const rows = Math.floor(ih / 4); const cols = [PX.cyan, PX.flare, PX.arcane, PX.vital, PX.rose];
        for (let r = 0; r < rows; r++) { const sy = iy + r * 4; g.fillStyle = cols[(r + i) % cols.length]; g.fillRect(ix, sy, 2, 2); g.fillStyle = r === Math.floor(t) % rows ? '#ecebf5' : '#8a8898'; g.fillRect(ix + 4, sy, (iw - 10) * (0.5 + 0.5 * Math.abs(Math.sin(r * 2.1 + i))), 1); g.fillStyle = '#4a4a62'; g.fillRect(ix + 4, sy + 2, 5, 1); g.fillStyle = kind === 'post' ? PX.flare : '#5a5a72'; g.fillRect(ix + iw - 4, sy, 3, 1); }
      } else if (kind === 'wave') {
        const mid = iy + ih / 2; for (let k = 0; k < iw; k++) { const v = Math.sin(k * 0.7 + t * 6) * Math.sin(k * 0.13 + t) * (ih / 2 - 1); g.fillStyle = k > iw - 6 ? '#ecebf5' : c; g.fillRect(ix + k, Math.round(mid + v), 1, 1); }
        g.fillStyle = rgba(c, 0.35); g.fillRect(ix, Math.round(mid), iw, 1);
        for (let k = 0; k < 3; k++) { g.fillStyle = '#5a5a72'; g.fillRect(ix, iy + ih - 3 + k, 6 + k * 3, 1); }
      } else if (kind === 'map') {
        let k = i * 17 + 5; const pts = [];
        for (let n = 0; n < 9; n++) { k = (k * 1103515245 + 12345) >>> 0; const nx = ix + 2 + (k % (iw - 4)); k = (k * 1103515245 + 12345) >>> 0; const ny = iy + 1 + (k % (ih - 2)); pts.push([nx, ny]); }
        g.fillStyle = rgba(c, 0.4); for (let n = 1; n < pts.length; n++) { const [ax, ay] = pts[n - 1], [bx, by] = pts[n]; const len = Math.max(Math.abs(bx - ax), Math.abs(by - ay)); for (let s2 = 0; s2 <= len; s2 += 2) g.fillRect(Math.round(ax + (bx - ax) * s2 / len), Math.round(ay + (by - ay) * s2 / len), 1, 1); }
        pts.forEach(([nx, ny], n) => { const hot = Math.floor(t * 2) % pts.length === n; g.fillStyle = hot ? '#ecebf5' : c; g.fillRect(nx - (hot ? 1 : 0), ny - (hot ? 1 : 0), hot ? 3 : 2, hot ? 3 : 2); });
      } else if (kind === 'log') {
        const rows = Math.floor(ih / 3); for (let r = 0; r < rows; r++) { g.fillStyle = r === rows - 1 && Math.sin(t * 4) > 0 ? c : '#5a5a72'; g.fillRect(ix, iy + r * 3, 7, 1); g.fillStyle = '#8a8898'; g.fillRect(ix + 9, iy + r * 3, (iw - 12) * (0.3 + 0.6 * Math.abs(Math.sin(r * 1.9 + i * 2))), 1); }
      } else if (kind === 'radar') {
        const cx = ix + iw / 2, cy = iy + ih / 2, r0 = Math.min(iw, ih) / 2 - 1;
        for (let a = 0; a < 64; a++) px(g, Math.round(cx + Math.cos(a / 64 * Math.PI * 2) * r0), Math.round(cy + Math.sin(a / 64 * Math.PI * 2) * r0), rgba(c, 0.35));
        g.fillStyle = rgba(c, 0.35); g.fillRect(cx, cy - r0, 1, r0 * 2); g.fillRect(cx - r0, cy, r0 * 2, 1);
        const a = t * 1.5; for (let k = 0; k < r0; k++) px(g, Math.round(cx + Math.cos(a) * k), Math.round(cy + Math.sin(a) * k), c);
        px(g, Math.round(cx + Math.cos(a - 0.9) * r0 * 0.6), Math.round(cy + Math.sin(a - 0.9) * r0 * 0.6), '#ecebf5');
      } else if (kind === 'spectrum') {
        const n = Math.floor(iw / 2); for (let k = 0; k < n; k++) { const v = Math.abs(Math.sin(k * 0.5 + t * 3)) * Math.abs(Math.cos(k * 0.1 + t)); g.fillStyle = v > 0.7 ? PX.flare : c; g.fillRect(ix + k * 2, iy + ih - Math.round(v * ih), 1, Math.round(v * ih)); }
      }
    });
    glow(g, x + w / 2, y + h + 8, w * 0.7, c, 0.16);
  },
  /** The signal desk: a wide console with three monitors, two keyboards, a lamp, a phone, notes and a mug. */
  signaldesk(g, x, y, w, h, o, t) {
    PAINT.desk(g, x, y + 8, w, h - 8, { tone: 'steel' }, t);
    g.fillStyle = dark(PX.steel, 0.3); g.fillRect(x + w / 2 - 12, y + h - 3, 24, 1);
    const c = o.accent && o.accent.startsWith('#') ? o.accent : PX.flare;
    PAINT.terminal(g, x + 6, y - 2, 16, 13, { accent: PX.cyan }, t);
    PAINT.terminal(g, x + w / 2 - 9, y - 4, 18, 14, { accent: c }, t + 2);
    PAINT.terminal(g, x + w - 22, y - 2, 16, 13, { accent: PX.arcane }, t + 4);
    for (const kx of [x + 8, x + w / 2 - 7]) { g.fillStyle = '#1b1b28'; g.fillRect(kx, y + 12, 14, 3); g.fillStyle = '#5a5a72'; for (let k = 0; k < 6; k++) g.fillRect(kx + 1 + k * 2, y + 13, 1, 1); }
    g.fillStyle = PX.steel; g.fillRect(x + w - 6, y + 2, 1, 10); g.fillStyle = '#3a3020'; g.fillRect(x + w - 9, y, 6, 3); g.fillStyle = PX.flare; g.fillRect(x + w - 8, y + 3, 4, 1); glow(g, x + w - 6, y + 10, 14, PX.flare, 0.3);
    g.fillStyle = '#1b1b28'; g.fillRect(x + w - 34, y + 12, 6, 4); g.fillStyle = '#5a5a72'; g.fillRect(x + w - 33, y + 13, 4, 1);
    g.fillStyle = PX.flare; g.fillRect(x + 26, y + 10, 3, 3); g.fillStyle = '#f2d27a'; g.fillRect(x + 30, y + 11, 3, 3);
    g.fillStyle = '#ecebf5'; g.fillRect(x + w - 26, y + 11, 3, 3); px(g, x + w - 23, y + 12, '#ecebf5');
    g.fillStyle = '#0e0e16'; g.fillRect(x + 12, y + h - 2, 1, 4); g.fillRect(x + w / 2, y + h - 2, 1, 4); g.fillRect(x + w - 14, y + h - 2, 1, 4);
  },
  /** An equipment rack with dials, meters and amber LEDs. */
  rack(g, x, y, w, h, o, t) {
    box(g, x, y, w, h, '#23252f', 1); const c = accent(o.colour) || PX.flare;
    const rows = Math.floor((h - 4) / 6);
    for (let r = 0; r < rows; r++) {
      const sy = y + 3 + r * 6; g.fillStyle = '#31343f'; g.fillRect(x + 2, sy, w - 4, 5); g.fillStyle = dark('#31343f', 0.4); g.fillRect(x + 2, sy + 4, w - 4, 1);
      if (r % 2 === 0) { g.fillStyle = '#1b1b28'; g.fillRect(x + 3, sy + 1, 4, 3); g.fillStyle = c; g.fillRect(x + 4 + (Math.floor(t + r) % 2), sy + 2, 1, 1); }
      else { g.fillStyle = '#0a0c14'; g.fillRect(x + 3, sy + 1, w - 10, 3); g.fillStyle = rgba(c, 0.8); g.fillRect(x + 4, sy + 2, ((w - 12) * (0.4 + 0.5 * Math.abs(Math.sin(t * 1.3 + r)))) | 0, 1); }
      for (let i = 0; i < 2; i++) { const on = Math.sin(t * (2 + i) + r) > 0.2; g.fillStyle = on ? c : '#1b1b28'; g.fillRect(x + w - 5 - i * 2, sy + 2, 1, 1); }
    }
    glow(g, x + w / 2, y + h + 4, w * 0.6, c, 0.1);
  },
  /** A hazard floor mat. */
  floormat(g, x, y, w, h) { g.fillStyle = '#1b1b28'; g.fillRect(x, y, w, h); PAINT.hazard(g, x + 1, y + 1, w - 2, 2, {}, 0); PAINT.hazard(g, x + 1, y + h - 3, w - 2, 2, {}, 0); g.fillStyle = '#23232f'; g.fillRect(x + 2, y + 4, w - 4, h - 8); },
};

/** Props painted with the room, behind the crew. */
export const WALL_MOUNTED = new Set(['screen', 'wallscreen', 'bigscreen', 'board', 'window', 'cardwall', 'productshelf', 'corkboard', 'switchwall', 'maprack', 'shelf', 'vent', 'pipe', 'rug', 'coldstore', 'vialrack', 'servers', 'safe', 'lift', 'mast', 'radio', 'ladder', 'cabinet', 'lockedcabinet', 'locker', 'lever', 'cashdisplay', 'orderboard', 'funnel', 'buildmonitor', 'toolwall', 'healthdash', 'cable', 'sign', 'hazard', 'extinguisher', 'clock', 'archiveterminal', 'partition', 'statuspanel', 'cabletray', 'grate', 'screenwall', 'rack', 'floormat']);

/**
 * Painters that move. Everything else is baked once at startup: wall-mounted
 * pieces straight into the static buffer, floor pieces into their own small
 * canvases so they can still be depth-sorted with the crew.
 */
export const ANIMATED = new Set(['screen', 'wallscreen', 'bigscreen', 'terminal', 'cardwall', 'coldstore', 'instrument', 'servers', 'radio', 'mast', 'lift', 'lever', 'safe', 'window', 'commandtable', 'till', 'candle', 'council', 'workbench', 'camera', 'coa', 'archiveterminal', 'holo', 'secureterminal', 'cashdisplay', 'lockedcabinet', 'orderboard', 'funnel', 'buildmonitor', 'healthdash', 'clock', 'balance', 'fraction', 'wastebin', 'statuspanel', 'screenwall', 'signaldesk', 'rack']);
const LIVE_ITEMS = new Set(['terminal', 'dual', 'candle', 'printer', 'secure']);
/** True when a placement must be painted every frame. */
export const isAnimated = (p) => ANIMATED.has(p.type) || (p.opts.items || []).some((i) => LIVE_ITEMS.has(i));
