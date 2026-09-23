/**
 * The floor's lamps: each one lit by a real fact, in the right order.
 */
import assert from 'node:assert/strict';
import { roomStates } from '../src/core/roomstate.js';

const ids = ['a', 'b', 'c', 'd', 'e'];
const s = roomStates(ids, {
  signals: [{ room: 'a', severity: 'breach', text: 'COA missing' }, { room: 'a', severity: 'warn' }, { room: 'b', severity: 'warn', text: 'brief stale' }, { room: 'e', severity: 'info' }],
  proposals: [{ room: 'a' }, { room: 'c' }],
  open: (id) => (id === 'd' ? 2 : 0),
  working: (id) => id === 'd',
});

assert.equal(s.a.key, 'blocked', 'a breach outranks a proposal and a warning');
assert.equal(s.a.why, 'COA missing');
assert.equal(s.b.key, 'attention', 'a warning asks for the operator');
assert.equal(s.c.key, 'attention', 'a proposal asks for the operator');
assert.equal(s.c.why, '1 proposal waiting for you');
assert.equal(s.d.key, 'working', 'an agent at its station outranks open orders');
assert.equal(s.e.key, 'ok', 'an info signal does not light the lamp');
assert.equal(roomStates(['x'], { working: () => true }).x.key, 'ok', 'an agent at an empty desk is not work');
assert.equal(roomStates(['x']).x.key, 'ok', 'no facts, no lamp');
assert.equal(roomStates(['x'], { open: () => 1 }).x.key, 'active');

console.log('roomstate: ok');
