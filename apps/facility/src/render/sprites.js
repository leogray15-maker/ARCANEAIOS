/**
 * Pixel sprites — v2 bodies.
 *
 * Every agent is composed, not hand-drawn nineteen times: one crew body
 * (16x20) and one commander body (20x26), each in three facings with a
 * four-cel walk and a blink, plus a head kit and a held item per agent.
 * The palette does the rest — on the floor, colour is identity, so the
 * agent's own colour is the main tone and everything else hangs off it.
 *
 * Slots:
 *   .  transparent      o  outline         c  main colour     d  main, shaded
 *   l  main, lit        s  skin            e  eye / visor     h  hair or hat
 *   t  trousers         b  boots           k  accessory dark  a  accessory accent
 *   w  white            g  hand            u  undershirt      r  rim light (ARCANE)
 *
 * Facings: front, back, side (drawn facing right; left is mirrored at bake).
 * Cels: stand, blink, stepA (contact), stepB (pass), stepC (other contact).
 * Front and back stepC is stepA mirrored, which alternates the arm swing;
 * side has its own. The walk plays A → B → C → B. Blink replaces the eyes
 * on the stand cel for a few frames every few seconds.
 */

/* ============================================================
   CREW — 16 wide x 20 tall
   ============================================================ */

const CREW = {
  front: {
    stand: [
      '.....oooooo.....',
      '....ohhhhhho....',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '...ohhsssshho...',
      '...osssssssso...',
      '...oseesseeso...',
      '...osssssssso...',
      '....osssssso....',
      '.....osssso.....',
      '..oocccuucccoo..',
      '.olccccccccccdo.',
      '.olcccckkccccdo.',
      '.olcccckkccccdo.',
      '.ogcccckkccccgo.',
      '..oddkkaakkddo..',
      '..ottto..ottto..',
      '..ottto..ottto..',
      '..obbbo..obbbo..',
      '..ooooo..ooooo..',
    ],
    stepA: [
      '.....oooooo.....',
      '....ohhhhhho....',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '...ohhsssshho...',
      '...osssssssso...',
      '...oseesseeso...',
      '...osssssssso...',
      '....osssssso....',
      '.....osssso.....',
      '..oocccuucccoo..',
      '.odccccccccccl..',
      '.odcccckkcccclo.',
      '..dcccckkccccgo.',
      '..occcckkcccco..',
      '..oddkkaakkddo..',
      '.ottto...ottto..',
      '.ottto...obbbo..',
      '.obbbo...ooooo..',
      '.ooooo..........',
    ],
    stepB: [
      '.....oooooo.....',
      '....ohhhhhho....',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '...ohhsssshho...',
      '...osssssssso...',
      '...oseesseeso...',
      '...osssssssso...',
      '....osssssso....',
      '.....osssso.....',
      '..oocccuucccoo..',
      '.olccccccccccdo.',
      '.olcccckkccccdo.',
      '.ogcccckkccccgo.',
      '..occcckkcccco..',
      '..oddkkaakkddo..',
      '..ottto..ottto..',
      '..ottto..ottto..',
      '..obbbo..obbbo..',
      '..ooooo..ooooo..',
    ],
  },
  back: {
    stand: [
      '.....oooooo.....',
      '....ohhhhhho....',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '....ohhhhhho....',
      '....osssssso....',
      '.....osssso.....',
      '..oocckkkkccoo..',
      '.odccccccccccdo.',
      '.odccccccccccdo.',
      '.odccccccccccdo.',
      '.ogccccccccccgo.',
      '..oddkkkkkkddo..',
      '..ottto..ottto..',
      '..ottto..ottto..',
      '..obbbo..obbbo..',
      '..ooooo..ooooo..',
    ],
    stepA: [
      '.....oooooo.....',
      '....ohhhhhho....',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '....ohhhhhho....',
      '....osssssso....',
      '.....osssso.....',
      '..oocckkkkccoo..',
      '.olccccccccccd..',
      '.olccccccccccdo.',
      '..lccccccccccgo.',
      '..occcccccccco..',
      '..oddkkkkkkddo..',
      '.ottto...ottto..',
      '.ottto...obbbo..',
      '.obbbo...ooooo..',
      '.ooooo..........',
    ],
    stepB: [
      '.....oooooo.....',
      '....ohhhhhho....',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '...ohhhhhhhho...',
      '....ohhhhhho....',
      '....osssssso....',
      '.....osssso.....',
      '..oocckkkkccoo..',
      '.odccccccccccdo.',
      '.odccccccccccdo.',
      '.ogccccccccccgo.',
      '..occcccccccco..',
      '..oddkkkkkkddo..',
      '..ottto..ottto..',
      '..ottto..ottto..',
      '..obbbo..obbbo..',
      '..ooooo..ooooo..',
    ],
  },
  side: {
    stand: [
      '.....oooooo.....',
      '....ohhhhhhho...',
      '...ohhhhhhhhho..',
      '...ohhhhhhhhho..',
      '...ohhhhsssso...',
      '...ohhhssssso...',
      '...ohhhssseeo...',
      '...ohhhssssso...',
      '....ohhsssso....',
      '.....osssso.....',
      '....oocccccoo...',
      '....occccccclo..',
      '....occccckklo..',
      '....occccckklo..',
      '....occccccgo...',
      '....odkkaakdo...',
      '.....otttto.....',
      '.....otttto.....',
      '.....obbbbo.....',
      '.....oooooo.....',
    ],
    stepA: [
      '.....oooooo.....',
      '....ohhhhhhho...',
      '...ohhhhhhhhho..',
      '...ohhhhhhhhho..',
      '...ohhhhsssso...',
      '...ohhhssssso...',
      '...ohhhssseeo...',
      '...ohhhssssso...',
      '....ohhsssso....',
      '.....osssso.....',
      '....oocccccoo...',
      '....occccccclo..',
      '....occccckkclo.',
      '....occccckkcgo.',
      '....occccccco...',
      '....odkkaakdo...',
      '...ottto.ottto..',
      '..ottto...ottto.',
      '..obbbo...obbbo.',
      '..ooooo...ooooo.',
    ],
    stepB: [
      '.....oooooo.....',
      '....ohhhhhhho...',
      '...ohhhhhhhhho..',
      '...ohhhhhhhhho..',
      '...ohhhhsssso...',
      '...ohhhssssso...',
      '...ohhhssseeo...',
      '...ohhhssssso...',
      '....ohhsssso....',
      '.....osssso.....',
      '....oocccccoo...',
      '....occccccclo..',
      '....occccckklo..',
      '....occccckkgo..',
      '....occcccco....',
      '....odkkaakdo...',
      '.....otttto.....',
      '.....ottto......',
      '....obbbo.......',
      '....ooooo.......',
    ],
    stepC: [
      '.....oooooo.....',
      '....ohhhhhhho...',
      '...ohhhhhhhhho..',
      '...ohhhhhhhhho..',
      '...ohhhhsssso...',
      '...ohhhssssso...',
      '...ohhhssseeo...',
      '...ohhhssssso...',
      '....ohhsssso....',
      '.....osssso.....',
      '....oocccccoo...',
      '...ogccccccclo..',
      '....occccckklo..',
      '....occccckklo..',
      '....occccccco...',
      '....odkkaakdo...',
      '...ottto.ottto..',
      '..ottto...ottto.',
      '..obbbo...obbbo.',
      '..ooooo...ooooo.',
    ],
  },
};

/* ============================================================
   ARCANE — 20 wide x 26 tall, hooded cloak, sigil, rim-lit
   ============================================================ */

const ARCANE = {
  front: {
    stand: [
      '.......oooooo.......',
      '......orhhhhho......',
      '.....orhhhhhhho.....',
      '....orhhhhhhhhho....',
      '...orhhhhhhhhhhho...',
      '...ohhkkkkkkkkhho...',
      '...ohkkkkkkkkkkho...',
      '...ohkkeekkeekkho...',
      '...ohkkkkkkkkkkho...',
      '...ohhkkkkkkkkhho...',
      '....ohhhhhhhhhho....',
      '...occcccaaccccco...',
      '..olccccccccccccdo..',
      '..olcccdaaaadcccdo..',
      '..olcccdawwadcccdo..',
      '..olcccdaaaadcccdo..',
      '..ogcccckkkkccccgo..',
      '...odcccdccdcccdo...',
      '...olcccdccdcccdo...',
      '...olcccdccdcccdo...',
      '...olcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...oddddddddddddo...',
      '...ottto....ottto...',
      '...obbbo....obbbo...',
      '...ooooo....ooooo...',
    ],
    stepA: [
      '.......oooooo.......',
      '......orhhhhho......',
      '.....orhhhhhhho.....',
      '....orhhhhhhhhho....',
      '...orhhhhhhhhhhho...',
      '...ohhkkkkkkkkhho...',
      '...ohkkkkkkkkkkho...',
      '...ohkkeekkeekkho...',
      '...ohkkkkkkkkkkho...',
      '...ohhkkkkkkkkhho...',
      '....ohhhhhhhhhho....',
      '...occcccaaccccco...',
      '..odcccccccccccclo..',
      '..odcccdaaaadccclo..',
      '..odcccdawwadcccl...',
      '..odcccdaaaadcccgo..',
      '...occcckkkkcccco...',
      '...odcccdccdcccdo...',
      '...olcccdccdcccdo...',
      '...olcccdccdcccdo...',
      '...olcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...oddddddddddddo...',
      '..ottto......ottto..',
      '..ottto......obbbo..',
      '..obbbo......ooooo..',
    ],
    stepB: [
      '.......oooooo.......',
      '......orhhhhho......',
      '.....orhhhhhhho.....',
      '....orhhhhhhhhho....',
      '...orhhhhhhhhhhho...',
      '...ohhkkkkkkkkhho...',
      '...ohkkkkkkkkkkho...',
      '...ohkkeekkeekkho...',
      '...ohkkkkkkkkkkho...',
      '...ohhkkkkkkkkhho...',
      '....ohhhhhhhhhho....',
      '...occcccaaccccco...',
      '..olccccccccccccdo..',
      '..olcccdaaaadcccdo..',
      '..olcccdawwadcccdo..',
      '..ogcccdaaaadcccgo..',
      '...occcckkkkcccco...',
      '...odcccdccdcccdo...',
      '...olcccdccdcccdo...',
      '...olcccdccdcccdo...',
      '...olcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...oddddddddddddo...',
      '...ottto....ottto...',
      '...obbbo....obbbo...',
      '...ooooo....ooooo...',
    ],
  },
  back: {
    stand: [
      '.......oooooo.......',
      '......orhhhhho......',
      '.....orhhhhhhho.....',
      '....orhhhhhhhhho....',
      '...orhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '....ohhhhhhhhhho....',
      '...occcccccccccco...',
      '..odccccccccccccdo..',
      '..odcccccddcccccdo..',
      '..odcccccddcccccdo..',
      '..odcccccddcccccdo..',
      '..ogcccckkkkccccgo..',
      '...odcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...oddddddddddddo...',
      '...ottto....ottto...',
      '...obbbo....obbbo...',
      '...ooooo....ooooo...',
    ],
    stepA: [
      '.......oooooo.......',
      '......orhhhhho......',
      '.....orhhhhhhho.....',
      '....orhhhhhhhhho....',
      '...orhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '....ohhhhhhhhhho....',
      '...occcccccccccco...',
      '..olccccccccccccdo..',
      '..olcccccddcccccdo..',
      '..olcccccddcccccd...',
      '..olcccccddcccccgo..',
      '...occcckkkkcccco...',
      '...odcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...oddddddddddddo...',
      '..ottto......ottto..',
      '..ottto......obbbo..',
      '..obbbo......ooooo..',
    ],
    stepB: [
      '.......oooooo.......',
      '......orhhhhho......',
      '.....orhhhhhhho.....',
      '....orhhhhhhhhho....',
      '...orhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '...ohhhhhhhhhhhho...',
      '....ohhhhhhhhhho....',
      '...occcccccccccco...',
      '..odccccccccccccdo..',
      '..odcccccddcccccdo..',
      '..odcccccddcccccdo..',
      '..ogcccccddcccccgo..',
      '...occcckkkkcccco...',
      '...odcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...odcccdccdcccdo...',
      '...oddddddddddddo...',
      '...ottto....ottto...',
      '...obbbo....obbbo...',
      '...ooooo....ooooo...',
    ],
  },
  side: {
    stand: [
      '.......oooooo.......',
      '......orhhhhhho.....',
      '.....orhhhhhhhho....',
      '....orhhhhhhhhhho...',
      '....ohhhhhhhhhhho...',
      '....ohhhhkkkkkkho...',
      '....ohhhhkkkkkkkro..',
      '....ohhhhkkkkkeeko..',
      '....ohhhhkkkkkkkro..',
      '....ohhhhkkkkkkho...',
      '.....ohhhhhhhhho....',
      '.....occccccaaco....',
      '.....odccccccccclo..',
      '.....odcccaaaccclo..',
      '.....odcccawaccclo..',
      '.....odcccaaaccclo..',
      '.....odcckkkkccgo...',
      '.....odccdccdccdo...',
      '.....odccdccdcclo...',
      '.....odccdccdcclo...',
      '.....odccdccdcclo...',
      '.....odccdccdccdo...',
      '.....odddddddddo....',
      '.......otttto.......',
      '.......obbbbo.......',
      '.......oooooo.......',
    ],
    stepA: [
      '.......oooooo.......',
      '......orhhhhhho.....',
      '.....orhhhhhhhho....',
      '....orhhhhhhhhhho...',
      '....ohhhhhhhhhhho...',
      '....ohhhhkkkkkkho...',
      '....ohhhhkkkkkkkro..',
      '....ohhhhkkkkkeeko..',
      '....ohhhhkkkkkkkro..',
      '....ohhhhkkkkkkho...',
      '.....ohhhhhhhhho....',
      '.....occccccaaco....',
      '.....odccccccccclo..',
      '.....odcccaaacccclo.',
      '.....odcccawacccgo..',
      '.....odcccaaacccco..',
      '.....odcckkkkccco...',
      '.....odccdccdccdo...',
      '.....odccdccdcclo...',
      '.....odccdccdcclo...',
      '.....odccdccdcclo...',
      '.....odccdccdccdo...',
      '.....odddddddddo....',
      '.....ottto.ottto....',
      '....ottto...ottto...',
      '....ooooo...ooooo...',
    ],
    stepB: [
      '.......oooooo.......',
      '......orhhhhhho.....',
      '.....orhhhhhhhho....',
      '....orhhhhhhhhhho...',
      '....ohhhhhhhhhhho...',
      '....ohhhhkkkkkkho...',
      '....ohhhhkkkkkkkro..',
      '....ohhhhkkkkkeeko..',
      '....ohhhhkkkkkkkro..',
      '....ohhhhkkkkkkho...',
      '.....ohhhhhhhhho....',
      '.....occccccaaco....',
      '.....odccccccccclo..',
      '.....odcccaaaccclo..',
      '.....odcccawaccclo..',
      '.....odcccaaaccgo...',
      '.....odcckkkkcco....',
      '.....odccdccdccdo...',
      '.....odccdccdcclo...',
      '.....odccdccdcclo...',
      '.....odccdccdcclo...',
      '.....odccdccdccdo...',
      '.....odddddddddo....',
      '.......otttto.......',
      '......obbbbo........',
      '......oooooo........',
    ],
    stepC: [
      '.......oooooo.......',
      '......orhhhhhho.....',
      '.....orhhhhhhhho....',
      '....orhhhhhhhhhho...',
      '....ohhhhhhhhhhho...',
      '....ohhhhkkkkkkho...',
      '....ohhhhkkkkkkkro..',
      '....ohhhhkkkkkeeko..',
      '....ohhhhkkkkkkkro..',
      '....ohhhhkkkkkkho...',
      '.....ohhhhhhhhho....',
      '.....occccccaaco....',
      '....ogccccccccclo...',
      '.....odcccaaaccclo..',
      '.....odcccawaccclo..',
      '.....odcccaaaccclo..',
      '.....odcckkkkccgo...',
      '.....odccdccdccdo...',
      '.....odccdccdcclo...',
      '.....odccdccdcclo...',
      '.....odccdccdcclo...',
      '.....odccdccdccdo...',
      '.....odddddddddo....',
      '.....ottto.ottto....',
      '....ottto...ottto...',
      '....ooooo...ooooo...',
    ],
  },
};

/* ============================================================
   HEAD KITS — override rows 0..3 (rows 0..4 for bald); 16 wide
   ============================================================ */

const KITS = {
  hair: {},
  cap: {
    front: ['.....oooooo.....', '....okkkkkko....', '...okkkkkkkko...', '..oaaaaaaaaaao..'],
    side:  ['.....oooooo.....', '....okkkkkkko...', '...okkkkkkkkko..', '...okkkkkkaaaao.'],
    back:  ['.....oooooo.....', '....okkkkkko....', '...okkkkkkkko...', '...okkkkkkkko...'],
  },
  beanie: {
    front: ['.....oooooo.....', '....oaaaaaao....', '...okkkkkkkko...', '...okkkkkkkko...'],
    side:  ['.....oooooo.....', '....oaaaaaaao...', '...okkkkkkkkko..', '...okkkkkkkkko..'],
    back:  ['.....oooooo.....', '....oaaaaaao....', '...okkkkkkkko...', '...okkkkkkkko...'],
  },
  hardhat: {
    front: ['.....oooooo.....', '....oaaaaaao....', '...oaaaaaaaao...', '..oaaaaaaaaaao..'],
    side:  ['.....oooooo.....', '....oaaaaaaao...', '...oaaaaaaaaao..', '..oaaaaaaaaaaao.'],
    back:  ['.....oooooo.....', '....oaaaaaao....', '...oaaaaaaaao...', '..oaaaaaaaaaao..'],
  },
  bandana: {
    front: ['.....oooooo.....', '....oaaaaaao....', '...oaaaaaaaao...', '...ohhhhhhhho...'],
    side:  ['.....oooooo.....', '....oaaaaaaao...', '...oaaaaaaaaao..', '..aohhhhhhhhho..'],
    back:  ['.....oooooo.....', '....oaaaaaao....', '...oaaaaaaaao...', '...ohhhaahhho...'],
  },
  bun: {
    front: ['......oooo......', '.....ohhhho.....', '...ohhhhhhhho...', '...ohhhhhhhho...'],
    side:  ['....oooo........', '...ohhhho.......', '...ohhhhhhhhho..', '...ohhhhhhhhho..'],
    back:  ['......oooo......', '.....ohhhho.....', '...ohhhhhhhho...', '...ohhhhhhhho...'],
  },
  goggles: {
    front: ['.....oooooo.....', '....ohhhhhho....', '...okeekkeeko...', '...ohhhhhhhho...'],
    side:  ['.....oooooo.....', '....ohhhhhhho...', '...okkkkkkkeeko.', '...ohhhhhhhhho..'],
    back:  ['.....oooooo.....', '....ohhhhhho....', '...okkkkkkkko...', '...ohhhhhhhho...'],
  },
  slick: {
    front: ['.....oooooo.....', '....ohhhhhho....', '...ohhllhhhho...', '...ohhhhhhhho...'],
    side:  ['.....oooooo.....', '....ohhhhhhho...', '...ohhhhhhllho..', '...ohhhhhhhhho..'],
  },
  bald: {
    front: ['.....oooooo.....', '....osssssso....', '...osssssssso...', '...osssssssso...', '...osssssssso...'],
    side:  ['.....oooooo.....', '....ossssssso...', '...ossssssssso..', '...ossssssssso..', '...ossssssssso..'],
    back:  ['.....oooooo.....', '....osssssso....', '...osssssssso...', '...osssssssso...', '...osssssssso...'],
    rows: 5,
  },
  visor:   { extra: { front: [[6, 4, 'e'], [6, 5, 'e'], [6, 6, 'e'], [6, 7, 'e'], [6, 8, 'e'], [6, 9, 'e'], [6, 10, 'e'], [6, 11, 'e'], [5, 4, 'k'], [5, 11, 'k']], side: [[6, 7, 'e'], [6, 8, 'e'], [6, 9, 'e'], [6, 10, 'e'], [6, 11, 'e'], [5, 11, 'k']] } },
  headset: { extra: { front: [[2, 3, 'k'], [3, 3, 'k'], [4, 3, 'k'], [5, 3, 'k'], [2, 12, 'k'], [3, 12, 'k'], [4, 12, 'k'], [5, 12, 'k'], [7, 12, 'a'], [8, 12, 'a']], side: [[2, 3, 'k'], [3, 3, 'k'], [4, 3, 'k'], [5, 3, 'k'], [6, 3, 'k'], [7, 11, 'a'], [8, 12, 'a']], back: [[2, 3, 'k'], [3, 3, 'k'], [2, 12, 'k'], [3, 12, 'k'], [1, 5, 'k'], [1, 10, 'k']] } },
  glasses: { extra: { front: [[6, 4, 'k'], [6, 5, 'e'], [6, 6, 'e'], [6, 7, 'k'], [6, 8, 'k'], [6, 9, 'e'], [6, 10, 'e'], [6, 11, 'k']], side: [[6, 9, 'k'], [6, 10, 'e'], [6, 11, 'e'], [6, 12, 'k']] } },
  monocle: { extra: { front: [[6, 9, 'e'], [6, 10, 'e'], [5, 11, 'a'], [7, 11, 'a'], [8, 12, 'a'], [9, 12, 'a']], side: [[6, 10, 'e'], [6, 11, 'e'], [7, 12, 'a'], [8, 12, 'a']] } },
  long:    { extra: { front: [[4, 3, 'h'], [5, 3, 'h'], [6, 3, 'h'], [7, 3, 'h'], [8, 3, 'h'], [9, 4, 'h'], [4, 12, 'h'], [5, 12, 'h'], [6, 12, 'h'], [7, 12, 'h'], [8, 12, 'h'], [9, 11, 'h']], side: [[4, 3, 'h'], [5, 3, 'h'], [6, 3, 'h'], [7, 3, 'h'], [8, 3, 'h'], [9, 4, 'h'], [9, 5, 'h'], [4, 4, 'h']], back: [[8, 4, 'h'], [8, 5, 'h'], [8, 6, 'h'], [8, 7, 'h'], [8, 8, 'h'], [8, 9, 'h'], [8, 10, 'h'], [8, 11, 'h'], [9, 5, 'h'], [9, 6, 'h'], [9, 7, 'h'], [9, 8, 'h'], [9, 9, 'h'], [9, 10, 'h'], [10, 6, 'h'], [10, 7, 'h'], [10, 8, 'h'], [10, 9, 'h']] } },
};

/* ============================================================
   HELD ITEMS — overlays at the leading hand
   ============================================================ */

const ITEMS = {
  none:      {},
  vial:      { front: [[12, 13, 'w'], [13, 13, 'a'], [14, 13, 'a'], [12, 14, 'w'], [13, 14, 'a']], side: [[12, 11, 'w'], [13, 11, 'a'], [14, 11, 'a'], [12, 12, 'w'], [13, 12, 'a']] },
  clipboard: { front: [[12, 13, 'w'], [13, 13, 'w'], [14, 13, 'w'], [15, 13, 'w'], [12, 14, 'w'], [13, 14, 'k'], [14, 14, 'w'], [15, 14, 'k']], side: [[12, 11, 'w'], [13, 11, 'w'], [14, 11, 'w'], [15, 11, 'w'], [13, 12, 'k'], [14, 12, 'w']] },
  ledger:    { front: [[13, 13, 'k'], [14, 13, 'k'], [15, 13, 'k'], [13, 14, 'a'], [14, 14, 'a'], [15, 14, 'k']], side: [[13, 11, 'k'], [14, 11, 'k'], [15, 11, 'k'], [13, 12, 'a'], [14, 12, 'a']] },
  tablet:    { front: [[12, 13, 'k'], [13, 13, 'e'], [14, 13, 'e'], [15, 13, 'k'], [12, 14, 'k'], [13, 14, 'e'], [14, 14, 'e'], [15, 14, 'k']], side: [[12, 11, 'k'], [13, 11, 'e'], [14, 11, 'e'], [15, 11, 'k'], [13, 12, 'k']] },
  wrench:    { front: [[11, 14, 'w'], [12, 14, 'w'], [13, 14, 'w'], [14, 14, 'w'], [15, 14, 'w'], [11, 13, 'w'], [11, 15, 'w']], side: [[11, 12, 'w'], [12, 12, 'w'], [13, 12, 'w'], [14, 12, 'w'], [15, 12, 'w'], [11, 11, 'w'], [11, 13, 'w']] },
  quill:     { front: [[10, 14, 'w'], [11, 14, 'w'], [12, 13, 'w'], [13, 13, 'w'], [14, 13, 'k']], side: [[10, 12, 'w'], [11, 12, 'w'], [12, 11, 'w'], [13, 11, 'w'], [14, 11, 'k']] },
  lens:      { front: [[12, 13, 'k'], [12, 14, 'k'], [13, 13, 'e'], [13, 14, 'e'], [14, 13, 'k'], [14, 14, 'k']], side: [[12, 11, 'k'], [13, 11, 'e'], [13, 12, 'e'], [14, 11, 'k']] },
  bulb:      { front: [[11, 13, 'e'], [12, 13, 'e'], [11, 14, 'e'], [12, 14, 'e'], [13, 13, 'k'], [13, 14, 'k']], side: [[11, 11, 'e'], [12, 11, 'e'], [11, 12, 'e'], [12, 12, 'e'], [13, 11, 'k']] },
  tray:      { front: [[13, 11, 'w'], [13, 12, 'w'], [13, 13, 'w'], [13, 14, 'w'], [13, 15, 'w'], [12, 12, 'a'], [12, 13, 'a'], [12, 14, 'w']], side: [[13, 10, 'w'], [13, 11, 'w'], [13, 12, 'w'], [13, 13, 'w'], [12, 11, 'a'], [12, 12, 'w']] },
  scroll:    { front: [[12, 13, 'w'], [13, 13, 'w'], [14, 13, 'w'], [15, 13, 'w'], [13, 14, 'k'], [14, 14, 'k']], side: [[12, 11, 'w'], [13, 11, 'w'], [14, 11, 'w'], [15, 11, 'w'], [13, 12, 'k']] },
  sextant:   { front: [[11, 14, 'a'], [12, 13, 'a'], [12, 14, 'k'], [13, 13, 'a'], [13, 14, 'a'], [14, 14, 'a']], side: [[11, 12, 'a'], [12, 11, 'a'], [12, 12, 'k'], [13, 12, 'a'], [14, 12, 'a']] },
  mug:       { front: [[13, 13, 'w'], [14, 13, 'w'], [13, 14, 'w'], [14, 14, 'w'], [15, 13, 'a']], side: [[13, 11, 'w'], [14, 11, 'w'], [13, 12, 'w'], [14, 12, 'w'], [15, 11, 'a']] },
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
    s: SKIN[id.skin], e: agent.kind === 'arcane' ? '#d9c8ff' : '#eef6ff',
    h: id.kit === 'hood' ? shade(c, 0.42) : HAIR[id.hair],
    t: '#2c2c46', b: '#4a4a66', k: '#1b1b28', a: id.accent, w: '#ecebf5', g: SKIN[id.skin],
    u: '#c9c7d6', r: tint(c, 0.6),
  };
}

/* ============================================================
   COMPOSE + BAKE
   ============================================================ */

const FACINGS = ['front', 'back', 'side'];
export const CELS = ['stand', 'blink', 'stepA', 'stepB', 'stepC'];

function mirror(rows) { return rows.map((r) => r.split('').reverse().join('')); }

/** The raw matrix for a body/facing/cel, deriving what the body does not author. */
function baseFrame(body, facing, cel) {
  const f = body[facing];
  if (cel === 'blink') return f.stand.map((r, i) => (i >= 5 && i <= 8 ? r.replace(/e/g, 's') : r));
  if (cel === 'stepC' && !f.stepC) return mirror(f.stepA);
  if (cel === 'stepB' && !f.stepB) return f.stand;
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
    for (const [r, c, slot] of kit.extra?.[facing] || []) if (rows[r]?.[c] !== undefined && (cel !== 'blink' || slot !== 'e')) rows[r][c] = slot;
    if (cel === 'blink') for (const [r, c] of kit.extra?.[facing] || []) if (r >= 5 && r <= 8 && rows[r][c] === 'e') rows[r][c] = 'e';
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
    if (top) top.forEach((r, i) => { if (r.length !== 16) problems.push(`kit ${name}.${facing} row ${i}: ${r.length} wide — "${r}"`); });
  }
  return problems;
}
export const BODIES = { crew: { body: CREW, w: 16, h: 20 }, arcane: { body: ARCANE, w: 20, h: 26 } };

/**
 * Bake every agent's frames to offscreen canvases. Returns
 *   Map<agentId, { w, h, frames: { front|back|left|right: { stand, blink, stepA, stepB, stepC } } }>
 * Left is right mirrored at bake, so nothing is drawn twice.
 */
export function bakeSprites(agents) {
  const problems = [...validateBody('crew', CREW, 16, 20), ...validateBody('arcane', ARCANE, 20, 26), ...validateKits()];
  if (problems.length) throw new Error('sprite matrices invalid:\n' + problems.join('\n'));
  const baked = new Map();
  for (const a of agents) {
    const { w, h } = a.kind === 'arcane' ? BODIES.arcane : BODIES.crew;
    const pal = paletteFor(a);
    const frames = { front: {}, back: {}, right: {}, left: {} };
    for (const facing of FACINGS) for (const cel of CELS) {
      const rows = composeFrame(a, facing, cel);
      if (facing === 'side') { frames.right[cel] = paint(rows, w, h, pal); frames.left[cel] = paint(mirror(rows), w, h, pal); }
      else frames[facing][cel] = paint(rows, w, h, pal);
    }
    baked.set(a.id, { w, h, frames });
  }
  return baked;
}

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
