/**
 * What each room's lamp says — pure, so the floor, the tooltip and the
 * tests read the same answer.
 *
 * A lamp is only ever lit by something real: a signal VIGIL raised against
 * the room, a proposal waiting for the operator, an open order, or the
 * resident agent standing at its station. Nothing here guesses; a room with
 * none of those is simply quiet.
 *
 * Precedence, most urgent first: blocked (a breach signal) → attention (a
 * proposal or a warning) → working (open orders, and its agent is at its
 * station) → active (open orders, nobody at the station) → ok. An agent
 * standing at an empty desk is not work, so it does not light the lamp.
 */

export const ROOM_STATES = {
  blocked:   { key: 'blocked',   word: 'BLOCKED',   colour: '#f44d52', pulse: true },
  attention: { key: 'attention', word: 'NEEDS YOU', colour: '#e8b64c', pulse: true },
  working:   { key: 'working',   word: 'WORKING',   colour: '#a98bff', pulse: false },
  active:    { key: 'active',    word: 'ACTIVE',    colour: '#56c9f0', pulse: false },
  ok:        { key: 'ok',        word: 'OK',        colour: '#3ecf8e', pulse: false },
};

/**
 * @param {string[]} roomIds
 * @param {{ signals?: {room:string, severity:string}[], proposals?: {room:string}[], open?: (id:string)=>number, working?: (id:string)=>boolean }} facts
 * @returns {Record<string, {key, word, colour, pulse, why: string}>}
 */
export function roomStates(roomIds, { signals = [], proposals = [], open = () => 0, working = () => false } = {}) {
  const out = {};
  for (const id of roomIds) {
    const breach = signals.filter((s) => s.room === id && s.severity === 'breach');
    const warn = signals.filter((s) => s.room === id && s.severity === 'warn');
    const asks = proposals.filter((p) => p.room === id).length;
    const n = open(id);
    let st, why;
    if (breach.length) { st = ROOM_STATES.blocked; why = breach[0].text || `${breach.length} breach signal${breach.length === 1 ? '' : 's'}`; }
    else if (asks || warn.length) { st = ROOM_STATES.attention; why = asks ? `${asks} proposal${asks === 1 ? '' : 's'} waiting for you` : warn[0].text || 'a warning signal'; }
    else if (n > 0 && working(id)) { st = ROOM_STATES.working; why = `${n} open order${n === 1 ? '' : 's'}, its agent at the station`; }
    else if (n > 0) { st = ROOM_STATES.active; why = `${n} open order${n === 1 ? '' : 's'}`; }
    else { st = ROOM_STATES.ok; why = 'nothing waiting'; }
    out[id] = { ...st, why };
  }
  return out;
}
