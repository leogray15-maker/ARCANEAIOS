/**
 * THE AGENT GARAGE — where the AI agents are switched on, scheduled, run,
 * watched and crafted.
 *
 *   #garage           every agent: on or off, schedule, run now, last run
 *                     (status, model, cost, duration, error); what waits for
 *                     review; this month's spend by model; craft an agent
 *   #garage/<id>      one agent's run history
 *
 * Everything comes from /api/ai (packages/agents, packages/ai). A provider
 * being down shows as a failed run with its reason; it never takes the
 * floor down with it.
 */
import { ROOM_BY_ID, ROOMS } from '@arcane/config';
import { api } from '../core/api.js';
import { esc, chip, when, stampFull, loading, failed, empty, handleKeyForm } from './ui.js';

const st = { data: null, personas: null, history: {}, error: null, loadedAt: 0, busy: {}, flash: null, crafting: false };
let el = null, go = null;

const RUN_TONE = { ok: 'vital', running: 'cyan', failed: 'deny', refused: 'flare', skipped: 'ash' };
const gbp = (n) => (Number(n) ? `£${Number(n) < 0.01 ? Number(n).toFixed(4) : Number(n).toFixed(2)}` : '£0');
const secs = (ms) => (ms === null || ms === undefined ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

export function bindGarage(view, ctx) {
  el = view; go = ctx.go;
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('change', onChange);
}
export function renderGarage(view, ctx, hash = '#garage', { keepScroll = false } = {}) {
  el = view;
  if ((!st.data && !st.error) || Date.now() - st.loadedAt > 30_000) load();
  const id = /^#garage\/([a-z0-9-]+)/.exec(hash)?.[1];
  if (id && !st.history[id]) loadHistory(id);
  paint(hash, { keepScroll });
}

async function load() {
  st.loadedAt = Date.now();
  try { st.data = await api.ai.agents(); st.error = null; } catch (e) { st.error = e; }
  try { st.review = (await api.ai.outputs({ status: 'pending', limit: 50 })).outputs.filter((o) => o.type !== 'summary' || o.data?.withheld); } catch { st.review = null; }
  paint(location.hash, { keepScroll: true });
}
async function loadHistory(id) {
  st.history[id] = { loading: true };
  try { st.history[id] = { runs: (await api.ai.runs(id, 50)).runs }; } catch (e) { st.history[id] = { error: e }; }
  paint(location.hash, { keepScroll: true });
}
async function loadPersonas() {
  try { st.personas = (await api.get('/api/ai', { view: 'personas' })).personas; } catch (e) { st.personas = { error: e }; }
  paint(location.hash, { keepScroll: true });
}

function paint(hash, { keepScroll = false } = {}) {
  if (!el) return;
  const scroll = keepScroll ? el.scrollTop : 0;
  const id = /^#garage\/([a-z0-9-]+)/.exec(hash || '')?.[1];
  const d = st.data;
  el.innerHTML = `<div class="wrap app garage">
    <div class="view-head">
      <button class="back ghost" data-act="${id ? 'garage' : 'back'}">← ${id ? 'Garage' : 'Floor'}</button>
      <h1>THE AGENT GARAGE</h1>
      <span class="sub">build · run · watch</span>
      <span class="spacer"></span>
      ${d ? `${d.paid.allowed ? chip(`paid models on · budget £${d.paid.budgetGbp}`, 'flare') : chip('free models only', 'vital')} <span class="ash">${esc(d.usage.month)} · ${gbp(d.usage.gbp)} spent · ${d.usage.calls} calls${d.usage.failed ? ` · ${d.usage.failed} failed` : ''}</span>` : ''}
      <button class="tiny ghost" data-act="reload">refresh</button>
    </div>
    ${st.flash ? `<p class="flash ${st.flash.tone === 'breach' ? 'breach' : ''}">${st.flash.html}</p>` : ''}
    ${st.error ? failed(st.error, { retry: 'reload' }) : !d ? loading('the agents') : id ? historyView(d, id) : listView(d)}
  </div>`;
  el.scrollTop = scroll;
}

function listView(d) {
  return `<section>
      <h2>Agents <span class="faint">${d.agents.length} · a switched-off agent never runs, on schedule or by hand</span></h2>
      ${d.agents.length ? `<table class="grid garage-table"><thead><tr><th>Agent</th><th>On</th><th>Schedule (UTC)</th><th>Models</th><th>Last run</th><th></th></tr></thead><tbody>${d.agents.map(agentRow).join('')}</tbody></table>` : empty('No agents defined.')}
      <p class="src">Schedules are 5-field cron in UTC. Vercel wakes /api/tick daily at 03:00; the hourly GitHub Actions scheduler runs anything due in between once CRON_SECRET and ARCANE_URL are set there.</p>
    </section>
    ${reviewBlock()}
    ${usageBlock(d)}
    ${craftBlock()}`;
}

function agentRow(a) {
  const r = a.lastRun;
  const busy = st.busy[a.id];
  const room = ROOM_BY_ID[a.room];
  const runCell = a.disabled ? `<span class="flare">${esc(a.disabled)}</span>`
    : r ? `${chip(r.status, RUN_TONE[r.status] || 'ash')}<span class="ash">${when(r.started_at)} · ${esc(r.model || '—')} · ${gbp(r.cost_gbp)} · ${secs(r.duration_ms)}${r.trigger ? ` · ${esc(r.trigger)}` : ''}</span>${r.error ? `<br><span class="breach">${esc(String(r.error).slice(0, 160))}</span>` : ''}`
    : '<span class="faint">never run</span>';
  const action = a.disabled ? '' : a.takesInput ? `<a class="button-link" href="#${esc(a.room)}">ask →</a>`
    : `<button class="tiny ${busy ? '' : 'primary'}" data-act="run" data-id="${esc(a.id)}" ${busy || !a.enabled || a.running ? 'disabled' : ''} title="${a.enabled ? '' : 'switch it on first'}">${busy ? 'running…' : a.running ? 'in flight' : 'Run now'}</button>`;
  return `<tr>
    <td><b>${esc(a.name)}</b>${a.crafted ? ' ' + chip('crafted', 'arcane') : ''}<br><a class="faint" href="#room/${esc(a.room)}">${esc(room?.name || a.room)}</a> <span class="faint">· ${esc(a.owner.toUpperCase())}</span><br><span class="ash small">${esc(a.description).slice(0, 140)}</span></td>
    <td><button class="chip ${a.enabled ? 'vital' : 'ash'}" data-act="toggle" data-id="${esc(a.id)}" ${a.disabled ? 'disabled' : ''}>${a.enabled ? 'on' : 'off'}</button></td>
    <td><form class="inline" data-act="schedule" data-id="${esc(a.id)}"><input name="schedule" value="${esc(a.schedule)}" placeholder="manual" style="width:110px" ${a.disabled ? 'disabled' : ''}><button class="tiny ghost" type="submit" ${a.disabled ? 'disabled' : ''}>save</button></form></td>
    <td class="ash">${esc(a.model ? `named: ${a.model}` : `tier: ${a.tier}`)}${a.fallbackTier ? ` → ${esc(a.fallbackTier)}` : ''}<br><span class="faint">≤ ${a.maxSteps} steps · ≤ ${gbp(a.budgetGbpPerRun)}/run</span></td>
    <td>${runCell}</td>
    <td class="nowrap">${action} <a class="faint" href="#garage/${esc(a.id)}">history</a>${a.crafted ? ` <button class="tiny ghost" data-act="remove" data-id="${esc(a.id)}">remove</button>` : ''}</td>
  </tr>`;
}

function historyView(d, id) {
  const a = d.agents.find((x) => x.id === id);
  if (!a) return empty(`No agent "${id}".`);
  const h = st.history[id];
  return `<section>
    <h2>${esc(a.name)} <span class="faint">run history</span></h2>
    <p class="ash">${esc(a.description)}</p>
    ${!h || h.loading ? loading('runs') : h.error ? failed(h.error) : h.runs.length ? `<table class="grid"><thead><tr><th>Run</th><th>Started</th><th>Trigger</th><th>Status</th><th>Model</th><th class="r">Steps</th><th class="r">Tokens</th><th class="r">Cost</th><th class="r">Took</th><th>Result</th></tr></thead><tbody>${h.runs.map((r) => `<tr>
      <td><code>${esc(r.id)}</code></td><td class="ash nowrap">${esc(stampFull(r.started_at))}</td><td class="ash">${esc(r.trigger || '—')}</td><td>${chip(r.status, RUN_TONE[r.status] || 'ash')}</td>
      <td class="ash">${esc(r.model || '—')}</td><td class="r">${r.steps ?? '—'}</td><td class="r">${(Number(r.usage?.in) || 0) + (Number(r.usage?.out) || 0)}</td><td class="r">${gbp(r.cost_gbp)}</td><td class="r">${secs(r.duration_ms)}</td>
      <td>${r.error ? `<span class="breach">${esc(r.error)}</span>` : `<span class="ash">${esc(r.output?.summary || '')}</span>`}</td></tr>`).join('')}</tbody></table>` : empty('Never run.')}
  </section>`;
}

function reviewBlock() {
  const list = st.review;
  if (!list) return '';
  return `<section>
    <h2>Waiting for review <span class="faint">${list.length} · outputs stay pending until you say otherwise</span></h2>
    ${list.length ? list.map((o) => `<div class="order-row"><span>${chip(o.type, 'arcane')}${chip(ROOM_BY_ID[o.room]?.name || o.room, 'ash')}</span><span class="text"><b>${esc(o.title)}</b><br><span class="ash">${esc(String(o.content).slice(0, 280))}</span></span><span class="faint nowrap">${when(o.created_at)}</span>
      <button class="tiny" data-act="review" data-id="${esc(o.id)}" data-status="approved">approve</button><button class="tiny ghost" data-act="review" data-id="${esc(o.id)}" data-status="rejected">reject</button></div>`).join('') : empty('Nothing waiting.')}
    <p class="src">Drafts wait in <a href="#beacon">BEACON</a>; verdicts in <a href="#council">THE COUNCIL</a>; summaries in <a href="#scriptorium">SCRIPTORIUM</a>.</p>
  </section>`;
}

function usageBlock(d) {
  const rows = Object.entries(d.usage.byModel).sort((a, b) => b[1].calls - a[1].calls);
  return `<section>
    <h2>Models this month <span class="faint">${esc(d.usage.month)} · every call, logged in model_usage</span></h2>
    ${rows.length ? `<table class="grid"><thead><tr><th>Model</th><th class="r">Calls</th><th class="r">Failed</th><th class="r">Tokens</th><th class="r">Spend</th></tr></thead><tbody>${rows.map(([m, u]) => `<tr><td>${esc(m)}</td><td class="r">${u.calls}</td><td class="r">${u.failed || ''}</td><td class="r">${u.tokens.toLocaleString('en-GB')}</td><td class="r">${gbp(u.gbp)}</td></tr>`).join('')}</tbody></table>` : empty('No model calls yet this month.')}
    <p class="src">${d.paid.allowed ? `Paid models are on, capped at £${d.paid.budgetGbp} a month (MONTHLY_BUDGET_GBP), checked before every paid call.` : 'Paid models are off: ALLOW_PAID_MODELS is not "true", so only free models are called, whatever an agent asks for.'}</p>
  </section>`;
}

function craftBlock() {
  if (!st.crafting) return `<section><h2>Craft an agent</h2><p class="ash">Start from a persona (from The Agency, MIT), give it a room, a tier and a standing task. It runs on the same runner as the rest: read-only tools, every output waiting for review.</p><button class="primary" data-act="craft-open">Craft an agent</button></section>`;
  const p = st.personas;
  if (!p) return `<section><h2>Craft an agent</h2>${loading('the persona library')}</section>`;
  if (p.error) return `<section><h2>Craft an agent</h2>${failed(p.error)}</section>`;
  return `<section><h2>Craft an agent <span class="faint">${p.length} personas</span></h2>
    <form class="craft" data-act="craft">
      <label class="field">Name<input name="agent_name" required minlength="3" maxlength="40" placeholder="X Radar"></label>
      <label class="field">Persona<select name="persona" required>${p.map((x) => `<option value="${esc(x.id)}" data-room="${esc(x.room)}" data-tier="${esc(x.tier)}">${esc(x.name)} — ${esc(x.description).slice(0, 90)}</option>`).join('')}</select></label>
      <label class="field">Room<select name="room">${ROOMS.map((r) => `<option value="${esc(r.id)}" ${r.id === p[0].room ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <label class="field">Tier<select name="tier">${['grunt', 'writer', 'thinker'].map((t) => `<option ${t === p[0].tier ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field">Standing task<textarea name="task" required minlength="10" maxlength="1000" rows="3" placeholder="What should it do each time it runs?"></textarea></label>
      <label class="field">Extra instructions (optional)<textarea name="instructions" maxlength="2000" rows="2"></textarea></label>
      <p class="ash">Tools: <label><input type="checkbox" name="tools" value="notion.search"> search the Archives</label> <label><input type="checkbox" name="tools" value="notion.readPage"> read a page</label> · saving its answer for review is always on.</p>
      <p><button class="primary" type="submit">Create (switched off)</button> <button class="ghost" type="button" data-act="craft-close">cancel</button></p>
    </form></section>`;
}

async function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'FORM') return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'back') return go('#');
  if (act === 'garage') return go('#garage');
  if (act === 'reload') { st.history = {}; return load(); }
  if (act === 'craft-open') { st.crafting = true; if (!st.personas) loadPersonas(); return paint(location.hash, { keepScroll: true }); }
  if (act === 'craft-close') { st.crafting = false; return paint(location.hash, { keepScroll: true }); }
  if (act === 'toggle') {
    const a = st.data.agents.find((x) => x.id === id);
    return act_(`${a.name} ${a.enabled ? 'off' : 'on'}`, () => api.ai.set(id, { enabled: !a.enabled }));
  }
  if (act === 'remove') { if (!confirm('Remove this crafted agent? Its runs and outputs stay in the record.')) return; return act_('removed', () => api.post('/api/ai', { action: 'remove', id })); }
  if (act === 'review') return act_(b.dataset.status, () => api.ai.review(id, b.dataset.status));
  if (act === 'run') {
    st.busy[id] = true; paint(location.hash, { keepScroll: true });
    try {
      const r = await api.ai.run(id);
      st.flash = { tone: 'vital', html: `<b>${esc(r.agent)}</b>: ${esc(r.summary || 'done')} · ${esc(r.model || '')} · ${gbp(r.costGbp)} · ${secs(r.durationMs)}` };
    } catch (err) {
      const body = err.body || {};
      st.flash = { tone: 'breach', html: `<b>${esc(id)}</b>: ${esc(err.message)}${body.runId ? ` <a href="#garage/${esc(id)}">run ${esc(body.runId)}</a>` : ''}` };
    }
    delete st.busy[id]; delete st.history[id];
    return load();
  }
}
async function act_(what, fn) {
  try { await fn(); st.flash = null; } catch (err) { st.flash = { tone: 'breach', html: `Could not ${esc(what)}: ${esc(err.message)}` }; }
  return load();
}
async function onSubmit(e) {
  const f = e.target; e.preventDefault();
  if (handleKeyForm(f, load)) return;
  if (f.dataset.act === 'schedule') return act_('save the schedule', () => api.ai.set(f.dataset.id, { schedule: f.schedule.value.trim() }));
  if (f.dataset.act === 'craft') {
    const tools = [...f.querySelectorAll('input[name=tools]:checked')].map((i) => i.value);
    const body = { action: 'craft', name: f.agent_name.value.trim(), persona: f.persona.value, room: f.room.value, tier: f.tier.value, task: f.task.value.trim(), instructions: f.instructions.value.trim(), tools };
    try { const r = await api.post('/api/ai', body); st.crafting = false; st.flash = { tone: 'vital', html: `<b>${esc(r.agent.name)}</b> created, switched off. Switch it on to run it.` }; }
    catch (err) { st.flash = { tone: 'breach', html: `Could not create it: ${esc(err.message)}` }; }
    return load();
  }
}
function onChange(e) {
  // Picking a persona suggests the room and tier it suits; either can still be changed.
  if (e.target.name !== 'persona') return;
  const opt = e.target.selectedOptions[0]; const f = e.target.form;
  if (opt?.dataset.room) f.room.value = opt.dataset.room;
  if (opt?.dataset.tier) f.tier.value = opt.dataset.tier;
}
