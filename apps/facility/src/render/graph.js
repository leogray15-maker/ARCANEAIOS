/**
 * The Brain Graph — a visual map of the system's state.
 *
 * Radial, so the structure is legible without a physics run: the brain at
 * the centre with its folders around it; the four wings on the first ring;
 * each wing's five rooms fanned in its sector; a venture between the brain
 * and the room that answers for it; every agent as a satellite of the room
 * it is standing in right now, so a visit shows as a satellite that has
 * moved. Room nodes swell with their attention (open orders, P0 hardest).
 * Click a room or an agent to open that room's dashboard. Drag to pan.
 */
import { WINGS, ROOMS, ROOM_BY_ID, AGENTS, VENTURES, roomsInWing, BRIEF_BLOCKS } from '@arcane/config';

const TAU = Math.PI * 2;
const TONE = { arcane: '#8b5cf6', arcaneLt: '#a98bff', cyan: '#56c9f0', vital: '#3ecf8e', flare: '#e8b64c', gold: '#d9a441', rose: '#e0609a', breach: '#f44d52', ash: '#8a889e', faint: '#4e4c64', ink: '#ecebf5', line: '#24243a' };
const accent = (id) => TONE[id] || TONE.arcane;
const FOLDERS = [
  ['00-Inbox', 'inventor'], ['01-System', 'control'], ['02-Content', 'beacon'], ['03-Memory', 'bridge'],
  ['04-Records', 'records'], ['05-Knowledge', 'archives'], ['06-Orders', 'bridge'], ['99-Templates', null],
];

export class BrainGraph {
  constructor(canvas, legend, ctx, onRoom) {
    this.canvas = canvas; this.legend = legend; this.ctx = ctx; this.onRoom = onRoom;
    this.nodes = []; this.byId = new Map(); this.edges = [];
    this.pan = { x: 0, y: 0 }; this.hover = null; this.visible = false;
    this.satellites = new Map(); // agentId → { x, y } eased toward its current room
    this.build();
    this.bind();
    legend.innerHTML = [['arcane', 'wing'], ['ink', 'room · size is attention'], ['gold', 'venture'], ['cyan', 'brain folder'], ['vital', 'agent · orbits the room it is in']]
      .map(([t, l]) => `<div><span class="dot" style="background:${TONE[t]}"></span>${l}</div>`).join('') + '<div class="faint">click a room or agent · drag to pan · Esc to leave</div>';
  }

  /** Positions in a unit layout; scaled to the canvas at draw time. */
  build() {
    const add = (n) => { this.nodes.push(n); this.byId.set(n.id, n); return n; };
    add({ id: 'brain', kind: 'brain', label: 'THE BRAIN', x: 0, y: 0, r: 26, colour: TONE.arcaneLt });
    FOLDERS.forEach(([name, room], i) => {
      const a = -Math.PI / 2 + (i / FOLDERS.length) * TAU;
      add({ id: `f:${name}`, kind: 'folder', label: name, x: Math.cos(a) * 95, y: Math.sin(a) * 95, r: 7, colour: TONE.cyan, room });
      this.edges.push(['brain', `f:${name}`, 'rgba(86,201,240,0.25)']);
      if (room) this.edges.push([`f:${name}`, `room:${room}`, 'rgba(86,201,240,0.18)']);
    });
    WINGS.forEach((w, wi) => {
      const base = -Math.PI / 2 + wi * (TAU / 4);
      add({ id: `wing:${w.id}`, kind: 'wing', label: w.name, x: Math.cos(base) * 175, y: Math.sin(base) * 175, r: 14, colour: accent(w.accent) });
      this.edges.push(['brain', `wing:${w.id}`, 'rgba(139,92,246,0.2)']);
      roomsInWing(w.id).forEach((room, ri) => {
        const a = base + (ri - 2) * (TAU / 4 / 5.6);
        add({ id: `room:${room.id}`, kind: 'room', label: room.name, x: Math.cos(a) * 330, y: Math.sin(a) * 330, r: 11, colour: accent(room.accent), room: room.id });
        this.edges.push([`wing:${w.id}`, `room:${room.id}`, 'rgba(255,255,255,0.10)']);
      });
    });
    VENTURES.forEach((v) => {
      const rn = this.byId.get(`room:${v.room}`);
      const a = Math.atan2(rn.y, rn.x);
      add({ id: `v:${v.id}`, kind: 'venture', label: v.name, x: Math.cos(a) * 250, y: Math.sin(a) * 250, r: 9, colour: TONE.gold, room: v.room });
      this.edges.push([`v:${v.id}`, `room:${v.room}`, 'rgba(217,164,65,0.35)']);
      this.edges.push(['brain', `v:${v.id}`, 'rgba(217,164,65,0.12)']);
    });
    AGENTS.forEach((a) => add({ id: `a:${a.id}`, kind: 'agent', label: a.name, x: 0, y: 0, r: a.kind === 'arcane' ? 7 : 5, colour: a.colour, agent: a }));
  }

  bind() {
    const cv = this.canvas; let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y, moved: false }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; this.pan.x = drag.px + dx; this.pan.y = drag.py + dy; return; }
      this.hover = this.hit(e.offsetX, e.offsetY);
      cv.style.cursor = this.hover && (this.hover.kind === 'room' || this.hover.kind === 'agent' || this.hover.kind === 'venture' || this.hover.kind === 'folder') ? 'pointer' : 'grab';
    });
    cv.addEventListener('pointerup', (e) => {
      const moved = drag?.moved; drag = null; if (moved) return;
      const n = this.hit(e.offsetX, e.offsetY); if (!n) return;
      const room = n.kind === 'room' ? n.room : n.kind === 'agent' ? this.ctx.sim.byId[n.agent.id].room : n.room;
      if (room) this.onRoom(room);
    });
    cv.addEventListener('pointerleave', () => { this.hover = null; });
  }

  show() { this.visible = true; this.resize(); }
  hide() { this.visible = false; }
  resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight; if (!W) return;
    this.canvas.width = W * dpr; this.canvas.height = H * dpr;
    this.scale = Math.min(W, H) / 780;
  }

  /** Screen position of a node. */
  pos(n) {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    return { x: W / 2 + this.pan.x + n.x * this.scale, y: H / 2 + this.pan.y + n.y * this.scale };
  }
  hit(x, y) {
    let best = null, bd = 14;
    for (const n of this.nodes) { const p = this.pos(n); const d = Math.hypot(p.x - x, p.y - y); if (d < bd + n.r * this.scale) { bd = d; best = n; } }
    return best;
  }

  /** Agents orbit their current room; a walker eases between rooms. */
  layoutAgents(t) {
    const perRoom = {};
    for (const a of this.ctx.sim.agents) { (perRoom[a.room] ||= []).push(a); }
    for (const [roomId, list] of Object.entries(perRoom)) {
      const rn = this.byId.get(`room:${roomId}`); if (!rn) continue;
      list.forEach((a, i) => {
        const ang = (i / list.length) * TAU + t * 0.25 + roomId.length;
        const rad = 22 + (list.length > 3 ? 6 : 0);
        const target = { x: rn.x + Math.cos(ang) * rad, y: rn.y + Math.sin(ang) * rad };
        const s = this.satellites.get(a.id) || { ...target };
        s.x += (target.x - s.x) * 0.06; s.y += (target.y - s.y) * 0.06;
        this.satellites.set(a.id, s);
        const n = this.byId.get(`a:${a.id}`); n.x = s.x; n.y = s.y; n.visiting = a.room !== a.home; n.moving = a.state === 'walk';
      });
    }
  }

  draw(t) {
    if (!this.visible) return;
    const { store, brain, sim } = this.ctx;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const g = this.canvas.getContext('2d');
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#07070d'; g.fillRect(0, 0, W, H);
    this.layoutAgents(t);

    // Rings, faint, so the structure reads.
    const c = this.pos(this.byId.get('brain'));
    g.strokeStyle = 'rgba(255,255,255,0.04)'; g.lineWidth = 1;
    for (const r of [95, 175, 250, 330]) { g.beginPath(); g.arc(c.x, c.y, r * this.scale, 0, TAU); g.stroke(); }

    // Edges.
    g.lineWidth = 1;
    for (const [a, b, col] of this.edges) {
      const p = this.pos(this.byId.get(a)), q = this.pos(this.byId.get(b));
      g.strokeStyle = col; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
    }
    // Agent tethers: to the room they are in; dashed when visiting.
    for (const a of sim.agents) {
      const n = this.byId.get(`a:${a.id}`), rn = this.byId.get(`room:${a.room}`); if (!rn) continue;
      const p = this.pos(n), q = this.pos(rn);
      g.strokeStyle = n.visiting ? 'rgba(232,182,76,0.5)' : 'rgba(255,255,255,0.12)';
      g.setLineDash(n.visiting ? [3, 3] : []); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); g.setLineDash([]);
    }

    // Nodes.
    g.font = `11px ui-monospace, Menlo, monospace`; g.textBaseline = 'middle';
    for (const n of this.nodes) {
      const p = this.pos(n);
      let r = n.r * this.scale;
      if (n.kind === 'room') { const att = store.attention(n.room); r += Math.min(14, att * 0.9) * this.scale; if (att) { g.fillStyle = `rgba(232,182,76,${0.08 + 0.05 * Math.sin(t * 2)})`; g.beginPath(); g.arc(p.x, p.y, r + 8 * this.scale, 0, TAU); g.fill(); } }
      if (n.kind === 'brain') { const gr = g.createRadialGradient(p.x, p.y, r * 0.4, p.x, p.y, r * 2.6); gr.addColorStop(0, 'rgba(169,139,255,0.35)'); gr.addColorStop(1, 'rgba(169,139,255,0)'); g.fillStyle = gr; g.fillRect(p.x - r * 3, p.y - r * 3, r * 6, r * 6); }
      g.fillStyle = n.kind === 'room' ? '#0f0f1a' : n.colour; g.strokeStyle = n.colour; g.lineWidth = n.kind === 'room' ? 2 : 1;
      g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill(); if (n.kind === 'room' || n.kind === 'wing') g.stroke();
      if (n === this.hover) { g.strokeStyle = '#ecebf5'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, r + 4, 0, TAU); g.stroke(); }
      if (n.kind === 'agent' && n.moving) { g.strokeStyle = n.colour; g.beginPath(); g.arc(p.x, p.y, r + 3 + Math.sin(t * 6) * 1.5, 0, TAU); g.stroke(); }
      // Labels: rooms, wings, ventures, the brain always; folders and agents on hover or when few.
      const showLabel = n.kind !== 'agent' && n.kind !== 'folder' || n === this.hover;
      if (showLabel) {
        const text = n.kind === 'room' ? `${n.label}${store.openCount(n.room) ? ` · ${store.openCount(n.room)}` : ''}` : n.kind === 'brain' ? `${n.label}${brain?.brief?.date ? ` · ${brain.brief.date}` : ''}` : n.label;
        g.fillStyle = n.kind === 'room' || n.kind === 'brain' ? '#ecebf5' : n.kind === 'wing' ? n.colour : '#8a889e';
        const above = n.kind === 'wing' || n.kind === 'brain';
        g.textAlign = 'center'; g.fillText(text, p.x, p.y + (above ? -(r + 10) : r + 11));
      }
    }
    // Hover detail.
    if (this.hover) {
      const n = this.hover, p = this.pos(n);
      let lines = [];
      if (n.kind === 'room') { const rm = ROOM_BY_ID[n.room]; lines = [rm.sub, `${store.openCount(n.room)} open orders · attention ${store.attention(n.room)}`, sim.occupants(n.room).map((a) => a.cfg.name).join(', ') || 'nobody here']; }
      else if (n.kind === 'agent') { const s = sim.byId[n.agent.id]; lines = [`${n.agent.role} · ${n.agent.call}`, `${s.room === s.home ? 'at station' : 'visiting'} ${ROOM_BY_ID[s.room].name}`, n.agent.domain]; }
      else if (n.kind === 'venture') { const v = VENTURES.find((x) => `v:${x.id}` === n.id); lines = [v.kind, v.facts.join(' · ')]; }
      else if (n.kind === 'folder') { lines = [`brain/${n.label}`, `${(brain?.files?.[n.label] || []).length} files`, n.room ? `owned by ${ROOM_BY_ID[n.room].name}` : 'templates']; }
      else if (n.kind === 'brain') { lines = [`memory on ${store.where()}`, `${store.totalOpen()} open orders · ${store.drafts().length} drafts`, BRIEF_BLOCKS.map((b) => b.name).join(' · ')]; }
      else if (n.kind === 'wing') { const w = WINGS.find((x) => `wing:${x.id}` === n.id); lines = [w.sub]; }
      const w = Math.max(...lines.map((l) => g.measureText(l).width), g.measureText(n.label).width) + 20;
      const bx = Math.min(W - w - 8, p.x + 16), by = Math.min(H - (lines.length + 1) * 16 - 16, p.y + 16);
      g.fillStyle = 'rgba(11,11,20,0.95)'; g.fillRect(bx, by, w, (lines.length + 1) * 16 + 10); g.strokeStyle = TONE.line; g.strokeRect(bx + 0.5, by + 0.5, w, (lines.length + 1) * 16 + 10);
      g.textAlign = 'left'; g.fillStyle = '#ecebf5'; g.fillText(n.label, bx + 10, by + 13);
      g.fillStyle = '#8a889e'; lines.forEach((l, i) => g.fillText(l, bx + 10, by + 29 + i * 16));
    }
  }
}
