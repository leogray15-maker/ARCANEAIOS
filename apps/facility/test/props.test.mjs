/**
 * Every room has props, every prop is a known painter inside the room's
 * interior, the door approach is clear, and the station and walk zone are
 * inside the room. Counts are reported so sparseness is visible.
 */
import { ROOMS } from '@arcane/config';
import { ROOM_PROPS } from '../src/config/props.js';
import { PAINT } from '../src/render/props.js';
import { PLAN_BY_ID, ROOM_W, ROOM_H } from '../src/config/floorplan.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const counts = [];
for (const room of ROOMS) {
  const spec = ROOM_PROPS[room.id];
  ok(spec, `${room.name}: no props`); if (!spec) continue;
  const side = PLAN_BY_ID[room.id].side;
  const doorZone = side === 'right' ? [ROOM_W - 30, 44, 30, 26] : [0, 44, 30, 26];
  for (const p of spec.props) {
    ok(PAINT[p.type], `${room.name}: unknown prop "${p.type}"`);
    ok(p.x >= 4 && p.y >= 22 && p.x + p.w <= ROOM_W - 4 && p.y + p.h <= ROOM_H - 2, `${room.name}: ${p.type} at ${p.x},${p.y} ${p.w}x${p.h} leaves the interior`);
    const [dx, dy, dw, dh] = doorZone;
    const overlaps = p.x < dx + dw && p.x + p.w > dx && p.y < dy + dh && p.y + p.h > dy;
    ok(!overlaps, `${room.name}: ${p.type} at ${p.x},${p.y} blocks the door approach (${side})`);
  }
  ok(spec.props.length >= 12, `${room.name}: only ${spec.props.length} props — sparse`);
  const s = spec.station; ok(s && s.x > 6 && s.x < ROOM_W - 6 && s.y > 40 && s.y < ROOM_H - 2, `${room.name}: station outside the room`);
  ok(['front', 'back', 'left', 'right'].includes(s?.face), `${room.name}: station face invalid`);
  const [wx, wy, ww, wh] = spec.walk; ok(wx >= 4 && wy >= 30 && wx + ww <= ROOM_W - 4 && wy + wh <= ROOM_H - 2, `${room.name}: walk zone outside the room`);
  counts.push([room.name, spec.props.length]);
}
if (fails.length) { console.error(`✗ props: ${fails.length} problems`); for (const f of fails) console.error('  · ' + f); process.exit(1); }
const total = counts.reduce((a, [, n]) => a + n, 0);
console.log(`✓ props: ${total} placements across 20 rooms (min ${Math.min(...counts.map((c) => c[1]))}, max ${Math.max(...counts.map((c) => c[1]))}), all inside, doors clear`);
