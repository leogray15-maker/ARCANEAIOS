/**
 * The floor's instruments, and the rail under every room's view.
 *
 * Small displays in the corners of the floor, each reporting something the
 * operating system actually knows: how many crew are working, walking or
 * standing; how many rooms each lamp colour is lit in; a log of the moves
 * the crew make, written as they make them; and a heartbeat of working
 * agents sampled over the last minute. None of it is invented — an empty
 * floor reads as an empty floor.
 *
 * The chassis is the same idea under a view: which module this is, which
 * agent lives here and what it is doing, who else is in the room, how much
 * work is open in it.
 */
import { ROOM_BY_ID, AGENT_BY_ID, WING_BY_ID } from '@arcane/config';
import { ROOM_STATES } from '../core/roomstate.js';
import { esc } from './ui.js';

const clock = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export class FloorHud {
  constructor(el, { sim, store }) {
    this.el = el; this.sim = sim; this.store = store;
    this.log = []; this.beat = []; this.last = new Map(); this.html = '';

    el.innerHTML = `<div class="fh fh-panel fh-tl"></div><div class="fh fh-panel fh-tr"></div><div class="fh fh-panel fh-bl"><h4>CREW MOVEMENTS</h4><div class="fh-log"></div><div class="fh-beat"></div></div>`;
    this.tl = el.querySelector('.fh-tl'); this.tr = el.querySelector('.fh-tr');
    this.logEl = el.querySelector('.fh-log'); this.beatEl = el.querySelector('.fh-beat');
    this.beatEl.innerHTML = Array.from({ length: 28 }, () => '<i></i>').join('');
    setInterval(() => this.sample(), 2500);
  }

  /** Watch the sim for moves worth writing down: a walk begun, an arrival, work started. */
  watch() {
    for (const a of this.sim.agents) {
      const was = this.last.get(a.id);
      const now = { state: a.state, room: a.room, target: a.target, working: a.working };
      this.last.set(a.id, now);
      // The first seconds of sim time are the floor settling — everyone reaches a desk at once; nothing worth logging.
      if (!was || this.sim.t < 10) continue;
      if (a.state === 'walk' && was.state !== 'walk' && a.target && a.target !== a.room) this.write(a, `→ ${ROOM_BY_ID[a.target]?.name || a.target}`);
      else if (was.state === 'walk' && a.state === 'idle') this.write(a, a.room === a.home ? 'back at station' : `arrived · ${ROOM_BY_ID[a.room]?.name}`);
      else if (a.working && !was.working) this.write(a, 'working');
    }
  }
  write(a, what) {
    this.log.push({ t: clock(), name: a.cfg.name, colour: a.cfg.colour, what });
    if (this.log.length > 9) this.log.shift();
    this.logEl.innerHTML = this.log.map((l) => `<div><time>${l.t}</time><em style="color:${l.colour}">${esc(l.name)}</em>${esc(l.what)}</div>`).join('');
  }
  /** One beat: the number of agents working right now, so the bars show the last minute of work. */
  sample() {
    this.beat.push(this.sim.agents.filter((a) => a.working).length);
    if (this.beat.length > 28) this.beat.shift();
    const max = Math.max(3, ...this.beat);
    const bars = this.beatEl.children, off = bars.length - this.beat.length;
    for (let i = 0; i < bars.length; i++) { const v = this.beat[i - off]; bars[i].style.height = v === undefined ? '1px' : `${Math.max(1, (v / max) * 16)}px`; }
  }

  /** Repaint the two readouts; called on the bar's half-second clock. */
  paint(rooms, signals) {
    this.watch();
    const ag = this.sim.agents;
    const working = ag.filter((a) => a.working).length, walking = ag.filter((a) => a.state === 'walk').length;
    const away = ag.filter((a) => a.room !== a.home).length;
    const counts = {}; for (const r of Object.values(rooms)) counts[r.key] = (counts[r.key] || 0) + 1;
    const tl = `<h4>FACILITY · LIVE</h4>
      <div class="fh-big"><div><b>${working}</b><span>WORKING</span></div><div><b>${walking}</b><span>WALKING</span></div><div><b>${ag.length - working - walking}</b><span>STANDING</span></div></div>
      <div class="fh-row"><span>open orders</span><b>${this.store.totalOpen()}</b></div>
      <div class="fh-row"><span>proposals waiting</span><b>${this.store.proposals().length}</b></div>
      <div class="fh-row"><span>signals</span><b>${signals.length}</b></div>
      <div class="fh-row"><span>crew away from station</span><b>${away}</b></div>`;
    const tr = `<h4>ROOM LAMPS</h4>${Object.values(ROOM_STATES).map((s) => `<div class="fh-state ${counts[s.key] ? '' : 'zero'}" style="--c:${s.colour}"><i></i><span>${s.word}</span><b>${counts[s.key] || 0}</b></div>`).join('')}`;
    const html = tl + tr;
    if (html === this.html) return;
    this.html = html; this.tl.innerHTML = tl; this.tr.innerHTML = tr;
  }
}

/** The module code for a room: wing number, row, wing name — C2·01 / COMMAND. */
export function moduleCode(roomId) {
  const r = ROOM_BY_ID[roomId]; if (!r) return '';
  const w = WING_BY_ID[r.wing];
  return `${w?.no || 'A'}·${String((r.row ?? 0) + 1).padStart(2, '0')}  /  ${w?.name || ''}`;
}

export function paintChassis(el, roomId, { sim, store, rooms }) {
  const r = ROOM_BY_ID[roomId];
  if (!r) { el.innerHTML = ''; return; }
  const agent = r.agent ? AGENT_BY_ID[r.agent] : null;
  const a = agent && sim.byId[agent.id];
  const doing = !a ? '' : a.working ? 'working at station' : a.state === 'walk' ? `walking to ${ROOM_BY_ID[a.target]?.name || 'a room'}` : a.room === a.home ? 'at station' : `visiting ${ROOM_BY_ID[a.room]?.name}`;
  const here = sim.occupants(roomId).filter((x) => x.id !== agent?.id);
  const lamp = rooms[roomId];
  const html = `<span class="seg"><em>MODULE</em><b>${esc(moduleCode(roomId))}</b></span>
    ${lamp ? `<span class="seg" style="--c:${lamp.colour}"><i></i><b>${lamp.word}</b><span class="faint">${esc(lamp.why)}</span></span>` : ''}
    ${agent ? `<span class="seg" style="--c:${agent.colour}"><i></i><b>${esc(agent.name)}</b><span>${esc(doing)}</span></span>` : ''}
    <span class="seg"><em>HERE</em>${here.length ? here.map((x) => `<span style="color:${x.cfg.colour}">${esc(x.cfg.name)}</span>`).join(' ') : '<span class="faint">nobody else</span>'}</span>
    <span class="seg"><em>OPEN</em><b>${store.openCount(roomId)}</b></span>
    <span class="seg"><em>ESC</em>back to the floor</span>`;
  if (el._html !== html) { el._html = html; el.innerHTML = html; }
}
