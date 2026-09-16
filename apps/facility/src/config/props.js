/**
 * What is in each room, and where.
 *
 * Coordinates are room-local pixels: the room is 204x114 with a 4px wall;
 * the services strip (pipes, lights, the sign plate) takes the top ~28px,
 * so the usable interior runs x 6..198, y 30..110. Every placement is
 * [type, x, y, w, h, opts]. The door is mid-height on the side named in
 * the floor plan, so that side is kept clear between y 44 and 70.
 *
 * Each room also names a `station` — where the resident stands and which
 * way they face — and a `walk` rect where crew drift so nobody wanders
 * into a cold store. Fourteen to twenty-four props a room, three sizes:
 * an anchor or two, a handful of medium pieces, then the small detail
 * that makes it look used.
 */

const P = (type, x, y, w, h, opts = {}) => ({ type, x, y, w, h, opts });

export const ROOM_PROPS = {
  /* ============ C1 · PRODUCTION (doors on the right) ============ */
  apothecary: {
    props: [
      P('coldstore', 8, 28, 26, 46), P('vialrack', 40, 30, 40, 22, { tint: 'clear' }), P('vialrack', 84, 30, 40, 22, { tint: 'amber' }),
      P('instrument', 130, 32, 34, 24), P('shelf', 170, 28, 24, 14, { rows: 1 }), P('pipe', 166, 58, 5, 12),
      P('packbench', 40, 68, 60, 18), P('boxes', 106, 70, 18, 14), P('desk', 132, 68, 38, 14, { tone: 'steel', items: ['terminal', 'vial', 'papers'] }),
      P('barrel', 10, 82, 12, 16, { colour: '#3d4656', mark: '#56c9f0' }), P('barrel', 24, 88, 12, 16, { colour: '#3d4656' }),
      P('crate', 150, 92, 16, 14), P('boxes', 172, 94, 18, 12), P('vent', 176, 30, 16, 8), P('scales', 108, 56, 12, 8),
    ],
    station: { x: 70, y: 98, face: 'back' }, walk: [110, 88, 40, 16],
  },
  vitals: {
    props: [
      P('cardwall', 8, 28, 70, 30), P('screen', 84, 30, 30, 18, { colour: 'vital' }), P('scales', 150, 36, 14, 10), P('cabinet', 172, 28, 20, 14),
      P('desk', 84, 62, 44, 16, { tone: 'steel', items: ['terminal', 'papers', 'mug'], accent: '#3ecf8e' }), P('chair', 100, 80, 10, 10),
      P('sofa', 10, 70, 40, 16, { colour: '#2f6a4e' }), P('plant', 56, 76, 10, 16), P('plant', 140, 30, 10, 16),
      P('boxes', 136, 90, 18, 12), P('rug', 60, 96, 50, 10, { colour: '#22403a' }), P('crate', 172, 94, 16, 12), P('locker', 132, 62, 30, 20, { colour: '#3ecf8e' }),
    ],
    station: { x: 106, y: 98, face: 'back' }, walk: [10, 90, 40, 14],
  },
  forge: {
    props: [
      P('servers', 8, 28, 24, 42), P('workbench', 40, 30, 60, 26, { device: true }), P('board', 110, 30, 44, 20, { kind: 'white' }), P('pipe', 162, 30, 5, 14), P('vent', 172, 30, 16, 8),
      P('desk', 110, 66, 44, 14, { tone: 'steel', items: ['terminal', 'papers'] }), P('chair', 126, 84, 10, 10),
      P('crate', 10, 78, 16, 14), P('crate', 28, 84, 16, 14), P('barrel', 48, 90, 12, 16, { colour: '#4a5060', mark: '#e8b64c' }),
      P('boxes', 150, 92, 20, 12), P('locker', 40, 62, 34, 20, { colour: '#56c9f0' }), P('kettlebell', 172, 96, 10, 10), P('cabinet', 80, 62, 18, 22),
    ],
    station: { x: 74, y: 100, face: 'back' }, walk: [110, 92, 34, 14],
  },
  market: {
    props: [
      P('productshelf', 8, 28, 50, 24), P('productshelf', 62, 28, 50, 24), P('screen', 120, 30, 30, 18, { colour: 'rose' }), P('plant', 180, 28, 10, 14),
      P('till', 30, 68, 70, 16), P('rope', 120, 68, 50, 8), P('boxes', 8, 88, 20, 14), P('crate', 150, 92, 16, 14),
      P('cabinet', 156, 30, 18, 22, { tone: 'wood' }), P('rug', 110, 90, 40, 12, { colour: '#3a2436' }), P('boxes', 172, 94, 18, 12), P('plant', 106, 78, 10, 16),
    ],
    station: { x: 64, y: 66, face: 'front' }, walk: [110, 88, 40, 14],
  },
  beacon: {
    props: [
      P('mast', 10, 26, 22, 42), P('screen', 40, 30, 26, 18, { colour: 'flare' }), P('screen', 68, 30, 26, 18, { colour: 'cyan' }), P('screen', 96, 30, 26, 18, { colour: 'arcane' }),
      P('board', 130, 30, 40, 24, { kind: 'pins' }), P('vent', 176, 30, 16, 8),
      P('desk', 46, 66, 60, 16, { tone: 'steel', items: ['terminal', 'terminal', 'mug'], accent: '#e8b64c' }), P('chair', 70, 84, 10, 10),
      P('radio', 120, 66, 24, 16), P('cabinet', 150, 66, 18, 22), P('crate', 10, 90, 16, 14), P('rug', 100, 96, 60, 10, { colour: '#3a3020' }), P('bookstack', 30, 92, 10, 10),
    ],
    station: { x: 76, y: 100, face: 'back' }, walk: [110, 88, 40, 14],
  },

  /* ============ C2 · COMMAND (doors on the left) ============ */
  bridge: {
    props: [
      P('bigscreen', 40, 28, 40, 24, { colour: 'arcane' }), P('bigscreen', 84, 28, 44, 24, { colour: 'arcane', map: true }), P('bigscreen', 132, 28, 40, 24, { colour: 'cyan' }),
      P('board', 176, 28, 18, 30, { kind: 'doctrine' }), P('pipe', 8, 30, 5, 12),
      P('commandtable', 60, 62, 80, 26), P('chair', 44, 70, 10, 10), P('chair', 146, 70, 10, 10), P('chair', 96, 92, 12, 12, { tone: 'wood' }),
      P('desk', 150, 90, 30, 12, { tone: 'steel', items: ['terminal'] }), P('plant', 186, 92, 10, 16), P('cabinet', 176, 62, 18, 22), P('rug', 40, 96, 40, 10, { colour: '#2a2440' }),
    ],
    station: { x: 100, y: 88, face: 'back' }, walk: [40, 88, 40, 16],
  },
  warroom: {
    props: [
      P('board', 40, 28, 90, 28, { kind: 'pins', strings: true }), P('screen', 140, 30, 30, 18, { colour: 'arcane' }), P('maprack', 176, 28, 18, 26), P('pipe', 8, 30, 5, 12),
      P('table', 90, 68, 40, 24, { tone: 'wood', items: ['papers', 'papers', 'mug'] }), P('chair', 78, 72, 10, 10), P('chair', 134, 72, 10, 10), P('chair', 96, 94, 10, 10), P('chair', 114, 94, 10, 10),
      P('cabinet', 176, 64, 18, 22), P('lamp', 44, 70, 8, 26), P('crate', 44, 98, 14, 12), P('bookstack', 60, 96, 10, 12), P('plant', 176, 92, 10, 16),
    ],
    station: { x: 110, y: 62, face: 'front' }, walk: [150, 88, 40, 16],
  },
  council: {
    props: [
      P('board', 50, 28, 14, 18, { kind: 'banner', colour: 'gold' }), P('board', 150, 28, 14, 18, { kind: 'banner', colour: 'arcane' }), P('pipe', 8, 30, 5, 12),
      P('council', 46, 52, 120, 28), P('plant', 180, 28, 10, 16), P('plant', 180, 92, 10, 16), P('rug', 40, 86, 130, 20, { colour: '#3a2e1c' }),
      P('lectern', 100, 30, 14, 18), P('cabinet', 176, 60, 18, 22, { tone: 'wood' }), P('candle', 70, 34, 4, 8), P('candle', 136, 34, 4, 8), P('bookstack', 176, 46, 12, 10), P('maprack', 40, 92, 16, 14),
    ],
    station: { x: 106, y: 100, face: 'back' }, walk: [40, 92, 30, 12],
  },
  vault: {
    props: [
      P('safe', 140, 28, 54, 50), P('cabinet', 40, 30, 20, 26), P('cabinet', 62, 30, 20, 26), P('pipe', 8, 30, 5, 12), P('screen', 86, 30, 24, 16, { colour: 'gold' }),
      P('desk', 44, 66, 50, 18, { tone: 'wood', items: ['ledger', 'lamp', 'papers'] }), P('chair', 64, 86, 10, 10, { tone: 'wood' }),
      P('coins', 104, 72, 12, 10), P('coins', 118, 78, 12, 10), P('coins', 104, 86, 12, 10), P('crate', 150, 90, 20, 14), P('crate', 174, 94, 16, 12), P('barrel', 116, 30, 12, 16, { colour: '#4a4030', mark: '#d9a441' }),
    ],
    station: { x: 70, y: 100, face: 'back' }, walk: [110, 96, 30, 12],
  },
  scriptorium: {
    props: [
      P('shelf', 40, 28, 40, 28), P('shelf', 84, 28, 40, 28), P('window', 140, 28, 30, 22, { kind: 'warm' }), P('lamp', 180, 28, 8, 26), P('pipe', 8, 30, 5, 12),
      P('lectern', 150, 62, 16, 22), P('desk', 44, 66, 50, 18, { tone: 'wood', items: ['candle', 'papers', 'quill'] }), P('chair', 64, 86, 10, 10, { tone: 'wood' }),
      P('bookstack', 104, 70, 12, 10), P('bookstack', 104, 84, 12, 12), P('rug', 120, 92, 50, 12, { colour: '#3a2020' }), P('crate', 176, 90, 16, 14), P('bookstack', 176, 62, 12, 12),
    ],
    station: { x: 70, y: 100, face: 'back' }, walk: [130, 92, 40, 12],
  },

  /* ============ C3 · KNOWLEDGE (doors on the right) ============ */
  intel: {
    props: [
      P('corkboard', 8, 28, 70, 30), P('radio', 84, 30, 40, 24), P('screen', 130, 30, 18, 14, { colour: 'arcane' }), P('screen', 150, 30, 18, 14, { colour: 'arcane' }), P('vent', 176, 30, 16, 8),
      P('desk', 84, 66, 44, 16, { tone: 'steel', items: ['terminal', 'papers'] }), P('chair', 100, 84, 10, 10),
      P('cabinet', 8, 66, 18, 24), P('cabinet', 28, 66, 18, 24), P('maprack', 140, 66, 18, 22), P('crate', 10, 94, 16, 12), P('bookstack', 52, 74, 12, 12), P('boxes', 160, 92, 18, 12),
    ],
    station: { x: 106, y: 98, face: 'back' }, walk: [136, 92, 30, 12],
  },
  observatory: {
    props: [
      P('window', 60, 24, 80, 28, { kind: 'stars' }), P('radio', 8, 30, 40, 22), P('ladder', 150, 26, 12, 34), P('plant', 184, 28, 10, 14),
      P('telescope', 90, 56, 30, 30), P('desk', 8, 64, 40, 16, { tone: 'steel', items: ['terminal', 'mug'], accent: '#56c9f0' }), P('chair', 24, 82, 10, 10),
      P('rug', 60, 96, 70, 10, { colour: '#1c2a3a' }), P('crate', 150, 92, 16, 12), P('bookstack', 10, 96, 12, 12), P('cabinet', 50, 30, 8, 22), P('bookstack', 130, 84, 12, 10), P('boxes', 168, 94, 18, 12),
    ],
    station: { x: 110, y: 98, face: 'back' }, walk: [136, 70, 30, 14],
  },
  dealroom: {
    props: [
      P('window', 8, 28, 34, 22, { kind: 'warm' }), P('board', 50, 28, 50, 22, { kind: 'white' }), P('plant', 106, 30, 10, 16), P('cabinet', 120, 30, 20, 24, { tone: 'wood' }), P('lamp', 150, 28, 8, 26),
      P('table', 70, 60, 44, 24, { tone: 'wood', items: ['contract', 'coffee', 'coffee'] }), P('chair', 54, 66, 10, 10, { tone: 'wood' }), P('chair', 120, 66, 10, 10, { tone: 'wood' }),
      P('sofa', 8, 62, 36, 14, { colour: '#6e4a2a' }), P('rug', 60, 90, 60, 14, { colour: '#3a2a20' }), P('crate', 150, 94, 14, 12), P('bookstack', 10, 90, 12, 12),
    ],
    station: { x: 92, y: 98, face: 'back' }, walk: [136, 70, 26, 14],
  },
  archives: {
    props: [
      P('shelf', 8, 26, 34, 34), P('shelf', 44, 26, 34, 34), P('shelf', 80, 26, 34, 34), P('shelf', 116, 26, 34, 34), P('ladder', 150, 26, 12, 34), P('lamp', 184, 28, 8, 16),
      P('desk', 50, 68, 60, 18, { tone: 'wood', items: ['lamp', 'papers', 'bookstack'] }), P('chair', 60, 88, 10, 10, { tone: 'wood' }), P('chair', 90, 88, 10, 10, { tone: 'wood' }),
      P('bookstack', 10, 70, 14, 12), P('bookstack', 26, 74, 14, 12), P('bookstack', 10, 90, 14, 12), P('shelf', 120, 68, 40, 16, { rows: 1 }), P('rug', 44, 100, 80, 8, { colour: '#1c2a3a' }), P('bookstack', 176, 92, 12, 12),
    ],
    station: { x: 118, y: 96, face: 'left' }, walk: [140, 90, 30, 14],
  },
  lounge: {
    props: [
      P('window', 60, 26, 60, 24, { kind: 'warm' }), P('plant', 8, 30, 12, 20), P('plant', 150, 30, 12, 20), P('lamp', 128, 28, 8, 26), P('shelf', 8, 60, 24, 22, { rows: 2 }),
      P('sofa', 40, 64, 44, 16, { colour: '#5a3f6e' }), P('sofa', 100, 64, 44, 16, { colour: '#5a3f6e' }), P('table', 76, 84, 30, 12, { tone: 'wood', items: ['mug', 'coffee'] }),
      P('rug', 40, 98, 100, 10, { colour: '#2a3a2a' }), P('cabinet', 150, 86, 18, 20, { tone: 'wood' }), P('bookstack', 8, 90, 12, 12), P('kettlebell', 176, 92, 10, 10),
    ],
    station: { x: 60, y: 98, face: 'front' }, walk: [8, 92, 26, 12],
  },

  /* ============ C4 · NETWORK & LIFE (doors on the left) ============ */
  garage: {
    props: [
      P('workbench', 40, 28, 60, 24, { device: true }), P('lift', 110, 40, 50, 46), P('board', 170, 28, 26, 26, { kind: 'white' }), P('pipe', 8, 30, 5, 12),
      P('servers', 40, 62, 22, 34), P('crate', 70, 70, 16, 14), P('crate', 88, 74, 16, 14), P('boxes', 176, 62, 18, 14), P('barrel', 170, 92, 12, 14, { colour: '#4a5060', mark: '#a98bff' }),
      P('kettlebell', 66, 96, 10, 10), P('cabinet', 176, 80, 18, 12), P('locker', 104, 28, 28, 16, { colour: '#a98bff' }),
    ],
    station: { x: 92, y: 100, face: 'back' }, walk: [40, 98, 26, 12],
  },
  control: {
    props: [
      P('switchwall', 40, 28, 100, 30), P('lever', 150, 30, 20, 28), P('screen', 176, 28, 18, 14, { colour: 'breach' }), P('screen', 176, 44, 18, 14, { colour: 'ash' }), P('pipe', 8, 30, 5, 12),
      P('desk', 60, 66, 44, 16, { tone: 'steel', items: ['terminal', 'papers'] }), P('chair', 76, 84, 10, 10),
      P('cabinet', 150, 66, 18, 22), P('cabinet', 170, 66, 18, 22), P('rope', 40, 92, 40, 8), P('crate', 120, 94, 14, 12), P('locker', 110, 66, 30, 20, { colour: '#f26d6d' }), P('boxes', 170, 94, 18, 12),
    ],
    station: { x: 82, y: 98, face: 'back' }, walk: [40, 100, 30, 10],
  },
  inventor: {
    props: [
      P('board', 40, 28, 50, 24, { kind: 'white' }), P('lamp', 94, 28, 8, 24), P('shelf', 156, 28, 38, 26), P('pipe', 8, 30, 5, 12), P('screen', 108, 30, 22, 14, { colour: 'vital' }),
      P('workbench', 40, 60, 50, 22, { device: true }), P('blueprint', 96, 60, 50, 22), P('crate', 150, 66, 16, 14), P('crate', 168, 70, 16, 14),
      P('bookstack', 40, 90, 12, 12), P('barrel', 156, 92, 12, 14, { colour: '#4a4a3a', mark: '#3ecf8e' }), P('plant', 186, 92, 10, 16), P('boxes', 100, 92, 18, 12), P('kettlebell', 56, 96, 10, 10),
    ],
    station: { x: 66, y: 100, face: 'back' }, walk: [122, 92, 26, 12],
  },
  records: {
    props: [
      P('cabinet', 40, 28, 18, 28), P('cabinet', 60, 28, 18, 28), P('cabinet', 80, 28, 18, 28), P('cabinet', 100, 28, 18, 28), P('cabinet', 120, 28, 18, 28), P('maprack', 144, 28, 20, 28), P('cabinet', 170, 28, 24, 16, { tone: 'wood' }), P('pipe', 8, 30, 5, 12),
      P('desk', 60, 64, 50, 18, { tone: 'wood', items: ['lamp', 'ledger', 'papers'] }), P('chair', 80, 84, 10, 10, { tone: 'wood' }),
      P('bookstack', 120, 70, 12, 12), P('bookstack', 134, 76, 12, 12), P('crate', 150, 90, 16, 14), P('crate', 170, 94, 16, 14), P('rug', 40, 98, 70, 8, { colour: '#3a2e1c' }), P('boxes', 150, 66, 18, 12),
    ],
    station: { x: 86, y: 98, face: 'back' }, walk: [118, 92, 26, 12],
  },
  sanctum: {
    props: [
      P('window', 120, 26, 50, 24, { kind: 'dawn' }), P('bed', 40, 30, 50, 24, { colour: '#3d6b4f' }), P('journal', 100, 34, 16, 12), P('plant', 176, 28, 12, 20), P('pipe', 8, 30, 5, 12),
      P('shelf', 40, 62, 30, 20, { rows: 2 }), P('lamp', 96, 60, 8, 26), P('rug', 120, 66, 60, 20, { colour: '#2a3a2a' }), P('kettlebell', 140, 64, 10, 10), P('kettlebell', 152, 66, 10, 10),
      P('chair', 80, 92, 10, 10, { tone: 'wood' }), P('crate', 40, 96, 14, 12), P('candle', 110, 90, 4, 8), P('bookstack', 176, 92, 12, 12),
    ],
    station: { x: 150, y: 100, face: 'back' }, walk: [60, 98, 30, 10],
  },
};
