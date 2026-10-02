/**
 * The command core — the Bridge's centre, the whole system in one figure.
 *
 *   outer ring   the twenty rooms in their four wings, each segment lit by
 *                the room's lamp (core/roomstate.js): what is blocked, what
 *                needs the operator, where the work is
 *   middle ring  the nineteen agents, each placed at the room it is in now,
 *                easing round the ring as it walks; a working agent is
 *                tethered to the core and the tether carries a pulse
 *   centre       the core, turning; it warms when something needs an answer
 *
 * One persistent canvas: the Bridge re-renders its HTML on every change, so
 * the canvas is kept here and moved into the new slot each time, never
 * rebuilt. It draws only while it is on screen.
 */
import { PLAN } from '../config/floorplan.js';
import { ROOM_BY_ID, WINGS, AGENTS } from '@arcane/config';
import { TONE } from './tone.js';

const TAU = Math.PI * 2;
const STATE_TONE = { blocked: TONE.red, attention: TONE.amber, working: TONE.violet, active: TONE.cyan, ok: TONE.green };

/** The rooms in ring order: wing by wing, row by row; annexes after their wing. */
const ORDER = WINGS.flatMap((w, wi) => PLAN.filter((p) => p.wing === wi).sort((a, b) => a.row - b.row).map((p) => p.id));
const GAP = 0.09;   // radians between wings
const SPAN = (TAU - GAP * WINGS.length) / ORDER.length;
const angleOf = {};
{ let a = -Math.PI / 2 + GAP / 2; let wing = null; for (const id of ORDER) { const w = ROOM_BY_ID[id].wing; if (wing !== null && w !== wing) a += GAP; wing = w; angleOf[id] = a + SPAN / 2; a += SPAN; } }

let canvas = null, ctx = null, getRooms = () => ({}), sim = null, store = null, go = null;
let raf = 0, hover = null, sats = {};

export function installCore(opts) {
  ({ sim, store, go } = opts); getRooms = opts.rooms || getRooms;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'The system: rooms by state and agents where they are');
  ctx = canvas.getContext('2d');
  canvas.addEventListener('pointermove', (e) => { hover = hit(e); canvas.style.cursor = hover ? 'pointer' : 'crosshair'; canvas.title = hover ? hover.label : ''; });
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('click', (e) => { const h = hit(e); if (h) go(h.kind === 'room' ? (ROOM_BY_ID[h.id].opens || `#room/${h.id}`) : `#room/${sim.byId[h.id].room}`); });
}

/** Put the canvas in the slot the Bridge just rendered, and start drawing. */
export function mountCore(slot) {
  if (!canvas || !slot) return;
  if (canvas.parentElement !== slot) slot.appendChild(canvas);
  if (!raf) raf = requestAnimationFrame(frame);
}

function size() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, cx: w / 2, cy: h / 2, R: Math.min(w, h) / 2 };
}

function hit(e) {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
  const R = Math.min(r.width, r.height) / 2, d = Math.hypot(x, y);
  for (const [id, s] of Object.entries(sats)) if (Math.hypot(x - s.px, y - s.py) < 7) { const a = AGENTS.find((q) => q.id === id); return { kind: 'agent', id, label: `${a.name} · ${a.role} — in ${ROOM_BY_ID[sim.byId[id].room]?.name}` }; }
  if (d > R * 0.8 && d < R * 0.98) {
    let ang = Math.atan2(y, x);
    for (const id of ORDER) { let dd = ang - angleOf[id]; while (dd > Math.PI) dd -= TAU; while (dd < -Math.PI) dd += TAU; if (Math.abs(dd) < SPAN / 2) { const lamp = getRooms()[id]; return { kind: 'room', id, label: `${ROOM_BY_ID[id].name}${lamp ? ` — ${lamp.word}: ${lamp.why}` : ''}` }; } }
  }
  return null;
}

function frame(now) {
  raf = 0;
  if (!canvas.isConnected || !canvas.offsetParent) return;   // off screen: stop until mounted again
  const t = now / 1000;
  const { w, h, cx, cy, R } = size();
  const g = ctx;
  g.clearRect(0, 0, w, h);
  g.save(); g.translate(cx, cy);
  const rooms = getRooms();
  const attention = Object.values(rooms).some((r) => r.key === 'blocked' || r.key === 'attention');

  // Calibration: a fine scale round the outside, heavier every wing.
  g.strokeStyle = 'rgba(150,170,192,0.16)'; g.lineWidth = 1;
  for (let i = 0; i < 120; i++) { const a = (i / 120) * TAU, r0 = R * 0.985, r1 = R * (i % 10 ? 0.97 : 0.95); g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke(); }

  // The sweep: a slow pass of light round the room ring, so the figure is never still.
  const sweep = (t * 0.35) % TAU;
  const grad = g.createConicGradient ? g.createConicGradient(sweep - 0.9, 0, 0) : null;
  if (grad) { grad.addColorStop(0, 'rgba(143,128,238,0)'); grad.addColorStop(0.14, 'rgba(143,128,238,0.07)'); grad.addColorStop(0.145, 'rgba(143,128,238,0)'); g.fillStyle = grad; g.beginPath(); g.arc(0, 0, R * 0.94, 0, TAU); g.fill(); }

  // The rooms.
  for (const id of ORDER) {
    const lamp = rooms[id], col = lamp ? STATE_TONE[lamp.key] || lamp.colour : TONE.steel;
    const a = angleOf[id], on = hover?.kind === 'room' && hover.id === id;
    const pulse = lamp?.pulse ? 0.55 + 0.45 * Math.sin(t * 3.2) : 1;
    g.lineWidth = on ? 9 : 6;
    g.strokeStyle = col; g.globalAlpha = (lamp?.key === 'ok' ? 0.35 : 0.9) * pulse;
    g.shadowColor = col; g.shadowBlur = lamp?.key === 'ok' ? 0 : 10;
    g.beginPath(); g.arc(0, 0, R * 0.88, a - SPAN / 2 + 0.012, a + SPAN / 2 - 0.012); g.stroke();
    g.shadowBlur = 0; g.globalAlpha = 1;
  }
  // Wing codes in the gaps.
  g.font = '9px "Geist Mono", ui-monospace, monospace'; g.fillStyle = 'rgba(132,144,160,0.85)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  WINGS.forEach((wg, wi) => { const ids = ORDER.filter((id) => ROOM_BY_ID[id].wing === wg.id); const a = (angleOf[ids[0]] + angleOf[ids[ids.length - 1]]) / 2; g.fillText(wg.no, Math.cos(a) * R * 0.76, Math.sin(a) * R * 0.76); });

  // Inner structure: two thin rings and a slow dashed one.
  g.strokeStyle = 'rgba(150,170,192,0.12)'; g.lineWidth = 1;
  for (const k of [0.62, 0.36]) { g.beginPath(); g.arc(0, 0, R * k, 0, TAU); g.stroke(); }
  g.setLineDash([2, 6]); g.lineDashOffset = -t * 6; g.strokeStyle = 'rgba(143,128,238,0.35)'; g.beginPath(); g.arc(0, 0, R * 0.5, 0, TAU); g.stroke(); g.setLineDash([]);

  // The agents: at their room's angle on the middle ring, a little apart from each other.
  const per = {};
  for (const a of sim.agents) (per[a.room] ||= []).push(a);
  for (const [roomId, list] of Object.entries(per)) list.forEach((a, i) => {
    const base = angleOf[roomId] ?? 0;
    const target = base + (i - (list.length - 1) / 2) * 0.07;
    const s = sats[a.id] || (sats[a.id] = { a: target, px: 0, py: 0 });
    let d = target - s.a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    s.a += d * 0.04;
    const rr = R * (a.cfg.kind === 'arcane' ? 0.5 : 0.62);
    s.px = Math.cos(s.a) * rr; s.py = Math.sin(s.a) * rr;
    // A working agent is tethered to the core, and work travels down the tether.
    if (a.working) {
      g.strokeStyle = a.cfg.colour; g.globalAlpha = 0.25; g.lineWidth = 1;
      g.beginPath(); g.moveTo(s.px, s.py); g.lineTo(0, 0); g.stroke();
      const k = ((t * 0.5 + i * 0.3) % 1);
      g.globalAlpha = 0.9; g.fillStyle = a.cfg.colour; g.beginPath(); g.arc(s.px * (1 - k), s.py * (1 - k), 1.6, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
    const on = hover?.kind === 'agent' && hover.id === a.id;
    g.fillStyle = a.cfg.colour; g.shadowColor = a.cfg.colour; g.shadowBlur = a.working || on ? 12 : 4;
    g.beginPath(); g.arc(s.px, s.py, a.cfg.kind === 'arcane' ? 4.5 : on ? 4 : 3, 0, TAU); g.fill(); g.shadowBlur = 0;
    if (a.state === 'walk') { g.strokeStyle = a.cfg.colour; g.globalAlpha = 0.5; g.beginPath(); g.arc(s.px, s.py, 6 + Math.sin(t * 6) * 1.2, 0, TAU); g.stroke(); g.globalAlpha = 1; }
  });

  // The core.
  const warm = attention ? TONE.amber : TONE.violet;
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.3);
  glow.addColorStop(0, hexA(warm, 0.55)); glow.addColorStop(0.35, hexA(warm, 0.14)); glow.addColorStop(1, hexA(warm, 0));
  g.fillStyle = glow; g.beginPath(); g.arc(0, 0, R * 0.3, 0, TAU); g.fill();
  for (let i = 0; i < 3; i++) {
    g.save(); g.rotate(t * (0.3 + i * 0.17) * (i % 2 ? -1 : 1));
    g.strokeStyle = i === 1 ? TONE.cyan : warm; g.globalAlpha = 0.75; g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(0, 0, R * (0.12 + i * 0.045), R * (0.05 + i * 0.03), 0, 0, TAU); g.stroke();
    g.restore();
  }
  g.globalAlpha = 1; g.fillStyle = '#e8e4ff'; g.shadowColor = warm; g.shadowBlur = 18;
  g.beginPath(); g.arc(0, 0, R * 0.035 + Math.sin(t * 1.4) * 0.6, 0, TAU); g.fill(); g.shadowBlur = 0;
  g.restore();
  raf = requestAnimationFrame(frame);
}

function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
