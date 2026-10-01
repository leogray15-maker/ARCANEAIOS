/**
 * The Brain Graph — the Obsidian vault, drawn as a place.
 *
 * Every note in the vault is a node, every wikilink or Notion-style link
 * an edge, grouped and coloured by folder, positions precomputed by
 * tools/vault-graph.mjs. The layout is the vault's; the depth is ours: each
 * folder is a layer at its own distance, so the vault reads as strata you
 * can look across, and the whole field turns slowly in perspective over a
 * ground plane so it is never a flat picture.
 *
 * On top of that, the OS: the twenty rooms sit on the brain folders they
 * own, every agent orbits the room it is in right now, and a room whose
 * agent is working sends a pulse down its tethers into its folder. Click a
 * note to open it in Obsidian; click a room or an agent to open the room.
 * Drag to pan, wheel to zoom, type to find.
 */
import { AGENTS, ROOM_BY_ID } from '@arcane/config';
import { ACCENT as TONE_ACCENT } from './tone.js';

const TAU = Math.PI * 2;
const D = 2600;          // camera distance for the perspective
const LAYER = 150;       // depth between folder layers

export class BrainGraph {
  constructor(canvas, legend, ctx, onRoom) {
    this.canvas = canvas; this.legend = legend; this.ctx = ctx; this.onRoom = onRoom;
    this.data = null; this.visible = false;
    this.view = { x: 0, y: 0, k: 0.4 };
    this.hover = null; this.query = ''; this.hidden = new Set();
    this.sat = new Map();
    this.yaw = 0; this.pitch = 0.32;
    fetch('/graph.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => { this.data = d; if (d) this.prepare(); }).catch(() => {});
    this.bind();
  }

  prepare() {
    const d = this.data;
    d.adj = d.nodes.map(() => []);
    for (const [a, b] of d.edges) { d.adj[a].push(b); d.adj[b].push(a); }
    d.colour = Object.fromEntries(d.groups.map((g) => [g.id, g.colour]));
    // Each folder its own stratum, the largest in the middle.
    const order = [...d.groups].sort((a, b) => b.n - a.n);
    const z = {}; order.forEach((g, i) => { z[g.id] = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * LAYER; });
    for (const n of d.nodes) n.z = z[n.g] ?? 0;
    const N = d.nodes.length;
    this.px = new Float32Array(N); this.py = new Float32Array(N); this.pf = new Float32Array(N);
    this.legend.innerHTML = `<input type="search" id="graph-q" placeholder="Find a note…" style="width:100%;margin-bottom:10px">` +
      d.groups.map((g) => `<label class="chk" style="display:block"><input type="checkbox" data-group="${g.id}" checked> <span class="dot" style="background:${g.colour};color:${g.colour}"></span>${g.name} <span class="faint">${g.n}</span></label>`).join('') +
      `<div style="margin-top:8px"><span class="dot" style="background:#e4e9ef;color:#e4e9ef"></span>room · <span class="dot" style="background:#b3a9f6;color:#b3a9f6"></span>agent, orbiting its room</div>
       <div class="faint" style="margin-top:8px;font-family:var(--mono);font-size:10px;letter-spacing:.06em">${d.nodes.length} NOTES · ${d.edges.length} LINKS · VAULT "${d.vault}"<br>click a note → Obsidian · room or agent → its room · drag · wheel</div>`;
    this.legend.querySelector('#graph-q').addEventListener('input', (e) => { this.query = e.target.value.trim().toLowerCase(); });
    for (const cb of this.legend.querySelectorAll('[data-group]')) cb.addEventListener('change', () => { cb.checked ? this.hidden.delete(cb.dataset.group) : this.hidden.add(cb.dataset.group); });
  }

  bind() {
    const cv = this.canvas; let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, moved: false }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      this.lean = { x: e.offsetX / Math.max(1, cv.clientWidth) - 0.5, y: e.offsetY / Math.max(1, cv.clientHeight) - 0.5 };
      if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; this.view.x = drag.vx + dx; this.view.y = drag.vy + dy; return; }
      this.hover = this.hit(e.offsetX, e.offsetY);
      cv.style.cursor = this.hover ? 'pointer' : 'grab';
    });
    cv.addEventListener('pointerup', (e) => {
      const moved = drag?.moved; drag = null; if (moved) return;
      const h = this.hit(e.offsetX, e.offsetY); if (!h) return;
      if (h.kind === 'room') this.onRoom(h.room.id);
      else if (h.kind === 'agent') this.onRoom(this.ctx.sim.byId[h.agent.id].room);
      else window.open(`obsidian://open?vault=${encodeURIComponent(this.data.vault)}&file=${encodeURIComponent(h.node.id)}`, '_self');
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const nk = Math.max(0.12, Math.min(4, this.view.k * f));
      const r = f !== 1 ? nk / this.view.k : 1;
      this.view.x = e.offsetX - (e.offsetX - this.view.x) * r; this.view.y = e.offsetY - (e.offsetY - this.view.y) * r; this.view.k = nk;
    }, { passive: false });
    cv.addEventListener('pointerleave', () => { this.hover = null; this.lean = null; });
  }

  show() { this.visible = true; this.resize(); if (!this.fitted && this.data) this.fit(); }
  hide() { this.visible = false; }
  resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight; if (!W) return;
    this.canvas.width = W * dpr; this.canvas.height = H * dpr;
  }
  fit() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.view.k = Math.min(W, H) / 2100; this.view.x = W / 2; this.view.y = H / 2; this.fitted = true;
  }

  /** World (x, y, z) to screen; returns [sx, sy, scale]. */
  project(x, y, z) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const f = D / (D + z2);
    return [this.view.x + x1 * f * this.view.k, this.view.y + y2 * f * this.view.k, f];
  }

  hit(x, y) {
    if (!this.data || !this.roomsP) return null;
    let best = null, bd = 10;
    for (const r of this.roomsP) { const d = Math.hypot(r.sx - x, r.sy - y); if (d < bd + 6) { bd = d; best = { kind: 'room', room: ROOM_BY_ID[r.id], sx: r.sx, sy: r.sy }; } }
    for (const [id, s] of this.sat) { const d = Math.hypot(s.sx - x, s.sy - y); if (d < bd + 4) { bd = d; best = { kind: 'agent', agent: AGENTS.find((a) => a.id === id), sx: s.sx, sy: s.sy }; } }
    if (best) return best;
    for (let i = 0; i < this.data.nodes.length; i++) {
      const n = this.data.nodes[i]; if (this.hidden.has(n.g)) continue;
      const d = Math.hypot(this.px[i] - x, this.py[i] - y);
      if (d < bd) { bd = d; best = { kind: 'note', node: n, i, sx: this.px[i], sy: this.py[i] }; }
    }
    return best;
  }

  /** Agents orbit the room they are in; a walker eases across. */
  layoutAgents(t) {
    const rooms = Object.fromEntries(this.data.rooms.map((r) => [r.id, r]));
    const per = {};
    for (const a of this.ctx.sim.agents) (per[a.room] ||= []).push(a);
    for (const [roomId, list] of Object.entries(per)) {
      const rn = rooms[roomId]; if (!rn) continue;
      list.forEach((a, i) => {
        const ang = (i / list.length) * TAU + t * 0.3 + roomId.length;
        const rad = 26 / this.view.k * 0.6 + 14;
        const target = { x: rn.x + Math.cos(ang) * rad, y: rn.y + Math.sin(ang) * rad * 0.5, z: Math.sin(ang) * rad };
        const s = this.sat.get(a.id) || { ...target };
        s.x += (target.x - s.x) * 0.05; s.y += (target.y - s.y) * 0.05; s.z += (target.z - s.z) * 0.05;
        s.visiting = a.room !== a.home; s.moving = a.state === 'walk'; s.working = a.working;
        this.sat.set(a.id, s);
      });
    }
  }

  draw(t) {
    if (!this.visible) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const g = this.canvas.getContext('2d');
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The space: dark, a faint light from above, the ground falling away below.
    const bg = g.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, Math.max(W, H) * 0.75);
    bg.addColorStop(0, '#0d1118'); bg.addColorStop(1, '#040507');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const d = this.data;
    if (!d) { g.fillStyle = '#5b6574'; g.font = '12px "Geist Mono", ui-monospace, monospace'; g.fillText('No graph.json — run npm run vault:graph with the Obsidian vault present.', 24, 40); return; }
    if (!this.fitted) this.fit();
    // A slow turn, and a lean toward the pointer.
    const lean = this.lean || { x: 0, y: 0 };
    this.yaw += ((Math.sin(t * 0.04) * 0.38 + lean.x * 0.25) - this.yaw) * 0.04;
    this.pitch += ((0.3 + lean.y * 0.15) - this.pitch) * 0.04;
    this.layoutAgents(t);
    const k = this.view.k;

    // The ground grid, in perspective, under the field.
    g.lineWidth = 1;
    for (let i = -7; i <= 7; i++) {
      const a1 = this.project(i * 200, 1150, -1400), a2 = this.project(i * 200, 1150, 1400);
      const b1 = this.project(-1400, 1150, i * 200), b2 = this.project(1400, 1150, i * 200);
      g.strokeStyle = `rgba(150,170,192,${i === 0 ? 0.08 : 0.035})`;
      g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(a2[0], a2[1]); g.moveTo(b1[0], b1[1]); g.lineTo(b2[0], b2[1]); g.stroke();
    }

    // Project every note once; everything below reads the cache.
    const N = d.nodes.length, px = this.px, py = this.py, pf = this.pf;
    for (let i = 0; i < N; i++) { const n = d.nodes[i]; const p = this.project(n.x, n.y, n.z); px[i] = p[0]; py[i] = p[1]; pf[i] = p[2]; }
    this.roomsP = d.rooms.map((r) => { const p = this.project(r.x, r.y, 0); return { ...r, sx: p[0], sy: p[1], f: p[2] }; });
    for (const s of this.sat.values()) { const p = this.project(s.x, s.y, s.z); s.sx = p[0]; s.sy = p[1]; s.f = p[2]; }

    const q = this.query;
    const hi = this.hover?.kind === 'note' ? new Set([this.hover.i, ...d.adj[this.hover.i]]) : null;
    const matches = q ? new Set(d.nodes.map((n, i) => (n.t.toLowerCase().includes(q) ? i : -1)).filter((i) => i >= 0)) : null;
    const dim = hi || matches;

    // Edges, in two passes: near ones brighter than far ones.
    for (const pass of [0, 1]) {
      g.strokeStyle = dim ? 'rgba(255,255,255,0.03)' : pass ? 'rgba(200,215,235,0.11)' : 'rgba(200,215,235,0.05)';
      g.beginPath();
      for (const [a, b] of d.edges) {
        if (this.hidden.has(d.nodes[a].g) || this.hidden.has(d.nodes[b].g)) continue;
        if ((pf[a] + pf[b] > 2) !== !!pass) continue;
        g.moveTo(px[a], py[a]); g.lineTo(px[b], py[b]);
      }
      g.stroke();
    }
    if (hi) { g.strokeStyle = 'rgba(228,233,239,0.6)'; g.beginPath(); for (const j of d.adj[this.hover.i]) { g.moveTo(px[this.hover.i], py[this.hover.i]); g.lineTo(px[j], py[j]); } g.stroke(); }
    // Room → folder tethers, and the pulse a working agent sends down them.
    const working = new Set(this.ctx.sim.agents.filter((a) => a.working).map((a) => a.room));
    g.strokeStyle = 'rgba(228,233,239,0.07)'; g.beginPath();
    for (const r of this.roomsP) for (const j of r.links) { g.moveTo(r.sx, r.sy); g.lineTo(px[j], py[j]); }
    g.stroke();
    for (const r of this.roomsP) {
      if (!working.has(r.id) || !r.links.length) continue;
      const col = TONE_ACCENT[r.accent] || '#e4e9ef';
      g.fillStyle = col;
      for (let m = 0; m < Math.min(6, r.links.length); m++) {
        const j = r.links[(m * 7 + Math.floor(t * 0.5)) % r.links.length];
        const s = (t * 0.45 + m * 0.37) % 1;
        g.globalAlpha = Math.sin(s * Math.PI) * 0.9;
        g.beginPath(); g.arc(r.sx + (px[j] - r.sx) * s, r.sy + (py[j] - r.sy) * s, 1.6, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }

    // Notes, back to front, smaller and dimmer with distance.
    // Depth order changes slowly as the field turns; re-sorting every few frames is enough.
    const order = this.order || (this.order = Array.from({ length: N }, (_, i) => i));
    this.frameNo = (this.frameNo || 0) + 1;
    if (this.frameNo % 8 === 1) order.sort((a, b) => pf[a] - pf[b]);
    for (const i of order) {
      const n = d.nodes[i]; if (this.hidden.has(n.g)) continue;
      const x = px[i], y = py[i]; if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const f = pf[i];
      const r = Math.max(1, Math.min(9, 1.5 + Math.sqrt(n.d) * 1.05) * Math.sqrt(k) * f);
      const lit = !dim || dim.has(i);
      const depth = Math.max(0.25, Math.min(1, (f - 0.86) * 3.2));
      g.globalAlpha = (lit ? 1 : 0.14) * depth;
      const col = d.colour[n.g];
      if (n.d >= 12 && lit) g.drawImage(glowSprite(col), x - r * 4, y - r * 4, r * 8, r * 8);
      g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      if (matches?.has(i)) { g.strokeStyle = '#e4e9ef'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r + 3, 0, TAU); g.stroke(); }
    }
    g.globalAlpha = 1;
    // Labels for hubs when zoomed in, for matches, and for the hovered note's neighbourhood.
    g.font = `${Math.max(9, Math.min(12, 10 * Math.sqrt(k)))}px "Geist Mono", ui-monospace, monospace`; g.textBaseline = 'middle'; g.textAlign = 'left';
    for (let i = 0; i < N; i++) {
      const n = d.nodes[i]; if (this.hidden.has(n.g)) continue;
      const show = (matches && matches.has(i)) || (hi && hi.has(i)) || (!dim && n.d >= (k > 1.2 ? 3 : k > 0.6 ? 12 : 30));
      if (!show) continue;
      const x = px[i], y = py[i]; if (x < -200 || y < -20 || x > W + 20 || y > H + 20) continue;
      g.fillStyle = hi && i === this.hover.i ? '#e4e9ef' : '#8490a0'; g.fillText(n.t.slice(0, 40), x + 8, y);
    }

    // Rooms: a ring in the room's colour on a dark disc, a halo when something waits there.
    g.font = '10px "Geist Mono", ui-monospace, monospace'; g.textAlign = 'center';
    for (const r of this.roomsP) {
      const x = r.sx, y = r.sy, att = this.ctx.store.attention(r.id), col = TONE_ACCENT[r.accent] || '#e4e9ef';
      const rad = (6 + Math.min(10, att * 0.6)) * r.f;
      if (att) { g.fillStyle = `rgba(224,166,78,${0.1 + 0.05 * Math.sin(t * 2)})`; g.beginPath(); g.arc(x, y, rad + 9, 0, TAU); g.fill(); }
      g.globalAlpha = 0.7; g.drawImage(glowSprite(col), x - rad * 3, y - rad * 3, rad * 6, rad * 6); g.globalAlpha = 1;
      g.fillStyle = '#0b0e12'; g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill();
      g.fillStyle = '#e4e9ef'; g.fillText(r.name, x, y - rad - 9);
    }
    // Agents.
    for (const [id, s] of this.sat) {
      const a = AGENTS.find((x) => x.id === id);
      const rn = this.roomsP.find((r) => r.id === this.ctx.sim.byId[id].room);
      if (rn) { g.strokeStyle = s.visiting ? 'rgba(224,166,78,0.6)' : 'rgba(255,255,255,0.14)'; g.setLineDash(s.visiting ? [3, 3] : []); g.lineWidth = 1; g.beginPath(); g.moveTo(s.sx, s.sy); g.lineTo(rn.sx, rn.sy); g.stroke(); g.setLineDash([]); }
      if (s.working) g.drawImage(glowSprite(a.colour), s.sx - 12, s.sy - 12, 24, 24);
      g.fillStyle = a.colour; g.beginPath(); g.arc(s.sx, s.sy, (a.kind === 'arcane' ? 5 : 3.5) * s.f, 0, TAU); g.fill();
      if (s.moving) { g.strokeStyle = a.colour; g.lineWidth = 1; g.beginPath(); g.arc(s.sx, s.sy, 7 + Math.sin(t * 6) * 1.5, 0, TAU); g.stroke(); }
    }

    // Hover card.
    if (this.hover) {
      const h = this.hover; let title = '', lines = [];
      if (h.kind === 'note') { title = h.node.t; lines = [h.node.id, `${d.groups.find((gg) => gg.id === h.node.g)?.name} · ${h.node.d} link${h.node.d === 1 ? '' : 's'}`, 'click to open in Obsidian']; }
      else if (h.kind === 'room') { title = h.room.name; lines = [h.room.sub, `${this.ctx.store.openCount(h.room.id)} open orders`, this.ctx.sim.occupants(h.room.id).map((a) => a.cfg.name).join(', ') || 'nobody here']; }
      else { const s = this.ctx.sim.byId[h.agent.id]; title = h.agent.name; lines = [`${h.agent.role} · ${h.agent.call}`, `${s.working ? 'working at' : s.room === s.home ? 'at station in' : 'visiting'} ${ROOM_BY_ID[s.room].name}`]; }
      g.font = '11px "Geist Mono", ui-monospace, monospace'; g.textAlign = 'left';
      const w = Math.max(...[title, ...lines].map((l) => g.measureText(l).width)) + 24;
      const bh = (lines.length + 1) * 16 + 14;
      const bx = Math.min(W - w - 8, h.sx + 14), by = Math.min(H - bh - 8, h.sy + 14);
      g.fillStyle = 'rgba(12,15,19,0.94)'; g.fillRect(bx, by, w, bh);
      g.fillStyle = 'rgba(225,236,248,0.08)'; g.fillRect(bx, by, w, 1);
      g.strokeStyle = 'rgba(150,170,192,0.16)'; g.lineWidth = 1; g.strokeRect(bx + 0.5, by + 0.5, w - 1, bh - 1);
      g.fillStyle = '#e4e9ef'; g.fillText(title, bx + 12, by + 16); g.fillStyle = '#8490a0'; lines.forEach((l, i) => g.fillText(l, bx + 12, by + 33 + i * 16));
    }
  }
}

/** A soft glow in a colour, drawn once and stamped wherever it is needed. */
const glows = new Map();
function glowSprite(col) {
  let c = glows.get(col);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, hexA(col, 0.4)); gr.addColorStop(1, hexA(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glows.set(col, c);
  return c;
}

function hexA(hex, a) { const n = parseInt(String(hex).slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
