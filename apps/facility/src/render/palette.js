/**
 * The building's palette. Desaturated on purpose: the agents' identity
 * colours and the accent lights carry the scene. Mirrors docs/SPRITES.md.
 */
export const PX = {
  space: '#05050a', far: '#0a0a13', mid: '#0e0e1a', near: '#141422',
  hullDark: '#0f0f18', hull: '#171722', hullLit: '#242433',
  wall: '#2a2a3c', wallTop: '#3e3e58', wallLip: '#4e4e6c', wallDark: '#14141e',
  floor: '#13131d', floorAlt: '#16162a', grate: '#191926', grateLine: '#1f1f30',
  ink: '#ecebf5', ash: '#7e7c94', faint: '#4a4860', steel: '#5a6070', rust: '#8a5a3a',
  wood: '#6b4a32', woodLt: '#8a6644',
  arcane: '#8b5cf6', arcaneLt: '#a98bff', cyan: '#56c9f0', vital: '#3ecf8e',
  flare: '#e8b64c', gold: '#d9a441', rose: '#e0609a', breach: '#f44d52',
};

/** Accent id → colour, so config can say `accent: 'flare'` and never carry a hex. */
export const accent = (id) => PX[id] || PX.arcane;
