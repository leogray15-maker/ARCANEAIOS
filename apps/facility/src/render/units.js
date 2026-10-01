/**
 * An agent as an entity: who it is, what it is doing this second, where it
 * is, what it will do next, what it may touch.
 *
 * Every field comes from somewhere real — the roster and its grades from
 * @arcane/config, the state and location from the crew sim, the next
 * action from the top open order in the agent's own room. A working agent
 * looks lit; an idle one looks idle; nothing is animated that is not so.
 */
import { CAPS, ROOM_BY_ID, TOOL_BY_ID, SKILL_BY_ID } from '@arcane/config';
import { esc } from './widgets.js';

const PRIO = ['P0', 'P1', 'P2', 'P3'];
const CAP_SHORT = { data: 'READ', analyse: 'ANALYSE', write: 'DRAFT', spend: 'SPEND', publish: 'PUBLISH', contact: 'CONTACT', change: 'CHANGE' };
const GRADE_CLASS = { allow: 'allow', recommend: '', analyse: '', draft: '', approval: 'approval', ask: 'ask', deny: 'deny' };

/** What the sim says the agent is doing, as a state and a sentence. */
export function agentDoing(a, sim) {
  const s = sim?.byId[a.id];
  if (!s) return { state: 'idle', text: 'not on the floor' };
  if (s.working) return { state: 'working', text: `working at station in ${ROOM_BY_ID[s.room]?.name}` };
  if (s.state === 'walk') return { state: 'moving', text: `walking to ${ROOM_BY_ID[s.target]?.name || 'a room'}` };
  if (s.talking) return { state: 'moving', text: `in conversation in ${ROOM_BY_ID[s.room]?.name}` };
  if (s.room !== s.home) return { state: 'moving', text: `visiting ${ROOM_BY_ID[s.room]?.name}` };
  return { state: 'idle', text: `at ${ROOM_BY_ID[s.room]?.name}, not at the desk` };
}

export function agentUnit(a, { sim, store }) {
  const d = agentDoing(a, sim);
  const next = store ? store.openOrders(a.room).slice().sort((x, y) => x.p - y.p)[0] : null;
  const tools = (a.tools || []).map((t) => TOOL_BY_ID[t]).filter(Boolean);
  return `<div class="unit" data-state="${d.state}" style="--c:${a.colour}">
    <div class="unit-head">
      <span class="unit-glyph"></span>
      <span class="unit-name"><b>${esc(a.name)}</b><span>${esc(a.call)} · ${esc(a.role.toUpperCase())}</span></span>
      <span class="unit-state">${d.state}</span>
    </div>
    <dl>
      <dt>Now</dt><dd>${esc(d.text)}</dd>
      <dt>Next</dt><dd>${next ? `<span class="faint">${PRIO[next.p]}</span> ${esc(next.t)}` : '<span class="faint">no open order in its room</span>'}</dd>
      <dt>Station</dt><dd><a href="${esc(ROOM_BY_ID[a.room]?.opens || `#room/${a.room}`)}">${esc(ROOM_BY_ID[a.room]?.name || a.room)}</a>${a.council ? ' <span class="faint">· council seat</span>' : ''}</dd>
      <dt>Systems</dt><dd>${tools.length ? tools.map((t) => `<span class="${t.state === 'live' ? '' : 'faint'}" title="${esc(t.note)}">${esc(t.name)}</span>`).join(' · ') : '<span class="faint">none</span>'}</dd>
      ${a.skills?.length ? `<dt>Skills</dt><dd>${a.skills.map((s) => `<code>${esc(SKILL_BY_ID[s]?.invoke || s)}</code>`).join(' ')}</dd>` : ''}
    </dl>
    <div class="caps">${CAPS.map((c) => `<span class="cap ${GRADE_CLASS[a.caps[c.id]] ?? ''}" title="${esc(c.name)}: ${esc(a.caps[c.id])}">${CAP_SHORT[c.id]} ${esc(a.caps[c.id])}</span>`).join('')}</div>
  </div>`;
}
