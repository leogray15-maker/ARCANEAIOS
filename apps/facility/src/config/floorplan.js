/**
 * The floor plan — geometry only.
 *
 * What a room *is* comes from @arcane/config. This file says where it sits
 * and how big it is, in a 960x640 pixel space (see docs/SPRITES.md for why
 * that size). Four wings of five rooms, left to right, around three
 * service corridors and a hall that crosses all of them.
 *
 *   margin | W0 | V0 | W1 | V1 | W2 | V2 | W3 | margin
 *
 * W0 doors open right onto V0. W1 and W2 open onto V1 from either side.
 * W3 opens left onto V2. Every corridor runs the full height and meets the
 * hall, so any room can reach any other; `test/floorplan.test.mjs` proves it.
 */
import { WINGS, roomsInWing } from '@arcane/config';

export const PW = 960;
export const PH = 640;

export const MARGIN = 18;
export const ROOM_W = 204;
export const ROOM_H = 114;
export const CORR_W = 36;
export const HALL_H = 36;
export const DOOR_W = 12;
export const WALL = 4;

/** Corridor centre lines, left to right. */
export const VCORR = [0, 1, 2].map((i) => MARGIN + ROOM_W * (i + 1) + CORR_W * i + CORR_W / 2);
/** Wing left edges. */
const WING_X = [0, 1, 2, 3].map((i) => MARGIN + (ROOM_W + CORR_W) * i);

/** The hall sits between rows 1 and 2, so the building has a top and a bottom half. */
const HALL_AFTER_ROW = 1;
export const ROW_Y = [];
{
  let y = MARGIN;
  for (let r = 0; r < 5; r++) {
    ROW_Y.push(y);
    y += ROOM_H;
    if (r === HALL_AFTER_ROW) y += HALL_H;
  }
}
export const HALL_Y = ROW_Y[HALL_AFTER_ROW] + ROOM_H;

/** Which corridor a wing's doors open onto, and on which side of the room. */
const WING_DOOR = [
  { corr: 0, side: 'right' },
  { corr: 1, side: 'left' },
  { corr: 1, side: 'right' },
  { corr: 2, side: 'left' },
];

/**
 * Every room with its rect, door position and the corridor node it joins.
 * `rect` is [x, y, w, h]; `door` is the centre of the doorway on the wall.
 */
export const PLAN = WINGS.flatMap((w, wi) =>
  roomsInWing(w.id).map((room) => {
    const x = WING_X[wi];
    const y = ROW_Y[room.row];
    const { corr, side } = WING_DOOR[wi];
    const doorX = side === 'right' ? x + ROOM_W : x;
    const doorY = y + ROOM_H / 2;
    return { id: room.id, wing: wi, row: room.row, rect: [x, y, ROOM_W, ROOM_H], door: [doorX, doorY], side, corr };
  }),
);

export const PLAN_BY_ID = Object.fromEntries(PLAN.map((p) => [p.id, p]));

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
