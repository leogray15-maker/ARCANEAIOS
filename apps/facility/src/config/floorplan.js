/**
 * The floor plan — geometry only.
 *
 * What a room *is* comes from @arcane/config. This file says where it sits
 * and how big it is, in a 1100x720 pixel space. Four wings of five rooms,
 * left to right, around two service corridors and a central atrium that
 * the hall crosses at a plaza:
 *
 *   margin | W0 | V0 | W1 | ATRIUM | W2 | V2 | W3 | margin
 *
 * W0 opens right onto V0 and W1 opens left onto it; W2 opens right onto V2
 * and W3 opens left onto it. The atrium has no doors — the inner wings
 * show it their windows — but it is walkable and joins the hall, so the
 * building is one graph; `test/floorplan.test.mjs` proves every room can
 * reach every other. Rooms keep their 204x114 interior so every prop
 * placement stays valid; rows are separated by gaps and each wing's rooms
 * are staggered away from their corridor by a short door passage, so the
 * floor reads as a facility rather than a grid.
 */
import { WINGS, roomsInWing } from '@arcane/config';

export const MARGIN = 24;
export const ROOM_W = 204;
export const ROOM_H = 114;
export const CORR_W = 44;
export const ATRIUM_W = 96;
export const HALL_H = 52;
export const ROW_GAP = 10;
export const DOOR_W = 12;
export const WALL = 4;

/** How far each row's room sits back from its corridor — the door passage length. */
const STAGGER = [0, 16, 6, 22, 10];
const MAX_STAGGER = Math.max(...STAGGER);

/** Column layout, left to right. Each wing reserves ROOM_W + MAX_STAGGER so its most set-back room still fits. */
const V0 = MARGIN + ROOM_W + MAX_STAGGER;      // corridor 0 left edge; W0 rooms end at V0 - stagger
const X1 = V0 + CORR_W;                        // W1 rooms start at X1 + stagger
const AT = X1 + MAX_STAGGER + ROOM_W;          // atrium left edge
const V2 = AT + ATRIUM_W + MAX_STAGGER + ROOM_W; // corridor 2 left edge; W2 rooms end at V2 - stagger
const X3 = V2 + CORR_W;                        // W3 rooms start at X3 + stagger
export const PW = X3 + MAX_STAGGER + ROOM_W + MARGIN;

/** Corridor centre lines: V0, the atrium, V2. */
export const VCORR = [V0 + CORR_W / 2, AT + ATRIUM_W / 2, V2 + CORR_W / 2];
export const CORR_X = [V0, AT, V2];
export const CORR_WIDTH = [CORR_W, ATRIUM_W, CORR_W];

/** The hall sits between rows 1 and 2, so the building has a top and a bottom half. */
const HALL_AFTER_ROW = 1;
export const ROW_Y = [];
{
  let y = MARGIN;
  for (let r = 0; r < 5; r++) {
    ROW_Y.push(y);
    y += ROOM_H + (r === HALL_AFTER_ROW ? HALL_H : ROW_GAP);
  }
}
export const HALL_Y = ROW_Y[HALL_AFTER_ROW] + ROOM_H;
export const PH = ROW_Y[4] + ROOM_H + MARGIN;

/** Which corridor a wing's doors open onto, on which side, and which way its rooms stagger. */
const WING_DOOR = [
  { corr: 0, side: 'right', x: (st) => V0 - ROOM_W - st },
  { corr: 0, side: 'left',  x: (st) => X1 + st },
  { corr: 2, side: 'right', x: (st) => V2 - ROOM_W - st },
  { corr: 2, side: 'left',  x: (st) => X3 + st },
];

/**
 * Every room with its rect, door position, the corridor it joins and the
 * passage from its door to that corridor. `rect` is [x, y, w, h].
 */
export const PLAN = WINGS.flatMap((w, wi) =>
  roomsInWing(w.id).map((room) => {
    const { corr, side, x: xOf } = WING_DOOR[wi];
    const x = xOf(STAGGER[room.row]);
    const y = ROW_Y[room.row];
    const doorX = side === 'right' ? x + ROOM_W : x;
    const doorY = y + ROOM_H / 2;
    // The passage runs from the door to the corridor's near edge.
    const corrEdge = side === 'right' ? CORR_X[corr] : CORR_X[corr] + CORR_WIDTH[corr];
    const passage = side === 'right' ? [doorX, doorY - DOOR_W / 2 - 2, corrEdge - doorX, DOOR_W + 4] : [corrEdge, doorY - DOOR_W / 2 - 2, doorX - corrEdge, DOOR_W + 4];
    return { id: room.id, wing: wi, row: room.row, rect: [x, y, ROOM_W, ROOM_H], door: [doorX, doorY], side, corr, passage };
  }),
);

export const PLAN_BY_ID = Object.fromEntries(PLAN.map((p) => [p.id, p]));

/** The plaza: where the hall crosses the atrium. */
export const PLAZA = [AT, HALL_Y - 40, ATRIUM_W, HALL_H + 80];

/* ---------- the corridor graph ---------- */

/**
 * Nodes sit where a corridor meets a room row, where it meets the hall,
 * and at every door. Edges run along corridors, along the hall, and from
 * each door to its corridor. Positions are pixel centres, so a path is
 * something a sprite can walk.
 */
export function buildGraph() {
  const nodes = new Map();
  const edges = new Map();
  const add = (id, x, y) => { nodes.set(id, { id, x, y }); edges.set(id, new Set()); };
  const join = (a, b) => { edges.get(a).add(b); edges.get(b).add(a); };

  for (let c = 0; c < VCORR.length; c++) {
    const x = VCORR[c];
    const ys = ROW_Y.map((y, r) => ({ id: `c${c}r${r}`, y: y + ROOM_H / 2 }));
    ys.splice(HALL_AFTER_ROW + 1, 0, { id: `c${c}h`, y: HALL_Y + HALL_H / 2 });
    ys.forEach((n) => add(n.id, x, n.y));
    for (let i = 1; i < ys.length; i++) join(ys[i - 1].id, ys[i].id);
  }
  for (let c = 1; c < VCORR.length; c++) join(`c${c - 1}h`, `c${c}h`);
  for (const p of PLAN) {
    add(`d:${p.id}`, p.door[0], p.door[1]);
    join(`d:${p.id}`, `c${p.corr}r${p.row}`);
  }
  return { nodes, edges };
}

/** Breadth-first path between two node ids, as a list of {x, y}. */
export function path(graph, from, to) {
  if (from === to) return [graph.nodes.get(from)];
  const prev = new Map([[from, null]]);
  const q = [from];
  while (q.length) {
    const n = q.shift();
    for (const m of graph.edges.get(n)) {
      if (prev.has(m)) continue;
      prev.set(m, n);
      if (m === to) {
        const out = [];
        for (let k = m; k !== null; k = prev.get(k)) out.push(graph.nodes.get(k));
        return out.reverse();
      }
      q.push(m);
    }
  }
  return null;
}

/** The room under a pixel, if any. */
export function roomAt(px, py) {
  return PLAN.find(({ rect: [x, y, w, h] }) => px >= x && px < x + w && py >= y && py < y + h) || null;
}
