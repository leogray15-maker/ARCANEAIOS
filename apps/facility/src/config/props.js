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
      // back wall: the storage bank (cold, cryo, reagent), solvent and standards racks, systems panel
      P('coldstore', 8, 26, 22, 44, { kind: 'cold', label: 'COLD -80°C' }), P('coldstore', 32, 26, 20, 44, { kind: 'cryo', label: 'CRYO' }), P('coldstore', 54, 26, 20, 44, { kind: 'reagent', label: 'REAGENT' }),
      P('vialrack', 78, 30, 36, 24, { tint: 'blue', label: 'SOLVENTS' }), P('vialrack', 116, 30, 36, 24, { tint: 'green', label: 'STANDARDS' }),
      P('statuspanel', 156, 30, 18, 12, { colour: 'cyan', label: 'SYSTEMS' }), P('sign', 176, 22, 18, 6, { colour: 'arcane' }), P('clock', 120, 22, 7, 7), P('vent', 176, 32, 14, 8), P('extinguisher', 194, 30, 5, 12),
      // the working line: weigh, then certify — the floor between it and the bench is the walkway
      P('balance', 78, 60, 22, 16, { label: 'BALANCE' }), P('coa', 104, 58, 42, 24, { label: 'COA STATION' }), P('stool', 64, 70, 8, 8), P('cabletray', 8, 76, 60, 4),
      // the front bench: packing at the door end, fractions, then the HPLC in its own bay
      P('packbench', 8, 84, 56, 20, { label: 'PACKING' }), P('fraction', 68, 86, 32, 18, { label: 'FRACTIONS' }), P('instrument', 104, 84, 44, 26, { label: 'HPLC' }),
      P('boxes', 152, 74, 18, 12), P('wastebin', 154, 92, 12, 14, { label: 'WASTE' }), P('grate', 68, 106, 16, 5),
    ],
    station: { x: 36, y: 108, face: 'back' }, walk: [150, 58, 22, 12],
  },
  vitals: {
    props: [
      P('cardwall', 8, 28, 70, 30), P('healthdash', 84, 30, 30, 18), P('wallscreen', 118, 30, 26, 14, { colour: 'vital' }), P('scales', 150, 36, 14, 10), P('cabinet', 172, 28, 20, 14),
      P('sign', 150, 22, 20, 6, { colour: 'vital' }), P('clock', 120, 22, 7, 7), P('cable', 84, 50, 60, 4),
      P('desk', 84, 62, 44, 16, { tone: 'steel', items: ['terminal', 'papers', 'mug'], accent: '#3ecf8e' }), P('chair', 100, 80, 10, 10), P('stool', 130, 82, 8, 8), P('locker', 132, 62, 30, 20, { colour: '#3ecf8e' }),
      P('sofa', 10, 70, 40, 16, { colour: '#2f6a4e' }), P('plant', 56, 76, 10, 16), P('plant', 140, 30, 10, 16),
      P('boxes', 136, 90, 18, 12), P('rug', 60, 96, 50, 10, { colour: '#22403a' }), P('crate', 172, 94, 16, 12), P('bin', 120, 94, 8, 10),
    ],
    station: { x: 106, y: 98, face: 'back' }, walk: [10, 90, 40, 14],
  },
  forge: {
    props: [
      // back wall: the hearth throws the light; servers, the tool wall, the build monitor
      P('hearth', 8, 24, 34, 30), P('toolwall', 48, 26, 56, 14), P('workbench', 48, 44, 56, 16, { device: true }), P('buildmonitor', 112, 30, 40, 20), P('servers', 156, 28, 20, 14), P('vent', 130, 22, 16, 6),
      P('sign', 108, 22, 18, 6, { colour: 'cyan' }), P('cable', 48, 62, 60, 4), P('extinguisher', 194, 30, 5, 12), P('hazard', 178, 24, 14, 4),
      // middle: the anvil on its stump, the printer, a desk with the terminal
      P('anvil', 14, 66, 16, 14), P('printer3d', 36, 64, 20, 24), P('desk', 110, 66, 44, 14, { tone: 'steel', items: ['terminal', 'keyboard'] }), P('chair', 126, 84, 10, 10), P('locker', 64, 66, 30, 20, { colour: '#56c9f0' }),
      // front: crates, a barrel, boxes, a kettlebell, the bin
      P('crate', 8, 90, 16, 14), P('crate', 26, 94, 14, 12), P('barrel', 48, 92, 12, 16, { colour: '#4a5060', mark: '#e8b64c' }), P('boxes', 150, 92, 20, 12), P('kettlebell', 172, 96, 10, 10), P('bin', 100, 94, 8, 10),
    ],
    station: { x: 76, y: 100, face: 'back' }, walk: [110, 92, 34, 14],
  },
  market: {
    props: [
      // back wall: product shelves, the order board, the funnel, a neon sign and string lights
      P('productshelf', 8, 28, 46, 24), P('productshelf', 58, 28, 46, 24), P('orderboard', 110, 30, 30, 22), P('neonsign', 144, 26, 26, 10, { colour: 'rose' }), P('funnel', 146, 40, 20, 14),
      P('clock', 176, 22, 7, 7), P('stringlights', 8, 54, 130, 5), P('sign', 108, 22, 18, 6, { colour: 'rose' }),
      // middle: the stall, the till, the rope line
      P('stall', 8, 60, 60, 30, { colour: 'rose' }), P('till', 80, 70, 50, 14), P('rope', 140, 70, 40, 8), P('plant', 184, 74, 10, 16),
      // front: parcels waiting for dispatch, boxes, the rug, the stool
      P('parcels', 8, 96, 30, 12), P('parcels', 150, 94, 20, 14), P('rug', 90, 90, 44, 12, { colour: '#3a2436' }), P('boxes', 176, 96, 18, 12), P('stool', 84, 92, 8, 8), P('bin', 44, 98, 8, 10),
    ],
    station: { x: 104, y: 66, face: 'front' }, walk: [90, 100, 44, 8],
  },
  beacon: {
    props: [
      // back wall: the screen wall (content queue, signal, transmission map) and the post queue and room log
      P('screenwall', 8, 30, 118, 28, { colour: 'cyan', panels: ['queue', 'wave', 'map'], labels: ['CONTENT QUEUE', 'SIGNAL', 'TRANSMISSION'] }),
      P('screenwall', 128, 30, 46, 28, { colour: 'flare', panels: ['post', 'log'], labels: ['POST QUEUE', 'ROOM LOG'] }),
      P('statuspanel', 176, 26, 18, 12, { colour: 'cyan', label: 'STATUS' }), P('sign', 128, 22, 20, 6, { colour: 'flare' }), P('clock', 152, 22, 7, 7), P('extinguisher', 194, 30, 5, 12),
      P('cable', 36, 58, 100, 4),
      // middle: the signal desk, two equipment racks
      P('rack', 8, 60, 24, 34, { colour: 'flare', label: 'RACK A' }), P('signaldesk', 36, 62, 100, 26, { accent: '#e8b64c', label: 'SIGNAL DESK' }), P('rack', 140, 60, 22, 30, { colour: 'flare', label: 'UPLINK' }),
      P('chair', 80, 90, 10, 10),
      // front: the mast, a camera, cable tray, hazard mat, stock
      P('mast', 176, 74, 20, 36, { label: 'BEACON' }), P('camera', 150, 92, 12, 18, { label: 'CAM' }), P('cabletray', 36, 100, 40, 5), P('floormat', 108, 96, 24, 10), P('bin', 100, 96, 8, 10), P('boxes', 8, 98, 18, 12), P('stool', 140, 92, 8, 8),
    ],
    station: { x: 86, y: 100, face: 'back' }, walk: [36, 106, 40, 5],
  },

  /* ============ C2 · COMMAND (doors on the left) ============ */
  bridge: {
    props: [
      // back wall: three command screens (the middle one a live map), the doctrine board, sign, clock
      P('bigscreen', 40, 28, 40, 24, { colour: 'arcane' }), P('bigscreen', 84, 28, 44, 24, { colour: 'arcane', map: true }), P('bigscreen', 132, 28, 40, 24, { colour: 'cyan' }),
      P('board', 176, 28, 18, 30, { kind: 'doctrine' }), P('sign', 150, 22, 20, 6, { colour: 'arcane' }), P('clock', 60, 22, 7, 7), P('pipe', 8, 30, 5, 12), P('extinguisher', 194, 30, 5, 12),
      P('cable', 40, 54, 130, 4),
      // middle: the command table with a hologram beside it, seats, a terminal desk
      P('commandtable', 60, 62, 80, 26), P('holo', 146, 64, 16, 18, { colour: 'arcane' }), P('chair', 44, 70, 10, 10), P('stool', 44, 84, 8, 8), P('chair', 138, 88, 10, 10),
      P('cabinet', 176, 62, 18, 22), P('bin', 140, 100, 8, 10),
      // front: the captain's chair, a terminal desk, a rug, a plant
      P('chair', 96, 92, 12, 12, { tone: 'wood' }), P('desk', 150, 92, 36, 14, { tone: 'steel', items: ['terminal', 'keyboard'] }), P('plant', 188, 90, 8, 14),
      P('rug', 40, 96, 40, 10, { colour: '#2a2440' }), P('bookstack', 30, 96, 10, 12),
    ],
    station: { x: 100, y: 100, face: 'back' }, walk: [40, 88, 40, 16],
  },
  warroom: {
    props: [
      P('sign', 176, 22, 18, 6, { colour: 'arcane' }), P('bin', 30, 92, 8, 10), P('cable', 40, 58, 90, 4),
      P('board', 40, 28, 90, 28, { kind: 'pins', strings: true }), P('screen', 140, 30, 30, 18, { colour: 'arcane' }), P('maprack', 176, 28, 18, 26), P('pipe', 8, 30, 5, 12),
      P('table', 90, 68, 40, 24, { tone: 'wood', items: ['papers', 'papers', 'mug'] }), P('chair', 78, 72, 10, 10), P('chair', 134, 72, 10, 10), P('chair', 96, 94, 10, 10), P('chair', 114, 94, 10, 10),
      P('cabinet', 176, 64, 18, 22), P('lamp', 44, 70, 8, 26), P('crate', 44, 98, 14, 12), P('bookstack', 60, 96, 10, 12), P('plant', 176, 92, 10, 16),
    ],
    station: { x: 110, y: 62, face: 'front' }, walk: [150, 88, 40, 16],
  },
  council: {
    props: [
      P('sign', 176, 22, 18, 6, { colour: 'gold' }), P('cable', 40, 48, 60, 4), P('clock', 120, 22, 7, 7),
      P('board', 50, 28, 14, 18, { kind: 'banner', colour: 'gold' }), P('board', 150, 28, 14, 18, { kind: 'banner', colour: 'arcane' }), P('pipe', 8, 30, 5, 12),
      P('council', 46, 52, 120, 28), P('plant', 180, 28, 10, 16), P('plant', 180, 92, 10, 16), P('rug', 40, 86, 130, 20, { colour: '#3a2e1c' }),
      P('lectern', 100, 30, 14, 18), P('cabinet', 176, 60, 18, 22, { tone: 'wood' }), P('candle', 70, 34, 4, 8), P('candle', 136, 34, 4, 8), P('bookstack', 176, 46, 12, 10), P('maprack', 34, 26, 16, 20),
    ],
    station: { x: 106, y: 100, face: 'back' }, walk: [40, 92, 30, 12],
  },
  vault: {
    props: [
      // back wall: the safe door, two locked cabinets, the cash display, a gold feed, sign, clock
      P('safe', 140, 28, 54, 50), P('lockedcabinet', 40, 30, 20, 26), P('lockedcabinet', 62, 30, 20, 26), P('cashdisplay', 86, 30, 24, 16), P('wallscreen', 112, 30, 26, 14, { colour: 'gold' }),
      P('sign', 150, 22, 20, 6, { colour: 'gold' }), P('clock', 176, 22, 7, 7), P('pipe', 8, 30, 5, 12), P('extinguisher', 194, 30, 5, 12), P('cable', 40, 58, 60, 4),
      // middle: the ledger desk with a secure terminal, the counting corner
      P('desk', 40, 70, 50, 18, { tone: 'wood', items: ['secure', 'ledger', 'lamp'] }), P('chair', 58, 90, 10, 10, { tone: 'wood' }), P('rug', 34, 92, 62, 10, { colour: '#3a2e1c' }),
      // the bullion stands in a line in front of the safe, the way it is counted
      P('coins', 104, 84, 12, 10), P('coins', 120, 84, 12, 10), P('coins', 136, 84, 12, 10), P('bookstack', 104, 68, 12, 10), P('barrel', 122, 64, 12, 14, { colour: '#4a4030', mark: '#d9a441' }),
      // front wall: the strongboxes and the deposit cabinet, squared up
      P('crate', 152, 92, 20, 14), P('crate', 174, 92, 18, 14), P('lockedcabinet', 170, 80, 22, 10),
    ],
    station: { x: 70, y: 100, face: 'back' }, walk: [110, 98, 30, 10],
  },
  scriptorium: {
    props: [
      P('sign', 176, 22, 18, 6, { colour: 'breach' }), P('bin', 96, 96, 8, 10), P('clock', 128, 22, 7, 7),
      P('shelf', 40, 28, 40, 28), P('shelf', 84, 28, 40, 28), P('window', 140, 28, 30, 22, { kind: 'warm' }), P('lamp', 180, 28, 8, 26), P('pipe', 8, 30, 5, 12),
      P('lectern', 150, 62, 16, 22), P('desk', 44, 66, 50, 18, { tone: 'wood', items: ['candle', 'papers', 'quill'] }), P('chair', 64, 86, 10, 10, { tone: 'wood' }),
      P('bookstack', 104, 70, 12, 10), P('bookstack', 104, 84, 12, 12), P('rug', 120, 92, 50, 12, { colour: '#3a2020' }), P('crate', 176, 90, 16, 14), P('bookstack', 176, 62, 12, 12),
    ],
    station: { x: 70, y: 100, face: 'back' }, walk: [130, 92, 40, 12],
  },

  /* ============ ANNEX · THE TRADING FLOOR (door on the right, onto the atrium) ============ */
  trading: {
    props: [
      // back wall: the big chart, the ticker, three session clocks, a gold case
      P('chartscreen', 8, 28, 64, 30, { colour: 'gold', label: 'XAUUSD · 15m' }), P('tickertape', 76, 28, 84, 8, { label: 'TAPE' }), P('sessionclocks', 76, 40, 84, 18, { labels: ['LDN', 'NY', 'ASIA'] }),
      P('goldcase', 164, 26, 30, 16, { label: 'RESERVE' }), P('sign', 126, 22, 20, 6, { colour: 'gold' }), P('clock', 150, 22, 7, 7),
      // middle: the trading desk, the chair, a second desk for the journal
      P('tradingdesk', 30, 66, 96, 26, { label: 'THE DESK' }), P('chair', 72, 94, 10, 10), P('desk', 134, 70, 44, 16, { tone: 'wood', items: ['ledger', 'lamp', 'coffee'], label: 'JOURNAL' }), P('chair', 150, 88, 10, 10, { tone: 'wood' }),
      // front and detail
      P('rack', 8, 64, 18, 30, { colour: 'gold', label: 'FEED' }), P('cable', 30, 58, 100, 4), P('cabletray', 30, 100, 60, 5), P('plant', 186, 92, 10, 16), P('rug', 100, 98, 60, 10, { colour: '#3a2e1c' }),
      P('bin', 120, 94, 8, 10), P('kettlebell', 10, 98, 10, 10), P('bookstack', 176, 72, 12, 10), P('extinguisher', 194, 76, 5, 12), P('floormat', 8, 98, 22, 10),
    ],
    station: { x: 76, y: 104, face: 'back' }, walk: [100, 104, 30, 6],
  },

  /* ============ C3 · KNOWLEDGE (doors on the right) ============ */
  intel: {
    props: [
      P('sign', 150, 22, 20, 6, { colour: 'arcane' }), P('clock', 120, 22, 7, 7), P('cable', 84, 56, 60, 4), P('bin', 70, 96, 8, 10),
      P('corkboard', 8, 28, 70, 30), P('radio', 84, 30, 40, 24), P('screen', 130, 30, 18, 14, { colour: 'arcane' }), P('screen', 150, 30, 18, 14, { colour: 'arcane' }), P('vent', 176, 30, 16, 8),
      P('desk', 84, 66, 44, 16, { tone: 'steel', items: ['terminal', 'papers'] }), P('chair', 100, 84, 10, 10),
      P('cabinet', 8, 66, 18, 24), P('cabinet', 28, 66, 18, 24), P('maprack', 140, 66, 18, 22), P('crate', 10, 94, 16, 12), P('bookstack', 52, 74, 12, 12), P('boxes', 160, 92, 18, 12),
    ],
    station: { x: 106, y: 98, face: 'back' }, walk: [136, 92, 30, 12],
  },
  observatory: {
    props: [
      P('sign', 150, 22, 20, 6, { colour: 'cyan' }), P('bin', 54, 88, 8, 10), P('cable', 8, 54, 40, 4),
      P('window', 60, 24, 80, 28, { kind: 'stars' }), P('radio', 8, 30, 40, 22), P('ladder', 150, 26, 12, 34), P('plant', 184, 28, 10, 14),
      P('telescope', 90, 56, 30, 30), P('desk', 8, 64, 40, 16, { tone: 'steel', items: ['terminal', 'mug'], accent: '#56c9f0' }), P('chair', 24, 82, 10, 10),
      P('rug', 60, 96, 70, 10, { colour: '#1c2a3a' }), P('crate', 150, 92, 16, 12), P('bookstack', 10, 96, 12, 12), P('cabinet', 50, 30, 8, 22), P('bookstack', 130, 84, 12, 10), P('boxes', 168, 94, 18, 12),
    ],
    station: { x: 110, y: 98, face: 'back' }, walk: [136, 70, 30, 14],
  },
  dealroom: {
    props: [
      P('sign', 150, 22, 20, 6, { colour: 'flare' }), P('clock', 120, 22, 7, 7), P('bin', 128, 92, 8, 10),
      P('window', 8, 28, 34, 22, { kind: 'warm' }), P('board', 50, 28, 50, 22, { kind: 'white' }), P('plant', 106, 30, 10, 16), P('cabinet', 120, 30, 20, 24, { tone: 'wood' }), P('lamp', 150, 28, 8, 26),
      P('table', 70, 60, 44, 24, { tone: 'wood', items: ['contract', 'coffee', 'coffee'] }), P('chair', 54, 66, 10, 10, { tone: 'wood' }), P('chair', 120, 66, 10, 10, { tone: 'wood' }),
      P('sofa', 8, 62, 36, 14, { colour: '#6e4a2a' }), P('rug', 60, 90, 60, 14, { colour: '#3a2a20' }), P('crate', 150, 94, 14, 12), P('bookstack', 10, 90, 12, 12),
    ],
    station: { x: 92, y: 98, face: 'back' }, walk: [136, 70, 26, 14],
  },
  archives: {
    props: [
      // back wall: four tall shelves, the ladder, the card catalogue, sign, clock
      P('shelf', 8, 26, 34, 34), P('shelf', 44, 26, 34, 34), P('shelf', 80, 26, 34, 34), P('shelf', 116, 26, 34, 34), P('ladder', 150, 26, 12, 34),
      P('sign', 164, 22, 18, 6, { colour: 'cyan' }), P('clock', 186, 22, 7, 7), P('cardcatalogue', 166, 30, 26, 12),
      // middle: two archive terminals, the reading table, a globe, the reading corner under its lamp
      P('archiveterminal', 8, 64, 14, 28), P('archiveterminal', 24, 64, 14, 28),
      P('desk', 50, 68, 60, 18, { tone: 'wood', items: ['lamp', 'papers', 'bookstack'] }), P('chair', 60, 88, 10, 10, { tone: 'wood' }), P('chair', 90, 88, 10, 10, { tone: 'wood' }),
      P('globe', 116, 66, 12, 20), P('armchair', 168, 78, 18, 16), P('readinglamp', 158, 66, 8, 22), P('shelf', 126, 68, 28, 12, { rows: 1 }),
      // front: the module stacks by the terminals, then the reading rug and the odd ends in a row
      P('bookstack', 10, 96, 14, 12), P('bookstack', 26, 96, 12, 12), P('rug', 44, 96, 80, 10, { colour: '#1c2a3a' }),
      P('plant', 130, 92, 10, 16), P('crate', 146, 94, 16, 12), P('scrolls', 168, 96, 16, 10), P('extinguisher', 194, 76, 5, 12),
    ],
    station: { x: 118, y: 96, face: 'left' }, walk: [100, 92, 30, 10],
  },
  lounge: {
    props: [
      P('sign', 150, 22, 20, 6, { colour: 'vital' }), P('bin', 176, 80, 8, 10), P('clock', 128, 22, 7, 7),
      P('window', 60, 26, 60, 24, { kind: 'warm' }), P('plant', 8, 30, 12, 20), P('plant', 150, 30, 12, 20), P('lamp', 128, 28, 8, 26), P('shelf', 8, 60, 24, 22, { rows: 2 }),
      P('sofa', 40, 64, 44, 16, { colour: '#5a3f6e' }), P('sofa', 100, 64, 44, 16, { colour: '#5a3f6e' }), P('table', 76, 84, 30, 12, { tone: 'wood', items: ['mug', 'coffee'] }),
      P('rug', 40, 98, 100, 10, { colour: '#2a3a2a' }), P('cabinet', 150, 86, 18, 20, { tone: 'wood' }), P('bookstack', 8, 90, 12, 12), P('kettlebell', 176, 92, 10, 10),
    ],
    station: { x: 60, y: 98, face: 'front' }, walk: [8, 92, 26, 12],
  },

  /* ============ C4 · NETWORK & LIFE (doors on the left) ============ */
  garage: {
    props: [
      // back wall: the bench under the tool wall, the parts rack, the job board
      P('sign', 176, 22, 18, 6, { colour: 'arcane' }), P('pipe', 8, 30, 5, 12), P('extinguisher', 194, 30, 5, 12),
      P('toolwall', 38, 26, 54, 12), P('workbench', 38, 40, 54, 18, { device: true }), P('servers', 98, 28, 22, 30),
      P('locker', 126, 28, 26, 16, { colour: '#a98bff' }), P('board', 160, 28, 32, 26, { kind: 'white' }), P('cable', 38, 60, 76, 4),
      // the floor: the car in its bay, the lift back against the right wall
      P('vanquish', 40, 66, 76, 32, { colour: '#7a3fe0' }),
      P('lift', 138, 58, 44, 42),
      P('crate', 8, 92, 16, 14), P('boxes', 122, 86, 18, 12), P('bin', 124, 74, 8, 10), P('kettlebell', 186, 96, 10, 10),
    ],
    station: { x: 128, y: 102, face: 'back' }, walk: [8, 76, 26, 12],
  },
  control: {
    props: [
      P('sign', 176, 22, 18, 6, { colour: 'breach' }), P('clock', 120, 22, 7, 7), P('cable', 40, 60, 100, 4), P('bin', 40, 84, 8, 10),
      P('switchwall', 40, 28, 100, 30), P('lever', 150, 30, 20, 28), P('screen', 176, 28, 18, 14, { colour: 'breach' }), P('screen', 176, 44, 18, 14, { colour: 'ash' }), P('pipe', 8, 30, 5, 12),
      P('desk', 60, 66, 44, 16, { tone: 'steel', items: ['terminal', 'papers'] }), P('chair', 76, 84, 10, 10),
      P('cabinet', 150, 66, 18, 22), P('cabinet', 170, 66, 18, 22), P('rope', 40, 92, 40, 8), P('crate', 120, 94, 14, 12), P('locker', 110, 66, 30, 20, { colour: '#f26d6d' }), P('boxes', 170, 94, 18, 12),
    ],
    station: { x: 82, y: 98, face: 'back' }, walk: [40, 100, 30, 10],
  },
  inventor: {
    props: [
      P('sign', 150, 22, 20, 6, { colour: 'vital' }), P('cable', 40, 54, 50, 4), P('bin', 128, 86, 8, 10),
      P('board', 40, 28, 50, 24, { kind: 'white' }), P('lamp', 94, 28, 8, 24), P('shelf', 156, 28, 38, 26), P('pipe', 8, 30, 5, 12), P('screen', 108, 30, 22, 14, { colour: 'vital' }),
      P('workbench', 40, 60, 50, 22, { device: true }), P('blueprint', 96, 60, 50, 22), P('crate', 150, 66, 16, 14), P('crate', 168, 70, 16, 14),
      P('bookstack', 40, 90, 12, 12), P('barrel', 156, 92, 12, 14, { colour: '#4a4a3a', mark: '#3ecf8e' }), P('plant', 186, 92, 10, 16), P('boxes', 100, 92, 18, 12), P('kettlebell', 56, 96, 10, 10),
    ],
    station: { x: 66, y: 100, face: 'back' }, walk: [122, 92, 26, 12],
  },
  records: {
    props: [
      P('sign', 176, 22, 18, 6, { colour: 'gold' }), P('clock', 120, 22, 7, 7), P('bin', 40, 84, 8, 10),
      P('cabinet', 40, 28, 18, 28), P('cabinet', 60, 28, 18, 28), P('cabinet', 80, 28, 18, 28), P('cabinet', 100, 28, 18, 28), P('cabinet', 120, 28, 18, 28), P('maprack', 144, 28, 20, 28), P('cabinet', 170, 28, 24, 16, { tone: 'wood' }), P('pipe', 8, 30, 5, 12),
      P('desk', 60, 64, 50, 18, { tone: 'wood', items: ['lamp', 'ledger', 'papers'] }), P('chair', 80, 84, 10, 10, { tone: 'wood' }),
      P('bookstack', 120, 70, 12, 12), P('bookstack', 134, 76, 12, 12), P('crate', 150, 90, 16, 14), P('crate', 170, 94, 16, 14), P('rug', 40, 98, 70, 8, { colour: '#3a2e1c' }), P('boxes', 150, 66, 18, 12),
    ],
    station: { x: 86, y: 98, face: 'back' }, walk: [118, 92, 26, 12],
  },
  sanctum: {
    props: [
      P('sign', 176, 22, 18, 6, { colour: 'vital' }), P('bin', 96, 92, 8, 10), P('cable', 100, 50, 20, 4),
      P('window', 120, 26, 50, 24, { kind: 'dawn' }), P('bed', 40, 30, 50, 24, { colour: '#3d6b4f' }), P('journal', 100, 34, 16, 12), P('plant', 176, 28, 12, 20), P('pipe', 8, 30, 5, 12),
      P('shelf', 40, 62, 30, 20, { rows: 2 }), P('lamp', 96, 60, 8, 26), P('rug', 120, 66, 60, 20, { colour: '#2a3a2a' }), P('kettlebell', 140, 64, 10, 10), P('kettlebell', 152, 66, 10, 10),
      P('chair', 80, 92, 10, 10, { tone: 'wood' }), P('crate', 40, 96, 14, 12), P('candle', 110, 90, 4, 8), P('bookstack', 176, 92, 12, 12),
    ],
    station: { x: 150, y: 100, face: 'back' }, walk: [60, 98, 30, 10],
  },
};
