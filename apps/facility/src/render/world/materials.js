/**
 * The facility's materials — what every surface is made of.
 *
 * Richness comes from contrast between materials, not from glow: rough
 * concrete beside brushed steel, oiled wood beside smoked glass, a lit
 * display beside a dark wall. Every texture is drawn once on a canvas at
 * startup (nothing is downloaded), and every surface is UV-mapped in world
 * units, so a texture runs continuously across a wall instead of
 * stretching to each box.
 *
 * Emissive things — screens, lamps, LEDs — are unlit materials. They do not
 * light anything themselves; the room's practical light does that. What
 * they give is the bright point bloom picks up and the eye reads as "on".
 */
import * as THREE from 'three';

import { TONE, ACCENT, accentOf } from '../tone.js';
export { TONE, ACCENT, accentOf };

/** A seeded PRNG so the grime is the same on every load. */
export function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

/** Soft value noise as a base for every rough surface. */
function noise(g, w, h, r, { base = 128, amp = 40, blobs = 900, size = [2, 18] } = {}) {
  g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, w, h);
  for (let i = 0; i < blobs; i++) {
    const x = r() * w, y = r() * h, s = size[0] + r() * (size[1] - size[0]), v = Math.round(base + (r() - 0.5) * amp * 2);
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  // Fine grain on top so close-ups never look smooth.
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amp * 0.5; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}

/* ---------- surfaces ---------- */

/** Floor tiles: large dark slabs with bevelled seams, worn centres and damp patches (the roughness map). */
function tiles() {
  const r = rng('tiles'), S = 512, N = 4, T = S / N;
  const [c, g] = canvas(S); const [rc, rg] = canvas(S);
  noise(g, S, S, r, { base: 46, amp: 10, blobs: 500, size: [6, 40] });
  noise(rg, S, S, r, { base: 150, amp: 60, blobs: 260, size: [10, 70] });
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const v = (r() - 0.5) * 14;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255 * 2})`; g.fillRect(i * T, j * T, T, T);
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(i * T, j * T, T, 2); g.fillRect(i * T, j * T, 2, T);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(i * T + 2, j * T + 2, T - 4, 1); g.fillRect(i * T + 2, j * T + 2, 1, T - 4);
    rg.fillStyle = 'rgba(255,255,255,0.8)'; rg.fillRect(i * T, j * T, T, 3); rg.fillRect(i * T, j * T, 3, T);
  }
  return [c, rc];
}
/** Wall panels: poured concrete with vertical form-lines, staining from the top, a scuffed base. */
function concrete() {
  const r = rng('concrete'), S = 512;
  const [c, g] = canvas(S);
  noise(g, S, S, r, { base: 60, amp: 14, blobs: 900, size: [3, 30] });
  for (let i = 0; i < 40; i++) {
    const x = r() * S, w = 2 + r() * 10, len = 40 + r() * 220;
    const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, len);
  }
  for (let x = 0; x < S; x += 128) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, 0, 2, S); g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(x + 2, 0, 1, S); }
  for (let y = 0; y < S; y += 256) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, S, 2); }
  // Form-tie holes, the detail that makes concrete read as concrete.
  for (let x = 32; x < S; x += 64) for (let y = 48; y < S; y += 128) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }
  return c;
}
/** Brushed metal: long horizontal grain. */
function brushed() {
  const r = rng('brushed'), S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) { const y = r() * S, v = Math.round(110 + r() * 50); g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(r() * S - 60, y, 40 + r() * 200, 1); }
  return c;
}
/** Grating: a steel mesh with a darker void under it. */
function grating() {
  const r = rng('grate'), S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#141619'; g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 8) { g.fillStyle = '#3a3e44'; g.fillRect(x, 0, 2, S); }
  for (let y = 0; y < S; y += 32) { g.fillStyle = '#4a4f57'; g.fillRect(0, y, S, 3); }
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 60; i++) { const x = r() * S, y = r() * S, s = 10 + r() * 40; const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, 'rgba(60,50,40,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2); }
  g.globalCompositeOperation = 'source-over';
  return c;
}
/** Polished stone for the atrium: large slabs, a faint vein, low roughness so the core reflects in it. */
function stone() {
  const r = rng('stone'), S = 512;
  const [c, g] = canvas(S);
  noise(g, S, S, r, { base: 34, amp: 8, blobs: 400, size: [10, 60] });
  g.strokeStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 14; i++) { g.lineWidth = 0.5 + r() * 1.5; g.beginPath(); let x = r() * S, y = r() * S; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 120; y += (r() - 0.3) * 80; g.lineTo(x, y); } g.stroke(); }
  for (let x = 0; x < S; x += 256) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x, 0, 2, S); g.fillRect(0, x, S, 2); }
  return c;
}
/** Timber floor: long boards, staggered joints, grain running with them. */
function planks() {
  const r = rng('planks'), S = 512, N = 8, B = S / N;
  const [c, g] = canvas(S);
  for (let i = 0; i < N; i++) {
    const v = 110 + (r() - 0.5) * 40;
    g.fillStyle = `rgb(${v},${v * 0.8},${v * 0.62})`; g.fillRect(0, i * B, S, B);
    for (let k = 0; k < 40; k++) { const y = i * B + r() * B, a = r() * 0.12; g.fillStyle = `rgba(30,18,10,${a})`; g.fillRect(0, y, S, 1); }
    const off = r() * S; g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(off, i * B, 2, B); g.fillRect((off + S / 2) % S, i * B, 2, B);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, i * B, S, 1.5);
  }
  return c;
}
/** Carpet: dense, matte, a faint woven texture and wear down the middle. */
function carpet() {
  const r = rng('carpet'), S = 256;
  const [c, g] = canvas(S);
  noise(g, S, S, r, { base: 120, amp: 18, blobs: 300, size: [8, 50] });
  for (let y = 0; y < S; y += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`; g.fillRect(0, y, S, 1); }
  return c;
}
/** Wood: oiled, dark, with grain. */
function wood() {
  const r = rng('wood'), S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#806048'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) { const y = r() * S, v = r(); g.fillStyle = `rgba(${v > 0.5 ? 40 : 160},${v > 0.5 ? 26 : 120},${v > 0.5 ? 16 : 90},0.18)`; g.fillRect(0, y, S, 1 + r() * 2); }
  return c;
}

/* ---------- displays ---------- */

/**
 * Display content: white on black, tinted by the material colour, so one
 * canvas serves every screen of its kind in every colour. Each tiles
 * vertically, and the scroll is a texture offset — moving data costs a
 * uniform, not a redraw.
 */
function display(kind) {
  const r = rng(`display-${kind}`), W = 256, H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
  const ink = (a) => `rgba(255,255,255,${a})`;
  if (kind === 'data') {
    for (let y = 6; y < H; y += 9) { let x = 6; while (x < W - 10) { const w = 4 + r() * 34; g.fillStyle = ink(r() < 0.12 ? 0.95 : 0.25 + r() * 0.4); g.fillRect(x, y, w, 3); x += w + 4 + r() * 8; } }
    g.fillStyle = ink(0.5); g.fillRect(0, 0, 3, H);
  } else if (kind === 'chart') {
    g.strokeStyle = ink(0.1); g.lineWidth = 1;
    for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let k = 0; k < 2; k++) {
      g.strokeStyle = ink(k ? 0.45 : 0.95); g.lineWidth = k ? 1 : 2; g.beginPath();
      let v = H * (0.5 + k * 0.15);
      for (let x = 0; x <= W; x += 4) { v += (r() - 0.5) * 18; v = Math.max(20, Math.min(H - 20, v)); x ? g.lineTo(x, v) : g.moveTo(x, v); }
      g.stroke();
    }
    for (let x = 4; x < W; x += 10) { const h = 4 + r() * 30; g.fillStyle = ink(0.3); g.fillRect(x, H - h, 6, h); }
  } else if (kind === 'map') {
    g.strokeStyle = ink(0.12);
    for (let x = 0; x < W; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const pts = Array.from({ length: 22 }, () => [r() * W, r() * H]);
    g.strokeStyle = ink(0.4);
    for (let i = 0; i < pts.length; i++) { const j = Math.floor(r() * pts.length); g.beginPath(); g.moveTo(...pts[i]); g.lineTo(...pts[j]); g.stroke(); }
    for (const [x, y] of pts) { g.fillStyle = ink(0.95); g.fillRect(x - 2, y - 2, 4, 4); g.strokeStyle = ink(0.3); g.strokeRect(x - 6, y - 6, 12, 12); }
  } else if (kind === 'wave') {
    for (let k = 0; k < 5; k++) {
      g.strokeStyle = ink(0.2 + k * 0.15); g.lineWidth = 1.2; g.beginPath();
      const y0 = 26 + k * 50, f = 0.03 + r() * 0.06, a = 6 + r() * 16;
      for (let x = 0; x <= W; x += 2) { const y = y0 + Math.sin(x * f) * a * (0.5 + 0.5 * Math.sin(x * 0.011 + k)); x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  } else if (kind === 'city') {
    // A window onto a far city at night: blocks of lit windows under a dark sky.
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0b1018'); sky.addColorStop(1, '#2a3446');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W;) { const w = 14 + r() * 30, h = 40 + r() * 150; g.fillStyle = '#06080c'; g.fillRect(x, H - h, w, h); for (let wy = H - h + 4; wy < H - 4; wy += 6) for (let wx = x + 3; wx < x + w - 3; wx += 5) if (r() < 0.22) { g.fillStyle = r() < 0.7 ? 'rgba(255,214,160,0.85)' : 'rgba(170,210,255,0.8)'; g.fillRect(wx, wy, 2, 3); } x += w + 2; }
  } else {
    // 'panel': a status grid of small cells.
    for (let y = 4; y < H; y += 12) for (let x = 4; x < W; x += 12) { g.fillStyle = ink(r() < 0.1 ? 0.95 : r() * 0.25); g.fillRect(x, y, 8, 8); }
  }
  // Scanless: a soft vignette instead of CRT lines, so the display reads as glass, not as a retro tube.
  const v = g.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  return c;
}

/** A vertical falloff for beams: bright at the source, gone at the far end. */
function beam(up) {
  const [c, g] = canvas(4, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(up ? 1 : 0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.25)'); gr.addColorStop(up ? 0 : 1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  return c;
}

/** A soft round falloff — light pools on floors and the halo under a figure. */
function radial() {
  const [c, g] = canvas(128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return c;
}

export const DISPLAYS = ['data', 'chart', 'map', 'wave', 'panel', 'city'];

/**
 * Build the material library. Returns `mat(key)`, which creates a key's
 * material on first use and shares it afterwards, so merged geometry
 * buckets by material identity.
 */
export function createMaterials(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (c, { srgb = true, rep = 1 } = {}) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(rep, rep); return t; };
  const [tileC, tileR] = tiles();
  const T = {
    tile: tex(tileC), tileRough: tex(tileR, { srgb: false }),
    concrete: tex(concrete()), brushed: tex(brushed()), grate: tex(grating()), stone: tex(stone()), wood: tex(wood()),
    planks: tex(planks()), carpet: tex(carpet()),
    radial: tex(radial()), beamUp: tex(beam(true)), beamDown: tex(beam(false)),
  };
  for (const k of ['beamUp', 'beamDown']) T[k].wrapS = T[k].wrapT = THREE.ClampToEdgeWrapping;
  T.radial.wrapS = T.radial.wrapT = THREE.ClampToEdgeWrapping;
  const displays = Object.fromEntries(DISPLAYS.map((k) => [k, tex(display(k))]));
  // Three scroll phases per display kind, so neighbouring screens do not move in lock-step.
  const scrolls = [];
  const displayTex = (kind, phase) => {
    const key = `${kind}:${phase}`;
    let t = scrolls.find((s) => s.key === key)?.t;
    if (!t) { t = displays[kind].clone(); t.needsUpdate = true; t.offset.set(phase * 0.33, phase * 0.21); scrolls.push({ key, t, kind, speed: kind === 'data' ? 0.018 + phase * 0.006 : kind === 'wave' ? 0.03 : kind === 'chart' ? 0.006 : 0 }); }
    return t;
  };

  const lib = new Map();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const make = (key) => {
    const [k, a, b] = key.split(':');
    switch (k) {
      case 'floor': return std({ map: T.tile, roughnessMap: T.tileRough, color: '#737a86', roughness: 0.82, metalness: 0.06 });
      case 'timber': return std({ map: T.planks, color: '#6d5544', roughness: 0.55, metalness: 0.02 });
      case 'carpet': return std({ map: T.carpet, color: '#3b4250', roughness: 1, metalness: 0 });
      case 'atrium': return std({ map: T.stone, color: '#a8adb8', roughness: 0.22, metalness: 0.1 });
      case 'grate': return std({ map: T.grate, color: '#b9bec7', roughness: 0.55, metalness: 0.55 });
      case 'ground': return std({ map: T.concrete, color: '#3d4048', roughness: 0.95, metalness: 0 });
      case 'plinth': return std({ map: T.brushed, color: '#2a2e35', roughness: 0.5, metalness: 0.6 });
      case 'wall': return std({ map: T.concrete, color: '#6d7179', roughness: 0.94, metalness: 0 });
      case 'trim': return std({ map: T.brushed, color: '#9ba3ad', roughness: 0.35, metalness: 0.85 });
      case 'steel': return std({ map: T.brushed, color: '#6f7782', roughness: 0.42, metalness: 0.8 });
      case 'black': return std({ map: T.brushed, color: '#26292e', roughness: 0.5, metalness: 0.6 });
      case 'copper': return std({ map: T.brushed, color: '#8a5a3c', roughness: 0.45, metalness: 0.75 });
      case 'wood': return std({ map: T.wood, color: '#a07a5c', roughness: 0.62, metalness: 0 });
      case 'ceramic': return std({ color: '#b5bac2', roughness: 0.55, metalness: 0.05 });
      // Vertex-coloured: rugs, upholstery, crates, painted metal. One material, many colours, one draw.
      case 'paint': return std({ vertexColors: true, roughness: 0.88, metalness: 0 });
      case 'gloss': return std({ vertexColors: true, roughness: 0.38, metalness: 0.35 });
      case 'leaf': return std({ vertexColors: true, roughness: 0.75, metalness: 0, flatShading: true });
      case 'glass': return std({ color: '#0d1620', roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.55 });
      // Unlit: lamps, LEDs, strips. `glow` holds the constant ones; `led0..2` blink out of phase.
      case 'glow': return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
      case 'led0': case 'led1': case 'led2': return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true });
      // Additive light: pools on floors and walls, beams from projectors and skylights.
      case 'pool': return new THREE.MeshBasicMaterial({ map: T.radial, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      case 'beam': return new THREE.MeshBasicMaterial({ map: a === 'down' ? T.beamDown : T.beamUp, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      // `screen:<kind>:<hex>[:phase]` — a display, tinted.
      case 'screen': return new THREE.MeshBasicMaterial({ map: displayTex(a, Number(key.split(':')[3] || 0)), color: new THREE.Color(b).multiplyScalar(1.1), toneMapped: false });
      default: return std({ color: '#5a6070', roughness: 0.7 });
    }
  };
  const mat = (key) => { let m = lib.get(key); if (!m) { m = make(key); lib.set(key, m); } return m; };

  /** Per frame: scroll the displays, blink the LEDs. */
  const tick = (t) => {
    for (const s of scrolls) if (s.speed) s.t.offset.y = (s.t.offset.y + s.speed / 30) % 1;
    for (let i = 0; i < 3; i++) { const m = lib.get(`led${i}`); if (m) m.opacity = 0.35 + 0.65 * (Math.sin(t * (1.3 + i * 0.7) + i * 2.1) > -0.2 ? 1 : 0.15); }
  };
  return { mat, tick, T };
}
