/**
 * Four wings. Each holds five rooms, and each room is a real domain of the
 * business or the life behind it. The order here is the order on the floor,
 * left to right.
 */
export const WINGS = [
  { id: 'production', no: 'C1', name: 'PRODUCTION',     sub: 'Make, stock, ship, signal',      accent: 'arcane' },
  { id: 'command',    no: 'C2', name: 'COMMAND',        sub: 'Decide, fund, write',            accent: 'gold' },
  { id: 'knowledge',  no: 'C3', name: 'KNOWLEDGE',      sub: 'Watch, learn, sell, rest',       accent: 'cyan' },
  { id: 'network',    no: 'C4', name: 'NETWORK & LIFE', sub: 'Agents, control, ideas, memory, the operator', accent: 'vital' },
];

export const WING_BY_ID = Object.fromEntries(WINGS.map((w) => [w.id, w]));
