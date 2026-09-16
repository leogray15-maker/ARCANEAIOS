/**
 * Pixel sprites.
 *
 * Every agent is composed, not hand-drawn nineteen times: one crew body
 * (12x18) and one commander body (14x22), each in three facings and three
 * walk cels, plus a head kit and a held item per agent. The palette does
 * the rest — on the floor, colour is identity, so the agent's own colour
 * is the main tone and everything else is derived from it.
 *
 * Slots:
 *   .  transparent      o  outline         c  main colour     d  main, shaded
 *   l  main, lit        s  skin            e  eye / visor     h  hair or hat
 *   t  trousers         b  boots           k  accessory dark  a  accessory accent
 *   w  white            g  glove / hand    r  rim light (ARCANE only)
 *
 * Facings: front, back, side (drawn facing right; left is mirrored at bake).
 * Cels: stand, stepA, stepB. Front and back stepB is stepA mirrored, which
 * swaps the arm swing; side has a real stepB. Idle bob is procedural.
 */

/* ============================================================
   CREW — 12 wide x 18 tall
   ============================================================ */

const CREW = {
  front: {
    stand: [
      '....oooo....',
      '...ohhhho...',
      '..ohhhhhho..',
      '..ohhhhhho..',
      '..osssssso..',
      '..osesseso..',
      '..osssssso..',
      '...osssso...',
      '..occcccco..',
      '.olccccccdo.',
      '.olccccccdo.',
      '.olcaacccdo.',
      '.ogccccccgo.',
      '..odccccdo..',
      '..otttttto..',
      '..ottootto..',
      '..obboobbo..',
      '.oooo..oooo.',
    ],
    stepA: [
      '....oooo....',
      '...ohhhho...',
      '..ohhhhhho..',
      '..ohhhhhho..',
      '..osssssso..',
      '..osesseso..',
      '..osssssso..',
      '...osssso...',
      '..occcccco..',
      '.odcccccclo.',
      '.odcccccclo.',
      '.odcaaccclo.',
      '..ogccccgo..',
      '..odccccdo..',
      '..otttttto..',
      '.ottoo.otto.',
      '.obbo..obbo.',
      '.oooo..oooo.',
    ],
  },
  back: {
    stand: [
      '....oooo....',
      '...ohhhho...',
      '..ohhhhhho..',
      '..ohhhhhho..',
      '..ohhhhhho..',
      '..ohhhhhho..',
      '..osssssso..',
      '...osssso...',
      '..occcccco..',
      '.odccccccdo.',
      '.odccccccdo.',
      '.odccccccdo.',
      '.ogccccccgo.',
      '..odccccdo..',
      '..otttttto..',
      '..ottootto..',
      '..obboobbo..',
      '.oooo..oooo.',
    ],
    stepA: [
      '....oooo....',
      '...ohhhho...',
      '..ohhhhhho..',
      '..ohhhhhho..',
      '..ohhhhhho..',
      '..ohhhhhho..',
      '..osssssso..',
      '...osssso...',
      '..occcccco..',
      '.olccccccdo.',
      '.olccccccdo.',
      '.olccccccdo.',
      '..ogccccgo..',
      '..odccccdo..',
      '..otttttto..',
      '.ottoo.otto.',
      '.obbo..obbo.',
      '.oooo..oooo.',
    ],
  },
  side: {
    stand: [
      '....oooo....',
      '...ohhhhho..',
      '..ohhhhhho..',
      '..ohhhhhho..',
      '..ohssssso..',
      '..ohsssseo..',
      '..ohssssso..',
      '...osssso...',
      '..occcccco..',
      '..occccclo..',
      '..occccclo..',
      '..occaaclo..',
      '..occcccgo..',
      '..odccccdo..',
      '..otttttto..',
      '...otttto...',
      '...obbbbo...',
      '...oooooo...',
    ],
    stepA: [
      '....oooo....',
      '...ohhhhho..',
      '..ohhhhhho..',
      '..ohhhhhho..',
      '..ohssssso..',
      '..ohsssseo..',
      '..ohssssso..',
      '...osssso...',
      '..occcccco..',
      '..occccclo..',
      '..occcccclo.',
      '..occaacclo.',
      '..occcccccgo',
      '..odccccdo..',
      '..otttttto..',
      '.ottoo.otto.',
      '.obbo..obbo.',
      '.oooo..oooo.',
    ],
    stepB: [
      '....oooo....',
      '...ohhhhho..',
      '..ohhhhhho..',
      '..ohhhhhho..',
      '..ohssssso..',
      '..ohsssseo..',
      '..ohssssso..',
      '...osssso...',
      '..occcccco..',
      '.ogccccclo..',
      '..occccclo..',
      '..occaaclo..',
      '..occcccco..',
      '..odccccdo..',
      '..otttttto..',
      '..ottootto..',
      '..obboobbo..',
      '.oooo..oooo.',
    ],
  },
};

/* ============================================================
   ARCANE — 14 wide x 22 tall, hooded, long coat, rim-lit
   ============================================================ */

const ARCANE = {
  front: {
    stand: [
      '.....oooo.....',
      '....ohhhho....',
      '...ohhhhhho...',
      '..ohhhhhhhho..',
      '.orhhhhhhhhro.',
      '.ohhddddddhho.',
      '.ohhdeddedhho.',
      '.ohhddddddhho.',
      '..ohhhhhhhho..',
      '..occcccccco..',
      '.olccccccccdo.',
      '.olcccaacccdo.',
      '.olccccccccdo.',
      '.olccccccccdo.',
      '.ogccccccccgo.',
      '..odccccccdo..',
      '..occcccccco..',
      '..occcccccco..',
      '..odccccccdo..',
      '..otto..otto..',
      '..obbo..obbo..',
      '..oooo..oooo..',
    ],
    stepA: [
      '.....oooo.....',
      '....ohhhho....',
      '...ohhhhhho...',
      '..ohhhhhhhho..',
      '.orhhhhhhhhro.',
      '.ohhddddddhho.',
      '.ohhdeddedhho.',
      '.ohhddddddhho.',
      '..ohhhhhhhho..',
      '..occcccccco..',
      '.odcccccccclo.',
      '.odcccaaccclo.',
      '.odcccccccclo.',
      '..ogccccccgo..',
      '..occcccccco..',
      '..odccccccdo..',
      '..occcccccco..',
      '..occcccccco..',
      '..odccccccdo..',
      '.otto....otto.',
      '.obbo....obbo.',
      '.oooo....oooo.',
    ],
  },
  back: {
    stand: [
      '.....oooo.....',
      '....ohhhho....',
      '...ohhhhhho...',
      '..ohhhhhhhho..',
      '.orhhhhhhhhro.',
      '.ohhhhhhhhhho.',
      '.ohhhhhhhhhho.',
      '.ohhhhhhhhhho.',
      '..ohhhhhhhho..',
      '..occcccccco..',
      '.odccccccccdo.',
      '.odccccccccdo.',
      '.odccccccccdo.',
      '.odccccccccdo.',
      '.ogccccccccgo.',
      '..odccccccdo..',
      '..occcccccco..',
      '..occcccccco..',
      '..odccccccdo..',
      '..otto..otto..',
      '..obbo..obbo..',
      '..oooo..oooo..',
    ],
    stepA: [
      '.....oooo.....',
      '....ohhhho....',
      '...ohhhhhho...',
      '..ohhhhhhhho..',
      '.orhhhhhhhhro.',
      '.ohhhhhhhhhho.',
      '.ohhhhhhhhhho.',
      '.ohhhhhhhhhho.',
      '..ohhhhhhhho..',
      '..occcccccco..',
      '.olccccccccdo.',
      '.olccccccccdo.',
      '.olccccccccdo.',
      '..ogccccccgo..',
      '..occcccccco..',
      '..odccccccdo..',
      '..occcccccco..',
      '..occcccccco..',
      '..odccccccdo..',
      '.otto....otto.',
      '.obbo....obbo.',
      '.oooo....oooo.',
    ],
  },
  side: {
    stand: [
      '.....oooo.....',
      '....ohhhhho...',
      '...ohhhhhhho..',
      '..ohhhhhhhhro.',
      '..ohhhhhhhhro.',
      '..ohhhddddhho.',
      '..ohhhdddedho.',
      '..ohhhddddhho.',
      '...ohhhhhhho..',
      '...occccccco..',
      '...occccccclo.',
      '...occcaacclo.',
      '...occccccclo.',
      '...occccccclo.',
      '...occcccccgo.',
      '...odcccccdo..',
      '...occccccco..',
      '...occccccco..',
      '...odcccccdo..',
      '.....otttto...',
      '.....obbbbo...',
      '.....oooooo...',
    ],
    stepA: [
      '.....oooo.....',
      '....ohhhhho...',
      '...ohhhhhhho..',
      '..ohhhhhhhhro.',
      '..ohhhhhhhhro.',
      '..ohhhddddhho.',
      '..ohhhdddedho.',
      '..ohhhddddhho.',
      '...ohhhhhhho..',
      '...occccccco..',
      '...occccccclo.',
      '...occcaaccclo',
      '...occccccccgo',
      '...occccccclo.',
      '...occccccco..',
      '...odcccccdo..',
      '...occccccco..',
      '...occccccco..',
      '...odcccccdo..',
      '..otto...otto.',
      '..obbo...obbo.',
      '..oooo...oooo.',
    ],
    stepB: [
      '.....oooo.....',
      '....ohhhhho...',
      '...ohhhhhhho..',
      '..ohhhhhhhhro.',
      '..ohhhhhhhhro.',
      '..ohhhddddhho.',
      '..ohhhdddedho.',
      '..ohhhddddhho.',
      '...ohhhhhhho..',
      '...occccccco..',
      '..ogccccccclo.',
      '...occcaacclo.',
      '...occccccco..',
      '...occccccco..',
      '...occccccco..',
      '...odcccccdo..',
      '...occccccco..',
      '...occccccco..',
      '...odcccccdo..',
      '....otto.otto.',
      '....obbo.obbo.',
      '....oooo.oooo.',
    ],
  },
};

/* ============================================================
   HEAD KITS — override rows 0..3 (front/side) or 0..5 (back)
   ============================================================ */

/**
 * A kit replaces the top of the head so nineteen figures with one body
 * still read as nineteen people. Rows are full 12-wide strings; `null`
 * keeps the base row. `extra` paints on top of the composed frame after
 * the kit: [[row, col, slot], ...] per facing.
 */
const KITS = {
  hair:    { front: null, side: null, back: null },
  cap: {
    front: ['....oooo....', '...okkkko...', '..okkkkkko..', '.oaaaaaaaao.'],
    side:  ['....oooo....', '...okkkkko..', '..okkkkkkoo.', '..okkkkaaao.'],
    back:  ['....oooo....', '...okkkko...', '..okkkkkko..', '..okkkkkko..', '..ohhhhhho..', '..ohhhhhho..'],
  },
  beanie: {
    front: ['....oooo....', '...oaaaao...', '..okkkkkko..', '..okkkkkko..'],
    side:  ['....oooo....', '...oaaaao...', '..okkkkkko..', '..okkkkkko..'],
    back:  ['....oooo....', '...oaaaao...', '..okkkkkko..', '..okkkkkko..', '..ohhhhhho..', '..ohhhhhho..'],
  },
  visor: {
    front: null, side: null, back: null,
    extra: { front: [[5, 3, 'e'], [5, 4, 'e'], [5, 5, 'e'], [5, 6, 'e'], [5, 7, 'e'], [5, 8, 'e'], [4, 3, 'k'], [4, 8, 'k']],
             side:  [[5, 5, 'e'], [5, 6, 'e'], [5, 7, 'e'], [5, 8, 'e'], [4, 8, 'k']] },
  },
  headset: {
    front: null, side: null, back: null,
    extra: { front: [[2, 2, 'k'], [3, 2, 'k'], [4, 2, 'k'], [2, 9, 'k'], [3, 9, 'k'], [4, 9, 'k'], [6, 9, 'a'], [7, 9, 'a']],
             side:  [[2, 2, 'k'], [3, 2, 'k'], [4, 2, 'k'], [5, 2, 'k'], [6, 8, 'a'], [7, 9, 'a']],
             back:  [[2, 2, 'k'], [3, 2, 'k'], [2, 9, 'k'], [3, 9, 'k']] },
  },
  bald: {
    front: ['....oooo....', '...osssso...', '..osssssso..', '..osssssso..'],
    side:  ['....oooo....', '...ossssso..', '..osssssso..', '..osssssso..'],
    back:  ['....oooo....', '...osssso...', '..osssssso..', '..osssssso..', '..osssssso..', '..osssssso..'],
  },
  long: {
    front: null, side: null, back: null,
    extra: { front: [[4, 2, 'h'], [5, 2, 'h'], [6, 2, 'h'], [7, 2, 'h'], [4, 9, 'h'], [5, 9, 'h'], [6, 9, 'h'], [7, 9, 'h']],
             side:  [[4, 2, 'h'], [5, 2, 'h'], [6, 2, 'h'], [7, 2, 'h'], [4, 3, 'h']],
             back:  [[6, 3, 'h'], [6, 4, 'h'], [6, 5, 'h'], [6, 6, 'h'], [6, 7, 'h'], [6, 8, 'h'], [7, 4, 'h'], [7, 5, 'h'], [7, 6, 'h'], [7, 7, 'h']] },
  },
  goggles: {
    front: ['....oooo....', '...ohhhho...', '..okekkeko..', '..ohhhhhho..'],
    side:  ['....oooo....', '...ohhhhho..', '..okkkkeko..', '..ohhhhhho..'],
    back:  ['....oooo....', '...ohhhho...', '..okkkkkko..', '..ohhhhhho..', '..ohhhhhho..', '..ohhhhhho..'],
  },
  bandana: {
    front: ['....oooo....', '...oaaaao...', '..oaaaaaao..', '..ohhhhhho..'],
    side:  ['....oooo....', '...oaaaaao..', '..oaaaaaao..', '..ohhhhhhoa.'],
    back:  ['....oooo....', '...oaaaao...', '..oaaaaaao..', '..ohhhaaho..', '..ohhhaaho..', '..ohhhhaho..'],
  },
  hardhat: {
    front: ['....oooo....', '...oaaaao...', '..oaaaaaao..', '.oaaaaaaaao.'],
    side:  ['....oooo....', '...oaaaaao..', '..oaaaaaao..', '.oaaaaaaaao.'],
    back:  ['....oooo....', '...oaaaao...', '..oaaaaaao..', '.oaaaaaaaao.', '..ohhhhhho..', '..ohhhhhho..'],
  },
  bun: {
    front: ['...oooooo...', '..ohhhhhho..', '..ohhhhhho..', '..ohhhhhho..'],
    side:  ['....oooooo..', '...ohhhhhho.', '..ohhhhhhho.', '..ohhhhhho..'],
    back:  ['...oooooo...', '..ohhaahhho.', '..ohhhhhho..', '..ohhhhhho..', '..ohhhhhho..', '..ohhhhhho..'],
  },
  glasses: {
    front: null, side: null, back: null,
    extra: { front: [[5, 3, 'k'], [5, 4, 'e'], [5, 5, 'k'], [5, 6, 'k'], [5, 7, 'e'], [5, 8, 'k']],
             side:  [[5, 7, 'k'], [5, 8, 'e'], [5, 9, 'k']] },
  },
  monocle: {
    front: null, side: null, back: null,
    extra: { front: [[5, 7, 'e'], [4, 8, 'a'], [6, 8, 'a'], [7, 9, 'a']], side: [[5, 8, 'e'], [6, 9, 'a']] },
  },
  slick: {
    front: ['....oooo....', '...ohhhho...', '..ohhhhhho..', '..ohhlhhho..'],
    side:  ['....oooo....', '...ohhhhho..', '..ohhhhhhho.', '..ohhhlhho..'],
    back:  null,
  },
};

/* ============================================================
   HELD ITEMS — tiny overlays at the hand, per facing
   ============================================================ */

const ITEMS = {
  none:      {},
  vial:      { front: [[10, 10, 'w'], [11, 10, 'a'], [12, 10, 'a']], side: [[10, 9, 'w'], [11, 9, 'a'], [12, 9, 'a']] },
  clipboard: { front: [[10, 9, 'w'], [11, 9, 'w'], [12, 9, 'w'], [10, 10, 'w'], [11, 10, 'k'], [12, 10, 'w']], side: [[10, 9, 'w'], [11, 9, 'w'], [12, 9, 'w'], [11, 10, 'w']] },
  ledger:    { front: [[11, 9, 'k'], [12, 9, 'k'], [11, 10, 'a'], [12, 10, 'a']], side: [[11, 9, 'k'], [12, 9, 'k'], [11, 10, 'a'], [12, 10, 'a']] },
  tablet:    { front: [[10, 9, 'k'], [11, 9, 'e'], [12, 9, 'k'], [10, 10, 'k'], [11, 10, 'e'], [12, 10, 'k']], side: [[10, 9, 'k'], [11, 9, 'e'], [12, 9, 'k']] },
  wrench:    { front: [[9, 10, 'w'], [10, 10, 'w'], [11, 10, 'w'], [12, 10, 'w'], [9, 9, 'w']], side: [[9, 9, 'w'], [10, 9, 'w'], [11, 9, 'w'], [12, 9, 'w']] },
  quill:     { front: [[8, 10, 'w'], [9, 10, 'w'], [10, 10, 'w'], [11, 10, 'k']], side: [[8, 9, 'w'], [9, 9, 'w'], [10, 9, 'w'], [11, 9, 'k']] },
  lens:      { front: [[10, 9, 'k'], [10, 10, 'k'], [11, 9, 'e'], [11, 10, 'e']], side: [[10, 9, 'k'], [11, 9, 'e']] },
  bulb:      { front: [[9, 10, 'e'], [10, 10, 'e'], [11, 10, 'k']], side: [[9, 9, 'e'], [10, 9, 'e'], [11, 9, 'k']] },
  tray:      { front: [[11, 8, 'w'], [11, 9, 'w'], [11, 10, 'w'], [11, 11, 'w'], [10, 9, 'a'], [10, 10, 'a']], side: [[11, 8, 'w'], [11, 9, 'w'], [11, 10, 'w'], [10, 9, 'a']] },
  scroll:    { front: [[10, 10, 'w'], [11, 10, 'w'], [12, 10, 'w'], [11, 9, 'k']], side: [[10, 9, 'w'], [11, 9, 'w'], [12, 9, 'w']] },
  sextant:   { front: [[9, 10, 'a'], [10, 9, 'a'], [10, 10, 'k'], [11, 10, 'a']], side: [[9, 9, 'a'], [10, 9, 'k'], [11, 9, 'a']] },
  mug:       { front: [[11, 10, 'w'], [12, 10, 'w'], [11, 11, 'a']], side: [[11, 9, 'w'], [12, 9, 'w'], [11, 10, 'a']] },
};

/* ============================================================
   IDENTITY — per agent: kit, hair, skin, item, accent
   ============================================================ */

const SKIN = ['#e7c9a8', '#d9b48f', '#c99a6e', '#b98a68', '#8d5f3f', '#6d4530'];
const HAIR = { black: '#15121a', brown: '#4a2f1d', chestnut: '#6b3a22', blond: '#c9a35a', grey: '#9a9aa8', white: '#e0e0ea', red: '#a3402a', auburn: '#7a3a22' };

export const IDENTITY = {
  arcane:   { kit: 'hood',    hair: 'black',    skin: 2, item: 'none',      accent: '#a98bff' },
  meridian: { kit: 'visor',   hair: 'black',    skin: 1, item: 'vial',      accent: '#ecebf5' },
  tally:    { kit: 'bun',     hair: 'chestnut', skin: 0, item: 'ledger',    accent: '#f2d27a' },
  vector:   { kit: 'cap',     hair: 'brown',    skin: 2, item: 'none',      accent: '#ecebf5' },
  herald:   { kit: 'headset', hair: 'blond',    skin: 0, item: 'clipboard', accent: '#f4d27a' },
  oracle:   { kit: 'glasses', hair: 'white',    skin: 3, item: 'scroll',    accent: '#9fe4ff' },
  lumen:    { kit: 'hair',    hair: 'auburn',   skin: 1, item: 'tablet',    accent: '#ecebf5' },
  anvil:    { kit: 'hardhat', hair: 'black',    skin: 4, item: 'wrench',    accent: '#ffd166' },
  scribe:   { kit: 'long',    hair: 'red',      skin: 0, item: 'quill',     accent: '#ecebf5' },
  keeper:   { kit: 'beanie',  hair: 'brown',    skin: 2, item: 'none',      accent: '#b8f0cf' },
  intel:    { kit: 'goggles', hair: 'grey',     skin: 3, item: 'lens',      accent: '#c9b3ff' },
  ledger:   { kit: 'bald',    hair: 'black',    skin: 5, item: 'ledger',    accent: '#ffb3d1' },
  envoy:    { kit: 'slick',   hair: 'black',    skin: 2, item: 'clipboard', accent: '#ffd8a8' },
  watch:    { kit: 'cap',     hair: 'brown',    skin: 1, item: 'sextant',   accent: '#9ad8f0' },
  guard:    { kit: 'cap',     hair: 'black',    skin: 4, item: 'none',      accent: '#ffd166' },
  venture:  { kit: 'bandana', hair: 'blond',    skin: 0, item: 'bulb',      accent: '#ecebf5' },
  forge:    { kit: 'goggles', hair: 'chestnut', skin: 3, item: 'wrench',    accent: '#e0d0ff' },
  steward:  { kit: 'monocle', hair: 'grey',     skin: 1, item: 'scroll',    accent: '#f2d27a' },
  host:     { kit: 'long',    hair: 'auburn',   skin: 0, item: 'tray',      accent: '#ecebf5' },
};

/* ============================================================
   COLOUR HELPERS
   ============================================================ */

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
function mix(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
  return hex((ch(16) << 16) | (ch(8) << 8) | ch(0));
}
const shade = (c, t) => mix(c, '#05050a', t);
const tint = (c, t) => mix(c, '#ffffff', t);

/** The palette an agent paints with. Everything hangs off its own colour. */
export function paletteFor(agent) {
  const id = IDENTITY[agent.id] || IDENTITY.keeper;
  const c = agent.colour;
  return {
    o: '#0b0b12', c, d: shade(c, 0.38), l: tint(c, 0.32),
    s: SKIN[id.skin], e: agent.kind === 'arcane' ? '#c9b3ff' : '#e8f4ff',
    h: id.kit === 'hood' ? shade(c, 0.55) : HAIR[id.hair],
    t: '#2c2c46', b: '#4a4a66', k: '#1b1b28', a: id.accent, w: '#ecebf5', g: SKIN[id.skin],
    r: tint(c, 0.6),
  };
}

/* ============================================================
   COMPOSE + BAKE
   ============================================================ */

const FACINGS = ['front', 'back', 'side'];
const CELS = ['stand', 'stepA', 'stepB'];

function mirror(rows) { return rows.map((r) => r.split('').reverse().join('')); }

/** The raw matrix for a body/facing/cel, deriving stepB where the body has none. */
function baseFrame(body, facing, cel) {
  const f = body[facing];
  if (cel === 'stepB' && !f.stepB) return mirror(f.stepA);
  return f[cel];
}

/** Compose one frame for an agent: body → head kit → kit extras → held item. */
export function composeFrame(agent, facing, cel) {
  const id = IDENTITY[agent.id] || IDENTITY.keeper;
  const body = agent.kind === 'arcane' ? ARCANE : CREW;
  const rows = baseFrame(body, facing, cel).map((r) => r.split(''));
  if (agent.kind !== 'arcane') {
    const kit = KITS[id.kit] || KITS.hair;
    const top = kit[facing];
    if (top) top.forEach((r, i) => { rows[i] = r.split(''); });
    for (const [r, c, slot] of kit.extra?.[facing] || []) if (rows[r]?.[c] !== undefined) rows[r][c] = slot;
    for (const [r, c, slot] of ITEMS[id.item]?.[facing] || []) if (rows[r]?.[c] !== undefined) rows[r][c] = slot;
  }
  return rows.map((r) => r.join(''));
}

/** Every matrix must be a rectangle of the body's size. Run by the test and at bake. */
export function validateBody(name, body, w, h) {
  const problems = [];
  for (const facing of FACINGS) for (const cel of CELS) {
    const rows = baseFrame(body, facing, cel);
    if (rows.length !== h) problems.push(`${name}.${facing}.${cel}: ${rows.length} rows, expected ${h}`);
    rows.forEach((r, i) => { if (r.length !== w) problems.push(`${name}.${facing}.${cel} row ${i}: ${r.length} wide, expected ${w} — "${r}"`); });
  }
  return problems;
}
export function validateKits() {
  const problems = [];
  for (const [name, kit] of Object.entries(KITS)) for (const facing of FACINGS) {
    const top = kit[facing];
    if (top) top.forEach((r, i) => { if (r.length !== 12) problems.push(`kit ${name}.${facing} row ${i}: ${r.length} wide — "${r}"`); });
  }
  return problems;
}
export const BODIES = { crew: { body: CREW, w: 12, h: 18 }, arcane: { body: ARCANE, w: 14, h: 22 } };

/**
 * Bake every agent's frames to offscreen canvases. Returns
 *   Map<agentId, { w, h, frames: { front|back|left|right: [stand, stepA, stepB] } }>
 * Left is right mirrored at bake, so nothing is drawn twice.
 */
export function bakeSprites(agents) {
  const problems = [...validateBody('crew', CREW, 12, 18), ...validateBody('arcane', ARCANE, 14, 22), ...validateKits()];
  if (problems.length) throw new Error('sprite matrices invalid:\n' + problems.join('\n'));
  const baked = new Map();
  for (const a of agents) {
    const { w, h } = agent(a);
    const pal = paletteFor(a);
    const frames = { front: [], back: [], right: [], left: [] };
    for (const facing of FACINGS) for (const cel of CELS) {
      const rows = composeFrame(a, facing, cel);
      const cv = paint(rows, w, h, pal);
      if (facing === 'side') { frames.right.push(cv); frames.left.push(paint(mirror(rows), w, h, pal)); }
      else frames[facing].push(cv);
    }
    baked.set(a.id, { w, h, frames });
  }
  return baked;
}
const agent = (a) => (a.kind === 'arcane' ? BODIES.arcane : BODIES.crew);

function paint(rows, w, h, pal) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const slot = rows[y][x];
    if (slot === '.') continue;
    g.fillStyle = pal[slot] || '#ff00ff';
    g.fillRect(x, y, 1, 1);
  }
  return cv;
}
