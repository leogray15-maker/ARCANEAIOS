/**
 * The sprite sheet: a review page, not part of the facility. Bakes every
 * agent and lays the frames out on the floor colour at 4x so a sprite can
 * be judged at the size it is actually seen.
 */
import { AGENTS } from '@arcane/config';
import { bakeSprites, CELS } from './render/sprites.js';

const SCALE = 4;
const sprites = bakeSprites(AGENTS);
const FACINGS = ['front', 'back', 'right', 'left'];
const cellW = 22, cellH = 30, labelW = 70;
const cols = FACINGS.length * CELS.length;

const cv = document.getElementById('sheet');
cv.width = (labelW + cols * cellW) * SCALE; cv.height = AGENTS.length * cellH * SCALE;
const g = cv.getContext('2d');
g.imageSmoothingEnabled = false;
g.scale(SCALE, SCALE);
g.fillStyle = '#13131d'; g.fillRect(0, 0, cv.width, cv.height);

g.font = '5px ui-monospace, Menlo, monospace'; g.textBaseline = 'top';
AGENTS.forEach((a, row) => {
  const { w, h, frames } = sprites.get(a.id);
  const y = row * cellH;
  if (row % 2) { g.fillStyle = '#16162a'; g.fillRect(0, y, labelW + cols * cellW, cellH); }
  g.fillStyle = a.colour; g.fillRect(2, y + 4, 3, 3);
  g.fillStyle = '#ecebf5'; g.fillText(a.name, 7, y + 3);
  g.fillStyle = '#7e7c94'; g.fillText(a.role.slice(0, 14), 7, y + 10);
  FACINGS.forEach((f, fi) => CELS.forEach((c, ci) => {
    const x = labelW + (fi * CELS.length + ci) * cellW;
    g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(x + (cellW - w) / 2 + 2, y + cellH - 4, w - 4, 2);
    g.drawImage(frames[f][c], x + (cellW - w) / 2, y + cellH - 3 - h);
  }));
});
