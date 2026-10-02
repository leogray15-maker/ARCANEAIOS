/**
 * How each room is finished and dressed on the 3D floor.
 *
 * config/props.js says what furniture a room has and where; that is shared
 * with the pixel plan and the tests. This file is only what the 3D floor
 * adds on top: the room's floor and wall finish, the colour of its light,
 * what hangs from its ceiling, and set dressing placed in the floor space
 * the furniture leaves free (fume hood and safety shower in THE LAB, tool
 * chests and tyre racks in THE AGENT GARAGE, a bar in THE LOUNGE).
 * Placements use the same room-local [x, y, w, h] as props.js; a side-wall
 * piece names its wall in opts.side and uses y/h for its run along it.
 *
 * Nothing here changes what a room is or where the crew go.
 */
import { TONE } from './materials.js';

const P = (type, x, y, w, h, opts = {}) => ({ type, x, y, w, h, opts });

/**
 * floor   the floor material (default: the wing's)
 * lining  a finish over the inside of the walls: cladding (pale panels) or panel (dark metal)
 * light   the colour of the room's practical light (default: warm, tinted toward the room's accent)
 * pendants [x, y] points for hanging lamps; [] for none; absent for two over the middle of the room
 */
export const ROOM_STYLE = {
  apothecary: { floor: 'labfloor', lining: 'cladding', light: '#e8f1ff', pendants: [] },
  vitals: { lining: 'cladding', light: '#eef6f1' },
  forge: { floor: 'epoxy', lining: 'panel', light: '#ffdcbc', pendants: [[64, 66], [140, 66]] },
  market: { floor: 'timber', light: '#ffe2c6', pendants: [[40, 60], [104, 64], [160, 60]] },
  beacon: { floor: 'carpet', light: '#ffe8cc', pendants: [] },
  bridge: { pendants: [] },
  warroom: { pendants: [[98, 72], [124, 72]] },
  council: { pendants: [] },
  vault: { lining: 'panel' },
  scriptorium: { floor: 'carpet', pendants: [[70, 70]] },
  trading: { lining: 'panel', pendants: [[60, 70], [140, 70]] },
  intel: { lining: 'panel', light: '#d8e4ff' },
  observatory: { light: '#cfdcff', pendants: [[150, 60]] },
  dealroom: { pendants: [[92, 68]] },
  archives: { pendants: [[80, 72]] },
  lounge: { pendants: [[60, 70], [104, 70]] },
  garage: { floor: 'epoxy', lining: 'panel', light: '#f3ebdd', pendants: [] },
  control: { lining: 'panel', light: '#ffe0d8' },
  inventor: { pendants: [[60, 70]] },
  records: { pendants: [[62, 70]] },
  sanctum: { light: '#ffd9b4', pendants: [[52, 72], [150, 72]] },
};

export const DRESSING = {
  apothecary: [
    // A working laboratory: a ducted fume hood on the right wall, a sink and a safety shower against the back,
    // a service gantry over the benches with drops to them, tape round what must be kept clear.
    P('fumehood', 174, 74, 24, 34, { side: 'right' }),
    P('labsink', 150, 30, 24, 12),
    P('safetyshower', 182, 30, 8, 8),
    P('sharps', 168, 98, 5, 6),
    P('gantry', 40, 66, 148, 0, { drops: true, colour: '#eaf2ff' }),
    P('floorline', 8, 40, 66, 14, { dash: true }),
    P('floorline', 172, 72, 26, 38),
  ],
  garage: [
    // A workshop bay: the car in its painted box, the lift in its own, strip lights over both, the tools by the wall.
    P('floorline', 36, 62, 84, 40),
    P('floorline', 134, 54, 52, 50, { dash: true }),
    P('toolchest', 184, 70, 13, 10),
    P('barrel', 16, 30, 8, 12, { colour: '#2c3440', mark: '#c9a227' }),
    P('barrel', 25, 30, 8, 12, { colour: '#7a2a24', mark: '#d8d4ca' }),
    P('jack', 60, 102, 14, 6),
    P('diagcart', 12, 74, 9, 7),
    P('tyres', 26, 94, 10, 12, { n: 4 }),
    P('charger', 120, 54, 5, 4),
    P('wallrack', 0, 30, 0, 26, { side: 'right', items: 'tyres', base: 16 }),
  ],
  vitals: [
    P('console', 84, 42, 56, 7, { colour: 'vital' }),
    P('treadmill', 166, 76, 22, 12),
    P('watercooler', 164, 46, 6, 6),
    P('wallrack', 0, 30, 0, 14, { side: 'right', items: 'jars' }),
    P('wallrack', 0, 30, 0, 26, { side: 'left', items: 'boxes' }),
  ],
  forge: [
    P('toolchest', 160, 70, 14, 10),
    P('wallrack', 0, 40, 0, 16, { side: 'left', items: 'boxes' }),
    P('floorline', 8, 60, 50, 30, { dash: true }),
  ],
  market: [
    P('displaycase', 146, 46, 30, 10),
  ],
  beacon: [
    // A studio: foam on the walls, two softboxes on stands aimed at the desk, the ON AIR light over it.
    P('acoustic', 0, 30, 0, 27, { side: 'left' }),
    P('acoustic', 0, 30, 0, 18, { side: 'right' }),
    P('studiolight', 162, 64, 8, 10, { aim: -1.9 }),
    P('studiolight', 162, 94, 8, 10, { aim: -2.4 }),
    P('onair', 60, 20, 16, 5),
  ],
  bridge: [
    P('console', 40, 38, 132, 8),
    P('dais', 52, 58, 96, 36, { colour: TONE.violet }),
    P('ringlight', 100, 75, 30, 0, { y: 36, colour: '#cfc8ff' }),
  ],
  warroom: [
    P('wallrack', 0, 30, 0, 26, { side: 'right', items: 'binders' }),
  ],
  council: [
    P('ringlight', 106, 64, 36, 0, { y: 38, colour: '#ffd9a0' }),
    P('banner', 0, 30, 0, 12, { side: 'right', colour: '#3a2f6a' }),
    P('banner', 0, 44, 0, 12, { side: 'right', colour: '#4a2a30' }),
  ],
  vault: [
    P('pallet', 8, 96, 22, 12),
    P('floorline', 142, 42, 52, 34, { dash: true }),
    P('alarm', 118, 0, 4, 0, { colour: TONE.amber }),
  ],
  scriptorium: [
    P('wallrack', 0, 30, 0, 26, { side: 'right', items: 'books', tiers: 4, base: 8 }),
    P('bankerlamp', 56, 74, 0, 0, { on: 12 }),
  ],
  trading: [
    P('console', 10, 44, 60, 8, { colour: 'flare' }),
    P('watercooler', 186, 78, 6, 6),
  ],
  intel: [
    P('console', 128, 40, 44, 8),
    P('servers', 178, 70, 18, 22, { colour: 'arcane' }),
  ],
  observatory: [
    P('holo', 150, 70, 14, 14, { colour: 'cyan' }),
  ],
  dealroom: [
    P('armchair', 150, 76, 14, 14),
    P('armchair', 172, 76, 14, 14),
    P('plant', 188, 96, 8, 14),
  ],
  archives: [
    P('wallrack', 0, 30, 0, 14, { side: 'right', items: 'books', tiers: 4, base: 8 }),
    P('wallrack', 0, 34, 0, 22, { side: 'left', items: 'books', tiers: 4, base: 8 }),
    P('bankerlamp', 60, 74, 0, 0, { on: 12 }),
    P('bankerlamp', 98, 74, 0, 0, { on: 12 }),
  ],
  lounge: [
    P('bar', 140, 48, 40, 8),
    P('plant', 188, 96, 8, 14),
  ],
  control: [
    P('alarm', 60, 0, 4, 0),
    P('alarm', 140, 0, 4, 0),
    P('console', 40, 40, 100, 8, { colour: 'breach' }),
    P('servers', 8, 72, 16, 20, { colour: 'breach' }),
  ],
  inventor: [
    P('printer3d', 176, 62, 16, 20),
    P('wallrack', 0, 38, 0, 18, { side: 'right', items: 'boxes' }),
  ],
  records: [
    P('wallrack', 0, 40, 0, 16, { side: 'right', items: 'binders', tiers: 4, base: 8 }),
    P('cabinet', 170, 60, 12, 26),
    P('cabinet', 184, 60, 12, 26),
  ],
  sanctum: [
    P('wallrack', 0, 30, 0, 26, { side: 'right', items: 'jars' }),
  ],
};
