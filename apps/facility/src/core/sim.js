/**
 * The crew on the floor.
 *
 * Every agent has a position, a facing, a walk cel and a small state
 * machine: `idle` at a station, `walk` along a list of waypoints, `drift`
 * (wandering inside the current room). ARCANE takes commands: click a
 * room and the commander routes door-to-door through the corridor graph,
 * then to the room's station.
 *
 * Attention — ported from LEOOS v2: every ten to thirty seconds a crew
 * member weighs the rooms. Open orders pull (more for P0), the home
 * station pulls, the room the commander is standing in pulls, the room
 * they are already in repels. They walk to the winner; in a foreign room
 * they keep to its walk zone, at home they return to the station. So the
 * floor is a picture of the work: add an order and someone comes.
 *
 * Positions are the sprite's feet, centre-bottom, in buffer pixels.
 * Nothing here draws; `factory.js` asks the sim what to draw and where.
 */
import { AGENTS, ROOM_BY_ID } from '@arcane/config';
import { PLAN, PLAN_BY_ID, buildGraph, path, roomAt } from '../config/floorplan.js';
import { ROOM_PROPS } from '../config/props.js';

const CREW_SPEED = 38;    // px per second — purposeful, not frantic
const ARCANE_SPEED = 68;
const CEL_TIME = 0.12;    // seconds per walk cel
const BLINK_EVERY = [2.5, 6];
const BLINK_FOR = 0.14;
const CONSIDER_HOME = [45, 150]; // seconds at the station before weighing the rooms
const CONSIDER_AWAY = [8, 20];   // seconds in a foreign room before weighing again
const pickWeighted = (bag) => bag[Math.floor(Math.random() * bag.length)];

const rand = (a, b) => a + Math.random() * (b - a);

/** Absolute station point and facing for a room. */
export function stationOf(roomId) {
  const p = PLAN_BY_ID[roomId], s = ROOM_PROPS[roomId].station;
  return { x: p.rect[0] + s.x, y: p.rect[1] + s.y, face: s.face };
}
/** A point just inside a room's door, on the room side. */
function insideDoor(roomId) {
  const p = PLAN_BY_ID[roomId];
  const [dx, dy] = p.door;
  return { x: p.side === 'right' ? dx - 10 : dx + 10, y: dy + 8 };
}
/** A point just outside a room's door, in the corridor. */
function outsideDoor(roomId) {
  const p = PLAN_BY_ID[roomId];
  const [dx, dy] = p.door;
  return { x: p.side === 'right' ? dx + 8 : dx - 8, y: dy + 8 };
}

export class Sim {
  constructor(store = null) {
    this.store = store;
    this.graph = buildGraph();
    this.t = 0;
    this.agents = AGENTS.map((a) => {
      const st = stationOf(a.room);
      return {
        id: a.id, cfg: a, room: a.room, home: a.room,
        x: st.x, y: st.y, face: st.face, cel: 0, celClock: 0,
        state: 'idle', path: [], speed: a.kind === 'arcane' ? ARCANE_SPEED : CREW_SPEED,
        idleUntil: this.t + rand(3, 14), bob: 0, target: null, blinkAt: rand(...BLINK_EVERY), blinking: false, considerAt: rand(10, 90), working: false, talking: false, phase: Math.random() * 2,
      };
    });
    this.byId = Object.fromEntries(this.agents.map((a) => [a.id, a]));
  }

  /** Send the commander to a room. */
  command(roomId) {
    const a = this.byId.arcane;
    if (!roomId || a.target === roomId) return;
    a.target = roomId;
    a.path = this.route(a, roomId);
    a.state = 'walk';
  }

  /**
   * Waypoints from an agent's current position to another room's station:
   * to the inside of the current room's door, out of it, along the graph,
   * in through the destination's door, to its station. If the agent is
   * already in a corridor, it starts from the nearest graph node.
   */
  route(a, toRoom, dest = stationOf(toRoom)) {
    const here = roomAt(a.x, a.y);
    const wps = [];
    let fromNode;
    if (here) {
      if (here.id === toRoom) return [dest];
      wps.push(insideDoor(here.id), outsideDoor(here.id));
      fromNode = `d:${here.id}`;
    } else {
      fromNode = this.nearestNode(a.x, a.y);
      wps.push({ x: this.graph.nodes.get(fromNode).x, y: this.graph.nodes.get(fromNode).y });
    }
    const nodes = path(this.graph, fromNode, `d:${toRoom}`) || [];
    // Door nodes sit on the wall line; the corridor nodes are what we walk between.
    for (const n of nodes) if (!n.id.startsWith('d:')) wps.push({ x: n.x, y: n.y + 8 });
    wps.push(outsideDoor(toRoom), insideDoor(toRoom), dest);
    return wps;
  }

  nearestNode(x, y) {
    let best = null, bd = Infinity;
    for (const n of this.graph.nodes.values()) {
      if (n.id.startsWith('d:')) continue;
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }

  /** A random point in a room's walk zone. */
  walkPoint(roomId) {
    const p = PLAN_BY_ID[roomId], [wx, wy, ww, wh] = ROOM_PROPS[roomId].walk;
    return { x: p.rect[0] + wx + rand(2, ww - 2), y: p.rect[1] + wy + rand(2, wh - 2) };
  }
  /** Crew wander: a random point in the current room's walk zone, then (at home) back to the station. */
  drift(a) {
    a.path = [this.walkPoint(a.room)];
    a.state = 'drift';
  }

  /**
   * Where a crew member goes next. Weights from v2: open orders ×2.4 each
   * (plus priority), home +5, the commander's room +4, the current room ×0.2.
   */
  chooseRoom(a) {
    const bag = [];
    const arcaneRoom = this.byId.arcane.room;
    // Away from home, half the time the next move is simply back — visits are trips, not relocations.
    if (a.room !== a.home && Math.random() < 0.5) return a.home;
    for (const p of PLAN) {
      let w = 0.2;                                    // an empty room is barely worth a visit
      if (this.store) w += this.store.openCount(p.id) * 1.5 + this.store.attention(p.id) * 0.2;
      if (p.id === a.home) w += 8;
      if (p.id === arcaneRoom) w += 3;
      if (p.id === a.room) w *= 0.2;
      for (let i = 0; i < Math.round(w * 4); i++) bag.push(p.id);
    }
    return bag.length ? pickWeighted(bag) : a.home;
  }
  /** Send a crew member to a room: the station if it is home, the walk zone if not. */
  travel(a, roomId) {
    if (roomId === a.room) return false;
    const st = stationOf(roomId);
    const dest = roomId === a.home ? { x: st.x, y: st.y, face: st.face } : this.walkPoint(roomId);
    a.path = this.route(a, roomId, dest);
    a.target = roomId;
    a.state = 'walk';
    a.homeAt = null;
    return true;
  }

  update(dt) {
    this.t += dt;
    this.converse();
    for (const a of this.agents) {
      if (a.state === 'walk' || a.state === 'drift') this.step(a, dt);
      else {
        a.bob = Math.sin(this.t * 2.2 + a.x * 0.1) > 0.92 ? 1 : 0;
        // A blink every few seconds, held for a few frames. Only when standing — a walker's eyes are busy.
        if (this.t > a.blinkAt) { a.blinking = true; if (this.t > a.blinkAt + BLINK_FOR) { a.blinking = false; a.blinkAt = this.t + rand(...BLINK_EVERY); } }
        if (a.cfg.kind === 'arcane') continue;
        if (this.t > a.considerAt) {
          a.considerAt = this.t + rand(...(a.room === a.home ? CONSIDER_HOME : CONSIDER_AWAY));
          const next = this.chooseRoom(a);
          if (next !== a.room && this.travel(a, next)) continue;
        }
        if (a.homeAt && this.t > a.homeAt) {
          a.homeAt = null;
          if (a.room === a.home) { const st = stationOf(a.room); a.path = [{ x: st.x, y: st.y }]; a.state = 'drift'; }
          else this.drift(a);
        }
        else if (!a.homeAt && this.t > a.idleUntil) this.drift(a);
      }
    }
  }

  /**
   * Two idle crew within arm's reach turn to each other and talk; an idle
   * agent at their own station works. Both are only how the figure is
   * drawn — nothing about routing changes.
   */
  converse() {
    const idle = this.agents.filter((a) => a.state === 'idle');
    for (const a of idle) { a.talking = false; const st = stationOf(a.room); a.working = a.room === a.home && Math.hypot(a.x - st.x, a.y - st.y) < 3; }
    for (let i = 0; i < idle.length; i++) for (let j = i + 1; j < idle.length; j++) {
      const a = idle[i], b = idle[j];
      if (a.talking || b.talking || a.room !== b.room) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) > 26 || Math.abs(dy) > 12) continue;
      a.talking = b.talking = true; a.working = b.working = false;
      if (Math.abs(dx) > 5) { a.face = dx > 0 ? 'right' : 'left'; b.face = dx > 0 ? 'left' : 'right'; }
    }
  }

  step(a, dt) {
    const wp = a.path[0];
    if (!wp) { this.arrive(a); return; }
    const dx = wp.x - a.x, dy = wp.y - a.y;
    const dist = Math.hypot(dx, dy);
    const move = a.speed * dt;
    if (dist <= move) { a.x = wp.x; a.y = wp.y; a.path.shift(); if (!a.path.length) this.arrive(a, wp); return; }
    a.x += (dx / dist) * move; a.y += (dy / dist) * move;
    a.face = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'back' : 'front');
    a.celClock += dt;
    if (a.celClock >= CEL_TIME) { a.celClock -= CEL_TIME; a.cel = (a.cel + 1) % 4; }
    const r = roomAt(a.x, a.y); if (r) a.room = r.id;
  }

  arrive(a, wp) {
    a.cel = 0; a.celClock = 0;
    if (a.state === 'walk') {
      a.room = a.target; a.target = null;
      a.face = wp?.face || (a.room === a.home ? stationOf(a.room).face : 'front');
      a.state = 'idle';
      a.idleUntil = this.t + rand(4, 12);
      a.considerAt = this.t + rand(...(a.room === a.home ? CONSIDER_HOME : CONSIDER_AWAY));
      this.store?.setPosition(a.id, a.room);
      return;
    }
    // A drift ends either at the wander point (pause, then walk home) or
    // back at the station (settle, face the anchor, wait a while).
    const st = stationOf(a.room);
    const atHome = a.room === a.home && Math.abs(a.x - st.x) < 1 && Math.abs(a.y - st.y) < 1;
    a.state = 'idle';
    if (atHome) { a.face = st.face; a.idleUntil = this.t + rand(8, 24); a.homeAt = null; }
    else { a.homeAt = this.t + rand(2, 6); a.face = Math.random() < 0.5 ? 'front' : a.face; }
  }

  /** Who is in a room right now. */
  occupants(roomId) { return this.agents.filter((a) => a.room === roomId); }

  /** Draw order: by feet y, so a figure lower on the floor is drawn in front. */
  drawList() { return [...this.agents].sort((p, q) => p.y - q.y); }
}
