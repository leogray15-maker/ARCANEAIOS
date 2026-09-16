/**
 * Every sprite matrix is a rectangle of its body's size, every head kit row
 * is 12 wide, and every agent composes without an unknown slot.
 */
import { AGENTS } from '@arcane/config';
import { BODIES, CELS, validateBody, validateKits, composeFrame, paletteFor } from '../src/render/sprites.js';

const problems = [
  ...validateBody('crew', BODIES.crew.body, 16, 20),
  ...validateBody('arcane', BODIES.arcane.body, 20, 26),
  ...validateKits(),
];
let frames = 0;
for (const a of AGENTS) {
  const pal = paletteFor(a);
  for (const facing of ['front', 'back', 'side']) for (const cel of CELS) {
    const rows = composeFrame(a, facing, cel);
    const { w, h } = a.kind === 'arcane' ? BODIES.arcane : BODIES.crew;
    if (rows.length !== h) problems.push(`${a.name} ${facing}/${cel}: ${rows.length} rows`);
    rows.forEach((r, i) => {
      if (r.length !== w) problems.push(`${a.name} ${facing}/${cel} row ${i}: ${r.length} wide`);
      for (const ch of r) if (ch !== '.' && !pal[ch]) problems.push(`${a.name} ${facing}/${cel} row ${i}: unknown slot "${ch}"`);
    });
    frames++;
  }
}
if (problems.length) { console.error(`✗ sprites: ${problems.length} problems`); for (const p of problems) console.error('  · ' + p); process.exit(1); }
console.log(`✓ sprites: ${AGENTS.length} agents × ${CELS.length * 3} frames = ${frames} matrices valid (crew 16×20, ARCANE 20×26)`);
