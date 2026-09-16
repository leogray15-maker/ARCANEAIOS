/**
 * The room dashboard. Every room renders the same four sections — State,
 * Orders, Crew, Files — so the operator never relearns a screen. In the
 * shell, State shows the room's widgets and resident from config; Orders
 * and Files read the brain once the vault export is wired (day 8).
 */
import { ROOM_BY_ID, AGENT_BY_ID, AGENTS, WING_BY_ID, VENTURE_BY_ID, CAPS, DASHBOARD_FRAME, SKILL_BY_ID } from '@arcane/config';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderPanel(el, roomId) {
  if (!roomId) {
    el.innerHTML = `
      <h1>THE ARCANE</h1>
      <div class="sub">LEOOS v3 · ${AGENTS.length} agents · 20 rooms · 4 wings</div>
      <p>Click a room. The commander walks there and its dashboard opens.</p>
      <h2>Standing rules</h2>
      <p>No agent holds <span class="chip deny">allow</span>. Spend is <span class="chip deny">deny</span> for everyone. Notion is read-only. Nothing publishes unattended.</p>
      <h2>Crew</h2>
      ${AGENTS.map((a) => `<p><span class="dot" style="background:${a.colour}"></span>${esc(a.name)} <span style="color:var(--ash)">· ${esc(a.role)} · ${esc(ROOM_BY_ID[a.room].name)}</span></p>`).join('')}`;
    return;
  }
  const room = ROOM_BY_ID[roomId];
  const wing = WING_BY_ID[room.wing];
  const agent = room.agent ? AGENT_BY_ID[room.agent] : null;
  const venture = room.venture ? VENTURE_BY_ID[room.venture] : null;
  const sections = {
    state: `
      <p>${esc(room.domain)}</p>
      ${venture ? `<p><span class="chip">${esc(venture.name)}</span> ${venture.facts.map((f) => `<span class="chip">${esc(f)}</span>`).join('')}</p>` : ''}
      <p>${room.widgets.map((w) => `<span class="chip">${esc(w)}</span>`).join('')}</p>`,
    orders: `<p class="empty">No orders routed here yet. Orders land from brain/06-Orders on day 8.</p>`,
    crew: agent ? `
      <p><span class="dot" style="background:${agent.colour}"></span><strong>${esc(agent.name)}</strong> · ${esc(agent.role)} · <code>${esc(agent.call)}</code></p>
      <p style="color:var(--ash)">${esc(agent.brief)}</p>
      <p>${CAPS.map((c) => `<span class="chip ${agent.caps[c.id]}">${esc(c.name)}: ${agent.caps[c.id]}</span>`).join('')}</p>
      ${agent.skills.length ? `<p>Skills: ${agent.skills.map((s) => `<span class="chip">${esc(SKILL_BY_ID[s].invoke)}</span>`).join('')}</p>` : ''}`
      : `<p class="empty">No resident. Nine seats convene here.</p>`,
    files: room.brain ? `<p><code>brain/${esc(room.brain)}</code></p><p class="empty">Newest files appear here once the vault export is wired (day 8).</p>` : `<p class="empty">This room reads shared memory only.</p>`,
  };
  el.innerHTML = `
    <h1>${esc(room.name)}</h1>
    <div class="sub">${esc(room.sub)} · ${esc(wing.name)}</div>
    ${DASHBOARD_FRAME.map((s) => `<h2>${esc(s.name)}</h2>${sections[s.id]}`).join('')}`;
}
