/**
 * The building must be one building: every room reachable from every
 * other, nothing overlapping, everything inside the buffer.
 */
import { PLAN, PW, PH, buildGraph, path, CORR_X, CORR_WIDTH, HALL_Y, HALL_H } from '../src/config/floorplan.js';

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

ok(PLAN.length === 20, `20 rooms placed (got ${PLAN.length})`);
for (const p of PLAN) {
  const [x, y, w, h] = p.rect;
  ok(x >= 0 && y >= 0 && x + w <= PW && y + h <= PH, `${p.id} inside ${PW}x${PH}`);
  const [dx, dy] = p.door;
  ok(dy > y && dy < y + h && (dx === x || dx === x + w), `${p.id} door on a side wall`);
}
for (let i = 0; i < PLAN.length; i++) for (let j = i + 1; j < PLAN.length; j++) {
  const [ax, ay, aw, ah] = PLAN[i].rect, [bx, by, bw, bh] = PLAN[j].rect;
  ok(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay, `${PLAN[i].id} overlaps ${PLAN[j].id}`);
}
for (const p of PLAN) CORR_X.forEach((cx, i) => {
  const [x, , w] = p.rect;
  ok(cx >= x + w || cx + CORR_WIDTH[i] <= x, `${p.id} overlaps corridor ${i}`);
});
// A door's passage must actually reach its corridor.
for (const p of PLAN) { const [px, , pw] = p.passage; ok(pw >= 0 && pw <= 30, `${p.id} passage is ${pw}px`); const edge = p.side === 'right' ? px + pw : px; ok(edge === CORR_X[p.corr] || edge === CORR_X[p.corr] + CORR_WIDTH[p.corr], `${p.id} passage does not meet corridor ${p.corr}`); }
for (const p of PLAN) { const [, y, , h] = p.rect; ok(y + h <= HALL_Y || y >= HALL_Y + HALL_H, `${p.id} overlaps the hall`); }

const g = buildGraph();
let longest = 0, pairs = 0;
for (const a of PLAN) for (const b of PLAN) {
  if (a === b) continue;
  const p = path(g, `d:${a.id}`, `d:${b.id}`);
  ok(p, `no path ${a.id} → ${b.id}`);
  if (p) { longest = Math.max(longest, p.length); pairs++; }
}

if (fails.length) { console.error(`✗ floorplan: ${fails.length} problems`); for (const f of fails) console.error('  · ' + f); process.exit(1); }
console.log(`✓ floorplan: 20 rooms, ${g.nodes.size} nodes, ${pairs} reachable pairs, longest path ${longest} nodes, ${PW}x${PH}, doors meet their corridors`);
