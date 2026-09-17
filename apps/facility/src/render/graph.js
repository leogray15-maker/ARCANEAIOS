/**
 * The Brain Graph — the Obsidian vault, drawn.
 *
 * Every note in the vault is a node, every wikilink or Notion-style link
 * an edge, grouped and coloured by folder, positions precomputed by
 * tools/vault-graph.mjs. On top of that, the OS: the twenty rooms sit on
 * the brain folders they own, and every agent orbits the room it is in
 * right now. Click a note to open it in Obsidian; click a room or an agent
 * to open the room's dashboard. Drag to pan, wheel to zoom, type to find.
 */
import { AGENTS, ROOM_BY_ID } from '@arcane/config';

const TAU = Math.PI * 2;
const ACCENT = { arcane: '#8b5cf6', cyan: '#56c9f0', vital: '#3ecf8e', flare: '#e8b64c', gold: '#d9a441', rose: '#e0609a', breach: '#f44d52' };

export class BrainGraph {
  constructor(canvas, legend, ctx, onRoom) {
    this.canvas = canvas; this.legend = legend; this.ctx = ctx; this.onRoom = onRoom;
    this.data = null; this.visible = false;
    this.view = { x: 0, y: 0, k: 0.4 };
    this.hover = null; this.query = ''; this.hidden = new Set();
    this.sat = new Map();
    fetch('/graph.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => { this.data = d; if (d) this.prepare(); }).catch(() => {});
    this.bind();
  }

  prepare() {
    const d = this.data;
    d.adj = d.nodes.map(() => []);
    for (const [a, b] of d.edges) { d.adj[a].push(b); d.adj[b].push(a); }
    d.colour = Object.fromEntries(d.groups.map((g) => [g.id, g.colour]));
    this.legend.innerHTML = `<input type="search" id="graph-q" placeholder="Find a note…" style="width:100%;margin-bottom:8px">` +
      d.groups.map((g) => `<label class="chk" style="display:block"><input type="checkbox" data-group="${g.id}" checked> <span class="dot" style="background:${g.colour}"></span>${g.name} <span class="faint">${g.n}</span></label>`).join('') +
      `<div style="margin-top:6px"><span class="dot" style="background:#ecebf5"></span>room · <span class="dot" style="background:#a98bff"></span>agent, orbiting its room</div>
       <div class="faint" style="margin-top:6px">${d.nodes.length} notes · ${d.edges.length} links · vault "${d.vault}"<br>click a note → Obsidian · room or agent → dashboard · drag · wheel</div>`;
    this.legend.querySelector('#graph-q').addEventListener('input', (e) => { this.query = e.target.value.trim().toLowerCase(); });
    for (const cb of this.legend.querySelectorAll('[data-group]')) cb.addEventListener('change', () => { cb.checked ? this.hidden.delete(cb.dataset.group) : this.hidden.add(cb.dataset.group); });
  }

  bind() {
    const cv = this.canvas; let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, moved: false }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
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
    cv.addEventListener('pointerleave', () => { this.hover = null; });
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
    this.view.k = Math.min(W, H) / 2200; this.view.x = W / 2; this.view.y = H / 2; this.fitted = true;
  }

  sx(x) { return this.view.x + x * this.view.k; }
  sy(y) { return this.view.y + y * this.view.k; }

  hit(x, y) {
    if (!this.data) return null;
    let best = null, bd = 10;
    for (const r of this.data.rooms) { const d = Math.hypot(this.sx(r.x) - x, this.sy(r.y) - y); if (d < bd + 6) { bd = d; best = { kind: 'room', room: ROOM_BY_ID[r.id], x: r.x, y: r.y }; } }
    for (const [id, s] of this.sat) { const d = Math.hypot(this.sx(s.x) - x, this.sy(s.y) - y); if (d < bd + 4) { bd = d; best = { kind: 'agent', agent: AGENTS.find((a) => a.id === id), x: s.x, y: s.y }; } }
    if (best) return best;
    for (let i = 0; i < this.data.nodes.length; i++) {
      const n = this.data.nodes[i]; if (this.hidden.has(n.g)) continue;
      const d = Math.hypot(this.sx(n.x) - x, this.sy(n.y) - y);
      if (d < bd) { bd = d; best = { kind: 'note', node: n, i, x: n.x, y: n.y }; }
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
        const target = { x: rn.x + Math.cos(ang) * rad, y: rn.y + Math.sin(ang) * rad };
        const s = this.sat.get(a.id) || { ...target };
        s.x += (target.x - s.x) * 0.05; s.y += (target.y - s.y) * 0.05; s.visiting = a.room !== a.home; s.moving = a.state === 'walk';
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
    g.fillStyle = '#07070d'; g.fillRect(0, 0, W, H);
    const d = this.data;
    if (!d) { g.fillStyle = '#4e4c64'; g.font = '12px ui-monospace, Menlo, monospace'; g.fillText('No graph.json — run npm run vault:graph with the Obsidian vault present.', 24, 40); return; }
    if (!this.fitted) this.fit();
    this.layoutAgents(t);
    const k = this.view.k;
    const q = this.query;
    const hi = this.hover?.kind === 'note' ? new Set([this.hover.i, ...d.adj[this.hover.i]]) : null;
    const matches = q ? new Set(d.nodes.map((n, i) => (n.t.toLowerCase().includes(q) ? i : -1)).filter((i) => i >= 0)) : null;
    const dim = hi || matches;

    // Edges — one path per state so the hot ones draw on top.
    g.lineWidth = 1;
    g.strokeStyle = dim ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.09)'; g.beginPath();
    for (const [a, b] of d.edges) { if (this.hidden.has(d.nodes[a].g) || this.hidden.has(d.nodes[b].g)) continue; g.moveTo(this.sx(d.nodes[a].x), this.sy(d.nodes[a].y)); g.lineTo(this.sx(d.nodes[b].x), this.sy(d.nodes[b].y)); }
    g.stroke();
    if (hi) { g.strokeStyle = 'rgba(236,235,245,0.55)'; g.beginPath(); for (const j of d.adj[this.hover.i]) { g.moveTo(this.sx(this.hover.x), this.sy(this.hover.y)); g.lineTo(this.sx(d.nodes[j].x), this.sy(d.nodes[j].y)); } g.stroke(); }
    // Room → folder tethers.
    g.strokeStyle = 'rgba(236,235,245,0.10)'; g.beginPath();
    for (const r of d.rooms) for (const j of r.links) { g.moveTo(this.sx(r.x), this.sy(r.y)); g.lineTo(this.sx(d.nodes[j].x), this.sy(d.nodes[j].y)); }
    g.stroke();

    // Notes.
    for (let i = 0; i < d.nodes.length; i++) {
      const n = d.nodes[i]; if (this.hidden.has(n.g)) continue;
      const x = this.sx(n.x), y = this.sy(n.y); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const r = Math.max(1.2, Math.min(9, 1.6 + Math.sqrt(n.d) * 1.1) * Math.sqrt(k));
      const lit = !dim || dim.has(i);
      g.globalAlpha = lit ? 1 : 0.18;
      g.fillStyle = d.colour[n.g]; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      if (matches?.has(i)) { g.strokeStyle = '#ecebf5'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r + 3, 0, TAU); g.stroke(); }
    }
    g.globalAlpha = 1;
    // Labels for hubs when zoomed in, for matches, and for the hovered note's neighbourhood.
    g.font = `${Math.max(9, Math.min(13, 10 * Math.sqrt(k)))}px ui-monospace, Menlo, monospace`; g.textBaseline = 'middle'; g.textAlign = 'left';
    for (let i = 0; i < d.nodes.length; i++) {
      const n = d.nodes[i]; if (this.hidden.has(n.g)) continue;
      const show = (matches && matches.has(i)) || (hi && hi.has(i)) || (!dim && n.d >= (k > 1.2 ? 3 : k > 0.6 ? 12 : 30));
      if (!show) continue;
      const x = this.sx(n.x), y = this.sy(n.y); if (x < -200 || y < -20 || x > W + 20 || y > H + 20) continue;
      g.fillStyle = hi && i === this.hover.i ? '#ecebf5' : '#8a889e'; g.fillText(n.t.slice(0, 40), x + 8, y);
    }

    // Rooms.
    g.font = '10px ui-monospace, Menlo, monospace'; g.textAlign = 'center';
    for (const r of d.rooms) {
      const x = this.sx(r.x), y = this.sy(r.y); const att = this.ctx.store.attention(r.id);
      const rad = 6 + Math.min(10, att * 0.6);
      if (att) { g.fillStyle = `rgba(232,182,76,${0.10 + 0.05 * Math.sin(t * 2)})`; g.beginPath(); g.arc(x, y, rad + 8, 0, TAU); g.fill(); }
      g.fillStyle = '#0f0f1a'; g.strokeStyle = ACCENT[r.accent] || '#ecebf5'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#ecebf5'; g.fillText(r.name, x, y - rad - 8);
    }
    // Agents.
    for (const [id, s] of this.sat) {
      const a = AGENTS.find((x) => x.id === id); const x = this.sx(s.x), y = this.sy(s.y);
      const rn = d.rooms.find((r) => r.id === this.ctx.sim.byId[id].room);
      if (rn) { g.strokeStyle = s.visiting ? 'rgba(232,182,76,0.6)' : 'rgba(255,255,255,0.15)'; g.setLineDash(s.visiting ? [3, 3] : []); g.beginPath(); g.moveTo(x, y); g.lineTo(this.sx(rn.x), this.sy(rn.y)); g.stroke(); g.setLineDash([]); }
      g.fillStyle = a.colour; g.beginPath(); g.arc(x, y, a.kind === 'arcane' ? 5 : 3.5, 0, TAU); g.fill();
      if (s.moving) { g.strokeStyle = a.colour; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 7 + Math.sin(t * 6) * 1.5, 0, TAU); g.stroke(); }
    }

    // Hover card.
    if (this.hover) {
      const h = this.hover; let title = '', lines = [];
      if (h.kind === 'note') { title = h.node.t; lines = [h.node.id, `${d.groups.find((gg) => gg.id === h.node.g)?.name} · ${h.node.d} link${h.node.d === 1 ? '' : 's'}`, 'click to open in Obsidian']; }
      else if (h.kind === 'room') { title = h.room.name; lines = [h.room.sub, `${this.ctx.store.openCount(h.room.id)} open orders`, this.ctx.sim.occupants(h.room.id).map((a) => a.cfg.name).join(', ') || 'nobody here']; }
      else { const s = this.ctx.sim.byId[h.agent.id]; title = h.agent.name; lines = [`${h.agent.role} · ${h.agent.call}`, `${s.room === s.home ? 'at station' : 'visiting'} ${ROOM_BY_ID[s.room].name}`]; }
      g.font = '11px ui-monospace, Menlo, monospace'; g.textAlign = 'left';
      const w = Math.max(...[title, ...lines].map((l) => g.measureText(l).width)) + 20;
      const px = this.sx(h.x), py = this.sy(h.y);
      const bx = Math.min(W - w - 8, px + 14), by = Math.min(H - (lines.length + 1) * 16 - 16, py + 14);
      g.fillStyle = 'rgba(11,11,20,0.95)'; g.fillRect(bx, by, w, (lines.length + 1) * 16 + 10); g.strokeStyle = '#24243a'; g.lineWidth = 1; g.strokeRect(bx + 0.5, by + 0.5, w, (lines.length + 1) * 16 + 10);
      g.fillStyle = '#ecebf5'; g.fillText(title, bx + 10, by + 13); g.fillStyle = '#8a889e'; lines.forEach((l, i) => g.fillText(l, bx + 10, by + 29 + i * 16));
    }
  }
}
